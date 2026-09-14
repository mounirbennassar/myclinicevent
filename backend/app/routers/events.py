from datetime import timedelta

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import services as svc
from ..audit import audit
from ..db import get_db
from ..errors import ApiError
from ..models import Event, EventSession, EventStaff, User
from ..schemas import DuplicateEventIn, EventCreate, EventUpdate, SessionIn, TeamMemberIn, UserOut
from ..security import ADMIN_ROLES, EventAccess, event_access, get_current_user, require_admin, require_super_admin

router = APIRouter(prefix="/events", tags=["events"])

# Columns that can't be NULL; an explicit null in a PATCH is ignored rather than failing.
_NOT_NULL = {
    "title", "venue", "timezone", "attendance_threshold", "session_rule", "registration_open", "status",
    "count_open_until_end", "certificates_enabled", "auto_issue_certificates", "accent", "slug",
}
_COPY_FIELDS = (
    "title_ar", "description", "description_ar", "venue", "venue_ar", "venue_map_url", "timezone",
    "cme_hours", "accreditation_text", "accreditation_ar", "scfhs_activity_code", "attendance_threshold",
    "session_rule", "capacity", "registration_open", "count_open_until_end", "certificates_enabled",
    "auto_issue_certificates", "accent",
)


@router.get("")
def list_events(status: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role == "sponsor":
        return []
    q = select(Event).options(selectinload(Event.sessions))
    is_admin = user.role in ADMIN_ROLES
    if not is_admin:
        q = q.join(EventStaff, EventStaff.event_id == Event.id).where(EventStaff.user_id == user.id)
    if status and status != "all":
        q = q.where(Event.status == status)
    elif not status:
        q = q.where(Event.status != "archived")
    events = db.scalars(q.order_by(Event.starts_at.desc())).all()
    counts = svc.registered_counts(db, [e.id for e in events])
    levels = {} if is_admin else dict(
        db.execute(select(EventStaff.event_id, EventStaff.role).where(EventStaff.user_id == user.id)).all()
    )
    now = svc.utcnow()
    return [
        svc.event_out(e, counts.get(e.id, 0), "manager" if is_admin else levels.get(e.id), now) for e in events
    ]


@router.post("", status_code=201)
def create_event(body: EventCreate, request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    svc.zone(body.timezone)
    if body.slug:
        svc.check_slug_available(db, body.slug)
        slug = body.slug
    else:
        slug = svc.unique_slug(db, svc.slugify(body.title))
    event = Event(**body.model_dump(exclude={"sessions", "slug"}), slug=slug, created_by_id=user.id)
    svc.set_sessions(event, body.sessions)
    db.add(event)
    db.flush()
    audit(
        db, actor=user, action="event.created", entity_type="event", entity_id=event.id, event_id=event.id,
        details={"title": event.title}, request=request,
    )
    db.commit()
    return svc.event_out(event, 0, "manager")


@router.get("/{event_id}")
def get_event(access: EventAccess = Depends(event_access("scanner")), db: Session = Depends(get_db)):
    return svc.event_out(access.event, svc.registered_count(db, access.event.id), access.level)


@router.patch("/{event_id}")
def update_event(
    body: EventUpdate,
    request: Request,
    access: EventAccess = Depends(event_access("manager")),
    db: Session = Depends(get_db),
):
    event = access.event
    data = body.model_dump(exclude_unset=True, exclude={"sessions"})
    data = {k: v for k, v in data.items() if not (k in _NOT_NULL and v is None)}
    if "slug" in data and data["slug"] != event.slug:
        svc.check_slug_available(db, data["slug"], event.id)
    sessions = body.sessions
    if "timezone" in data and data["timezone"] != event.timezone:
        svc.zone(data["timezone"])
        if not sessions:
            # Keep the sessions' wall-clock times (08:00 stays 08:00) in the new timezone.
            old_tz = svc.tz_of(event)
            sessions = [
                SessionIn(
                    title=s.title, title_ar=s.title_ar,
                    date=s.starts_at.astimezone(old_tz).date(),
                    start=s.starts_at.astimezone(old_tz).time().replace(tzinfo=None),
                    end=s.ends_at.astimezone(old_tz).time().replace(tzinfo=None),
                )
                for s in event.sessions
            ]
    for key, value in data.items():
        setattr(event, key, value)
    changed = sorted(data)
    if sessions:
        svc.set_sessions(event, sessions)
        changed.append("sessions")
    audit(
        db, actor=access.user, action="event.updated", entity_type="event", entity_id=event.id,
        event_id=event.id, details={"fields": changed}, request=request,
    )
    db.commit()
    return svc.event_out(event, svc.registered_count(db, event.id), access.level)


@router.delete("/{event_id}", status_code=204)
def delete_event(event_id: int, request: Request, user: User = Depends(require_super_admin), db: Session = Depends(get_db)):
    event = db.get(Event, event_id)
    if event is None:
        raise ApiError(404, "event_not_found", "Event not found.")
    audit(
        db, actor=user, action="event.deleted", entity_type="event", entity_id=event.id, event_id=event.id,
        details={"title": event.title, "slug": event.slug}, request=request,
    )
    db.delete(event)
    db.commit()
    return Response(status_code=204)


@router.post("/{event_id}/duplicate", status_code=201)
def duplicate_event(
    body: DuplicateEventIn,
    request: Request,
    user: User = Depends(require_admin),
    access: EventAccess = Depends(event_access("manager")),
    db: Session = Depends(get_db),
):
    """Copy an event as a draft (settings, sessions and team), optionally shifted by N days."""
    src = access.event
    shift = timedelta(days=body.shift_days)
    title = body.title or f"{src.title} (copy)"
    copy = Event(
        **{f: getattr(src, f) for f in _COPY_FIELDS},
        title=title,
        slug=svc.unique_slug(db, svc.slugify(title)),
        status="draft",
        starts_at=src.starts_at + shift,
        ends_at=src.ends_at + shift,
        registration_closes_at=src.registration_closes_at + shift if src.registration_closes_at else None,
        created_by_id=user.id,
    )
    for s in src.sessions:
        copy.sessions.append(
            EventSession(title=s.title, title_ar=s.title_ar, starts_at=s.starts_at + shift, ends_at=s.ends_at + shift)
        )
    for link in src.team:
        copy.team.append(EventStaff(user_id=link.user_id, role=link.role))
    db.add(copy)
    db.flush()
    audit(
        db, actor=user, action="event.duplicated", entity_type="event", entity_id=copy.id, event_id=copy.id,
        details={"from_event_id": src.id}, request=request,
    )
    db.commit()
    return svc.event_out(copy, 0, "manager")


# ---------- team


def _member_out(link: EventStaff) -> dict:
    return {"user": UserOut.model_validate(link.user).model_dump(), "role": link.role, "added_at": link.added_at}


@router.get("/{event_id}/team")
def get_team(access: EventAccess = Depends(event_access("manager"))):
    return [_member_out(link) for link in sorted(access.event.team, key=lambda l: l.user.full_name.lower())]


@router.put("/{event_id}/team/{user_id}")
def set_team_member(
    user_id: int,
    body: TeamMemberIn,
    request: Request,
    actor: User = Depends(require_admin),
    access: EventAccess = Depends(event_access("manager")),
    db: Session = Depends(get_db),
):
    member = db.get(User, user_id)
    if member is None or not member.is_active:
        raise ApiError(404, "user_not_found", "User not found or deactivated.")
    if member.role in ADMIN_ROLES:
        raise ApiError(422, "already_admin", "Admins already have access to every event.")
    if member.role == "sponsor":
        raise ApiError(422, "sponsor_account", "Sponsor accounts can't be event staff.")
    link = db.get(EventStaff, (access.event.id, user_id))
    if link is None:
        link = EventStaff(event_id=access.event.id, user_id=user_id, role=body.role)
        db.add(link)
    else:
        link.role = body.role
    audit(
        db, actor=actor, action="team.assigned", entity_type="user", entity_id=user_id, event_id=access.event.id,
        details={"role": body.role}, request=request,
    )
    db.commit()
    db.refresh(link)
    return _member_out(link)


@router.delete("/{event_id}/team/{user_id}", status_code=204)
def remove_team_member(
    user_id: int,
    request: Request,
    actor: User = Depends(require_admin),
    access: EventAccess = Depends(event_access("manager")),
    db: Session = Depends(get_db),
):
    link = db.get(EventStaff, (access.event.id, user_id))
    if link is not None:
        db.delete(link)
        audit(
            db, actor=actor, action="team.removed", entity_type="user", entity_id=user_id,
            event_id=access.event.id, request=request,
        )
        db.commit()
    return Response(status_code=204)
