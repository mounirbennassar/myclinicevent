"""Member portal: healthcare professionals sign up once, then apply to any event with their saved details."""

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from sqlalchemy import case, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .. import services as svc
from ..audit import audit
from ..db import get_db
from ..emailer import queue_member_welcome_email, queue_registration_email
from ..errors import ApiError
from ..models import Event, MemberProfile, Registration, User
from ..ratelimit import check_rate
from ..schemas import MemberApplyIn, MemberProfileUpdate, MemberSignupIn, RegistrationIn, UserOut
from ..security import hash_password, require_roles, set_session_cookie

router = APIRouter(prefix="/member", tags=["member portal"])

require_member = require_roles("member")
MIN_PASSWORD_LENGTH = 10
PROFILE_FIELDS = ("mobile", "scfhs_number", "national_id", "profession")


def _profile(db: Session, user: User) -> MemberProfile:
    profile = db.scalar(select(MemberProfile).where(MemberProfile.user_id == user.id))
    if profile is None:
        raise ApiError(409, "profile_missing", "Your member profile is incomplete. Please contact the organisers.")
    return profile


def _claim_matching_registrations(db: Session, user: User, profile: MemberProfile) -> None:
    """Attach registrations this person made earlier with the public form.

    Email, ID number and mobile must all match: the same proof the public "find my pass" form asks for,
    so signing up never reveals a pass that the form wouldn't already hand over."""
    db.execute(
        update(Registration)
        .where(
            Registration.member_id.is_(None),
            Registration.email == user.email,
            Registration.national_id == profile.national_id,
            Registration.mobile == profile.mobile,
        )
        .values(member_id=user.id)
        .execution_options(synchronize_session=False)
    )


def _me_out(user: User, profile: MemberProfile) -> dict:
    return {
        "user": UserOut.model_validate(user).model_dump(mode="json"),
        "profile": {
            "full_name": user.full_name,
            "email": user.email,
            "mobile": profile.mobile,
            "scfhs_number": profile.scfhs_number,
            "national_id": profile.national_id,
            "profession": profile.profession,
            "sponsor_consent": profile.sponsor_consent,
            "member_since": user.created_at,
        },
    }


def _registration_out(reg: Registration | None) -> dict | None:
    if reg is None:
        return None
    issued = reg.certificate_issued_at is not None
    return {
        "id": reg.id,
        "ticket_code": reg.ticket_code,
        "access_token": reg.access_token,
        "pass_url": svc.pass_url(reg),
        "registered_at": reg.created_at,
        "certificate_issued": issued,
        "certificate_url": svc.certificate_url(reg) if issued else None,
    }


