"""Unauthenticated endpoints: event page, registration, attendee pass, certificate, verification."""

from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, selectinload

from .. import services as svc
from ..audit import audit
from ..db import get_db
from ..emailer import queue_registration_email
from ..errors import ApiError
from ..models import Event, Registration, Sponsor, SponsorLead, User
from ..ratelimit import check_rate
from ..schemas import FindPassIn, RegistrationIn
from ..security import access_level, get_optional_user
from ..validators import clean_email, clean_mobile, clean_national_id, mask_tail

router = APIRouter(prefix="/public", tags=["public"])


def _event_by_slug(db: Session, slug: str, user: User | None) -> Event:
    event = db.scalar(select(Event).where(Event.slug == slug))
    visible = event is not None and (
        event.status in ("published", "closed") or (user is not None and access_level(db, event.id, user))
    )
    if not visible:
        raise ApiError(404, "event_not_found", "We couldn't find that event.")
    return event


def _registration_by_token(db: Session, token: str) -> Registration:
    reg = db.scalar(select(Registration).where(Registration.access_token == token))
    if reg is None or reg.status == "cancelled":
        raise ApiError(404, "pass_not_found", "This pass link isn't valid. Check the link in your confirmation email.")
    return reg


@router.get("/events")
def list_public_events(include_past: bool = False, db: Session = Depends(get_db)):
    """The upcoming feed stays the default; the catalogue can include published past events."""
    now = svc.utcnow()
    query = (
        select(Event)
        .options(selectinload(Event.sessions))
        .where(Event.status == "published")
    )
    if not include_past:
        query = query.where(Event.ends_at >= now - timedelta(hours=12))
    # Upcoming events first, then the most recent past events. Never expose drafts.
    if include_past:
        query = query.order_by(
            case((Event.ends_at >= now, 0), else_=1),
            case((Event.ends_at >= now, Event.starts_at)),
            Event.starts_at.desc(),
        )
    else:
        query = query.order_by(Event.starts_at)
    events = db.scalars(query).all()
    counts = svc.registered_counts(db, [e.id for e in events])
    return [svc.public_event_out(e, counts.get(e.id, 0), now) for e in events]


@router.get("/events/{slug}")
def get_public_event(slug: str, db: Session = Depends(get_db), user: User | None = Depends(get_optional_user)):
    event = _event_by_slug(db, slug, user)
    out = svc.public_event_out(event, svc.registered_count(db, event.id))
    out["is_preview"] = event.status not in ("published", "closed")
    sponsors = db.scalars(
        select(Sponsor).where(Sponsor.event_id == event.id, Sponsor.status == "approved", Sponsor.show_publicly.is_(True))
    ).all()
    out["sponsors"] = [svc.sponsor_public_out(s) for s in svc.sorted_sponsors(sponsors)]
    out["sponsor_apply_url"] = svc.sponsor_apply_url(event)
    return out


@router.get("/events/{slug}/calendar.ics")
def event_calendar(slug: str, db: Session = Depends(get_db), user: User | None = Depends(get_optional_user)):
    event = _event_by_slug(db, slug, user)
    return Response(
        content=svc.event_ics(event),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{event.slug}.ics"'},
    )