@router.post("/signup", status_code=201)
def signup(
    body: MemberSignupIn,
    request: Request,
    response: Response,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    check_rate(request, "member_signup", 10, 3600)
    clean, errors = svc.clean_registration_fields(body.model_dump())
    if len(body.password) < MIN_PASSWORD_LENGTH:
        errors["password"] = "password_short"
    if not body.consent:
        errors["consent"] = "consent_required"
    if errors:
        raise ApiError(422, "validation", "Please check the highlighted fields.", errors)
    if db.scalar(select(User.id).where(User.email == clean["email"])):
        raise ApiError(409, "account_exists", "An account with this email already exists. Sign in instead.",
                       {"email": "account_exists"})
    if db.scalar(select(MemberProfile.id).where(MemberProfile.national_id == clean["national_id"])):
        raise ApiError(409, "national_id_taken", "A member with this ID number already exists. Sign in instead.",
                       {"national_id": "national_id_taken"})
    user = User(
        email=clean["email"],
        full_name=clean["full_name"],
        role="member",
        password_hash=hash_password(body.password),
        is_active=True,
        must_change_password=False,
        token_version=0,
        last_login_at=svc.utcnow(),
    )
    try:
        with db.begin_nested():
            db.add(user)
            db.flush()
            profile = MemberProfile(
                user_id=user.id,
                consent_at=svc.utcnow(),
                sponsor_consent=body.sponsor_consent,
                **{key: clean[key] for key in PROFILE_FIELDS},
            )
            db.add(profile)
            db.flush()
    except IntegrityError:
        # Lost a race with an identical submission.
        raise ApiError(409, "account_exists", "An account with this email already exists. Sign in instead.",
                       {"email": "account_exists"}) from None
    _claim_matching_registrations(db, user, profile)
    audit(db, actor=user, action="member.signup", entity_type="user", entity_id=user.id, request=request)
    db.commit()
    set_session_cookie(response, user)
    queue_member_welcome_email(background, user)
    return _me_out(user, profile)


@router.get("/me")
def me(user: User = Depends(require_member), db: Session = Depends(get_db)):
    return _me_out(user, _profile(db, user))


@router.patch("/profile")
def update_profile(
    body: MemberProfileUpdate,
    request: Request,
    user: User = Depends(require_member),
    db: Session = Depends(get_db),
):
    profile = _profile(db, user)
    data = body.model_dump(exclude_unset=True)
    # The email is the sign-in name, so it isn't editable here.
    fields = {key: value for key, value in data.items() if key in svc.REGISTRATION_FIELDS and key != "email"}
    clean, errors = svc.clean_registration_fields(fields)
    if errors:
        raise ApiError(422, "validation", "Please check the highlighted fields.", errors)
    if "national_id" in clean and clean["national_id"] != profile.national_id:
        taken = db.scalar(
            select(MemberProfile.id).where(
                MemberProfile.national_id == clean["national_id"], MemberProfile.user_id != user.id
            )
        )
        if taken:
            raise ApiError(409, "national_id_taken", "Another member already uses this ID number.",
                           {"national_id": "national_id_taken"})
    if "full_name" in clean:
        user.full_name = clean["full_name"]
    for key in PROFILE_FIELDS:
        if key in clean:
            setattr(profile, key, clean[key])
    if data.get("sponsor_consent") is not None:
        profile.sponsor_consent = data["sponsor_consent"]
    audit(db, actor=user, action="member.profile_updated", entity_type="user", entity_id=user.id,
          details={"fields": sorted(data)}, request=request)
    db.commit()
    return _me_out(user, profile)


@router.get("/events")
def list_events(user: User = Depends(require_member), db: Session = Depends(get_db)):
    """Every published event, upcoming first, each with this member's registration if they have one."""
    profile = _profile(db, user)
    _claim_matching_registrations(db, user, profile)
    db.commit()
    now = svc.utcnow()
    mine = {
        reg.event_id: reg
        for reg in db.scalars(
            select(Registration).where(Registration.member_id == user.id, Registration.status != "cancelled")
        )
    }
    visible = Event.status == "published"
    if mine:
        # Keep showing an event I'm registered for after the team closes it. Drafts stay hidden.
        visible = or_(visible, (Event.id.in_(mine.keys())) & (Event.status != "draft"))
    events = db.scalars(
        select(Event)
        .options(selectinload(Event.sessions))
        .where(visible)
        .order_by(
            case((Event.ends_at >= now, 0), else_=1),
            case((Event.ends_at >= now, Event.starts_at)),
            Event.starts_at.desc(),
        )
    ).all()
    counts = svc.registered_counts(db, [e.id for e in events])
    return [
        {"event": svc.public_event_out(e, counts.get(e.id, 0), now), "registration": _registration_out(mine.get(e.id))}
        for e in events
    ]


@router.post("/events/{slug}/apply", status_code=201)
def apply_to_event(
    slug: str,
    body: MemberApplyIn,
    request: Request,
    response: Response,
    background: BackgroundTasks,
    user: User = Depends(require_member),
    db: Session = Depends(get_db),
):
    """Register for an event with the details saved on the member's profile. Safe to call twice."""
    check_rate(request, "member_apply", 60, 3600, str(user.id))
    profile = _profile(db, user)
    event = db.scalar(select(Event).where(Event.slug == slug, Event.status == "published"))
    if event is None:
        raise ApiError(404, "event_not_found", "We couldn't find that event.")
    # Lock the event row so concurrent sign-ups can't overshoot capacity.
    db.execute(select(Event.id).where(Event.id == event.id).with_for_update())
    _claim_matching_registrations(db, user, profile)
    existing = db.scalar(
        select(Registration).where(Registration.event_id == event.id, Registration.member_id == user.id)
    )
    if existing is not None:
        if existing.status == "cancelled":
            raise ApiError(409, "registration_cancelled",
                           "Your registration for this event was cancelled. Please contact the organisers.")
        db.commit()
        response.status_code = 200
        return {"registration": _registration_out(existing), "already_registered": True}
    state = svc.registration_state(event, svc.registered_count(db, event.id))
    if state != "open":
        raise ApiError(409, f"registration_{state}", svc.REGISTRATION_STATE_MESSAGES[state])
    data = RegistrationIn(
        full_name=user.full_name,
        email=user.email,
        mobile=profile.mobile,
        scfhs_number=profile.scfhs_number,
        national_id=profile.national_id,
        profession=profile.profession,
        consent=True,  # given at sign-up, for every event they choose to apply to
        sponsor_consent=profile.sponsor_consent if body.sponsor_consent is None else body.sponsor_consent,
    )
    try:
        reg = svc.create_registration(db, event, data, source="online")
    except ApiError as err:
        code = err.detail.get("code") if isinstance(err.detail, dict) else None
        if code == "duplicate":
            # Same email or ID number, but not all three details: we can't prove it's the same person.
            raise ApiError(409, "duplicate_unlinked",
                           "A registration with your email or ID number already exists for this event. "
                           "Use \"Find my pass\" on the event page, or contact the organisers.") from None
        if code == "validation":
            raise ApiError(422, "profile_invalid", "Some details on your profile need updating before you can apply.",
                           err.detail.get("fields")) from None
        raise
    reg.member_id = user.id
    audit(db, actor=user, action="registration.created", entity_type="registration", entity_id=reg.id,
          event_id=event.id, details={"source": "online", "via": "member_portal"}, request=request)
    db.commit()
    if queue_registration_email(background, reg, event):
        reg.email_sent_at = svc.utcnow()
        db.commit()
    return {"registration": _registration_out(reg), "already_registered": False}