@router.post("/events/{slug}/register", status_code=201)
def register(
    slug: str,
    body: RegistrationIn,
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    check_rate(request, "register", 30, 3600)
    event = _event_by_slug(db, slug, user)
    # Lock the event row so concurrent sign-ups can't overshoot capacity.
    db.execute(select(Event.id).where(Event.id == event.id).with_for_update())
    state = svc.registration_state(event, svc.registered_count(db, event.id))
    # Team members may test the form on a draft event.
    if state != "open" and not (state == "not_published" and user is not None):
        raise ApiError(409, f"registration_{state}", svc.REGISTRATION_STATE_MESSAGES[state])
    reg = svc.create_registration(db, event, body, source="online")
    audit(db, actor=None, action="registration.created", entity_type="registration", entity_id=reg.id,
          event_id=event.id, details={"source": "online"}, request=request)
    db.commit()
    if queue_registration_email(background, reg, event):
        reg.email_sent_at = svc.utcnow()
        db.commit()
    return {"access_token": reg.access_token, "ticket_code": reg.ticket_code, "pass_url": svc.pass_url(reg)}


@router.post("/events/{slug}/find")
def find_pass(
    slug: str, body: FindPassIn, request: Request, background: BackgroundTasks, db: Session = Depends(get_db)
):
    """Recover a lost pass link. All three details must match an existing registration."""
    check_rate(request, "find", 8, 15 * 60)
    event = _event_by_slug(db, slug, None)
    email, _ = clean_email(body.email)
    national_id, _ = clean_national_id(body.national_id, strict=False)
    mobile, _ = clean_mobile(body.mobile)
    reg = None
    if email and national_id and mobile:
        reg = db.scalar(
            select(Registration).where(
                Registration.event_id == event.id,
                Registration.email == email,
                Registration.national_id == national_id,
                Registration.mobile == mobile,
                Registration.status != "cancelled",
            )
        )
    if reg is None:
        raise ApiError(404, "not_found", "We couldn't find a registration with those details.")
    queue_registration_email(background, reg, event)
    return {"access_token": reg.access_token, "ticket_code": reg.ticket_code}


@router.get("/passes/{token}")
def get_pass(token: str, db: Session = Depends(get_db)):
    reg = _registration_by_token(db, token)
    event = reg.event
    summary = svc.registration_summary(db, event, reg)
    blocker = svc.certificate_blocker(event, summary)
    visits = db.scalars(
        select(SponsorLead).where(SponsorLead.registration_id == reg.id, SponsorLead.method == "booth_qr")
        .order_by(SponsorLead.captured_at)
    ).all()
    sponsors_total = db.scalar(
        select(func.count()).select_from(Sponsor).where(Sponsor.event_id == event.id, Sponsor.status == "approved")
    ) or 0
    return {
        "event": svc.public_event_out(event),
        "booth_visits": [
            {"sponsor": db.get(Sponsor, v.sponsor_id).company_name, "at": v.captured_at} for v in visits
        ],
        "sponsors_total": sponsors_total,
        "attendee": {
            "full_name": reg.full_name,
            "ticket_code": reg.ticket_code,
            "email": reg.email,
            "mobile": mask_tail(reg.mobile, 4),
            "scfhs_number": reg.scfhs_number,
            "profession": reg.profession,
            "registered_at": reg.created_at,
        },
        "qr_payload": svc.QR_PREFIX + reg.qr_token,
        "attendance": svc.attendance_out(summary),
        "certificate": {
            "available": event.certificates_enabled and (blocker is None or reg.certificate_code is not None),
            "blocker": None if reg.certificate_code and event.certificates_enabled else blocker,
            "code": reg.certificate_code,
        },
    }


@router.get("/passes/{token}/certificate")
def get_certificate(token: str, request: Request, db: Session = Depends(get_db)):
    reg = _registration_by_token(db, token)
    event = reg.event
    summary = svc.registration_summary(db, event, reg)
    blocker = svc.certificate_blocker(event, summary)
    # A certificate a manager already issued stays available, unless certificates are switched off.
    if blocker == "certificates_disabled" or (blocker and not reg.certificate_code):
        raise ApiError(403, blocker, svc.CERTIFICATE_MESSAGES[blocker])
    if svc.issue_certificate(db, reg):
        audit(db, actor=None, action="certificate.issued", entity_type="registration", entity_id=reg.id,
              event_id=event.id, details={"via": "attendee"}, request=request)
        db.commit()
    return svc.certificate_out(reg, event, summary)


@router.get("/verify/{code}")
def verify_certificate(code: str, request: Request, db: Session = Depends(get_db)):
    check_rate(request, "verify", 60, 10 * 60)
    reg = db.scalar(select(Registration).where(Registration.certificate_code == code.strip().upper()))
    if reg is None or reg.status == "cancelled":
        raise ApiError(404, "certificate_not_found", "No certificate matches this code.")
    event = reg.event
    return {
        "valid": True,
        "certificate_code": reg.certificate_code,
        "issued_at": reg.certificate_issued_at,
        "full_name": reg.full_name,
        "event": {
            "title": event.title,
            "title_ar": event.title_ar,
            "venue": event.venue,
            "venue_ar": event.venue_ar,
            "starts_at": event.starts_at,
            "ends_at": event.ends_at,
            "timezone": event.timezone,
            "cme_hours": event.cme_hours,
            "scfhs_activity_code": event.scfhs_activity_code,
        },
    }
