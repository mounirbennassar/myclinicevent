"""Shared domain logic: codes, sessions, attendance loading, registration creation, serialisation."""

from __future__ import annotations

import math
import re
import secrets
import unicodedata
from collections import defaultdict
from datetime import UTC, datetime
from itertools import groupby
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .attendance import AttendanceSummary, Window, compute_attendance
from .config import settings
from .errors import ApiError
from .models import Event, EventSession, Registration, Scan, Sponsor, SponsorLead, SponsorMember, User
from .schemas import RegistrationIn, SessionIn
from .validators import (
    clean_email,
    clean_mobile,
    clean_name,
    clean_national_id,
    clean_profession,
    clean_scfhs,
    mask_tail,
)

CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"  # no 0/O/1/I, easy to read aloud
QR_PREFIX = "MCE1:"  # attendee pass
BADGE_PREFIX = "MCS1:"  # sponsor badge
TIER_ORDER = {"platinum": 0, "gold": 1, "silver": 2, "bronze": 3, "partner": 4, "exhibitor": 5}
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,118}[a-z0-9]$")


def utcnow() -> datetime:
    return datetime.now(UTC)


def zone(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name or settings.default_timezone)
    except (ZoneInfoNotFoundError, ValueError):
        raise ApiError(422, "validation", "Unknown timezone.", {"timezone": "timezone_invalid"}) from None


def tz_of(event: Event) -> ZoneInfo:
    return zone(event.timezone)


# ---------- links and codes


def _base() -> str:
    return settings.public_base_url.rstrip("/")


def registration_url(event: Event) -> str:
    return f"{_base()}/e/{event.slug}"


def pass_url(reg: Registration) -> str:
    return f"{_base()}/r/{reg.access_token}"


def certificate_url(reg: Registration) -> str:
    return f"{_base()}/r/{reg.access_token}/certificate"


def verify_url(code: str) -> str:
    return f"{_base()}/verify/{code}"


def booth_url(sponsor: Sponsor) -> str:
    return f"{_base()}/s/{sponsor.booth_token}"


def badge_url(member: SponsorMember) -> str:
    return f"{_base()}/sb/{member.access_token}"


def sponsor_apply_url(event: Event) -> str:
    return f"{_base()}/e/{event.slug}/sponsor"


def portal_url() -> str:
    return f"{_base()}/sponsor"


def _random_code(n: int) -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(n))


def new_ticket_code(db: Session) -> str:
    while True:
        code = f"MC-{_random_code(6)}"
        if db.scalar(select(Registration.id).where(Registration.ticket_code == code)) is None:
            return code


def new_certificate_code(db: Session) -> str:
    while True:
        code = f"CME-{_random_code(4)}-{_random_code(4)}"
        if db.scalar(select(Registration.id).where(Registration.certificate_code == code)) is None:
            return code


def slugify(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")[:80].strip("-")


def unique_slug(db: Session, base: str, exclude_id: int | None = None) -> str:
    base = base if len(base) >= 3 else f"event-{secrets.token_hex(3)}"
    slug, n = base, 2
    while True:
        q = select(Event.id).where(Event.slug == slug)
        if exclude_id is not None:
            q = q.where(Event.id != exclude_id)
        if db.scalar(q) is None:
            return slug
        slug, n = f"{base}-{n}", n + 1


def check_slug_available(db: Session, slug: str, exclude_id: int | None = None) -> None:
    if not SLUG_RE.match(slug):
        raise ApiError(422, "validation", "Use lowercase letters, numbers and hyphens.", {"slug": "slug_invalid"})
    q = select(Event.id).where(Event.slug == slug)
    if exclude_id is not None:
        q = q.where(Event.id != exclude_id)
    if db.scalar(q) is not None:
        raise ApiError(409, "slug_taken", "Another event already uses this link.", {"slug": "slug_taken"})


# ---------- sessions


def set_sessions(event: Event, sessions: list[SessionIn]) -> None:
    """Replace the event's sessions from local date/time inputs and update starts_at/ends_at."""
    tz = tz_of(event)
    built = []
    for s in sessions:
        start = datetime.combine(s.date, s.start, tzinfo=tz)
        end = datetime.combine(s.date, s.end, tzinfo=tz)
        if end <= start:
            raise ApiError(422, "validation", "Each session must end after it starts.", {"sessions": "session_order"})
        built.append((start, end, s))
    built.sort(key=lambda b: b[0])
    for (_, prev_end, _), (next_start, _, _) in zip(built, built[1:]):
        if next_start < prev_end:
            raise ApiError(422, "validation", "Sessions can't overlap.", {"sessions": "session_overlap"})
    event.sessions.clear()
    for start, end, s in built:
        event.sessions.append(
            EventSession(
                title=s.title or None,
                title_ar=s.title_ar or None,
                starts_at=start.astimezone(UTC),
                ends_at=end.astimezone(UTC),
            )
        )
    event.starts_at = built[0][0].astimezone(UTC)
    event.ends_at = built[-1][1].astimezone(UTC)


def event_windows(event: Event) -> list[Window]:
    """Session windows, grouped by local day so a forgotten check-out is capped at the end of its day."""
    tz = tz_of(event)
    groups: dict[object, int] = {}
    out = []
    for s in sorted(event.sessions, key=lambda s: s.starts_at):
        day = s.starts_at.astimezone(tz).date()
        out.append(Window(s.starts_at, s.ends_at, groups.setdefault(day, len(groups))))
    return out


def required_minutes(event: Event) -> int:
    return int(sum((s.ends_at - s.starts_at).total_seconds() for s in event.sessions) // 60)


def event_when_text(event: Event) -> str:
    """e.g. "Thu 12 Nov 2026, 08:00–12:00 & 13:00–16:00 (Asia/Riyadh)"."""
    tz = tz_of(event)
    local = [(s.starts_at.astimezone(tz), s.ends_at.astimezone(tz)) for s in event.sessions]
    days = []
    for day, group in groupby(local, key=lambda p: p[0].date()):
        times = " & ".join(f"{a:%H:%M}–{b:%H:%M}" for a, b in group)
        days.append(f"{day:%a %d %b %Y}, {times}")
    return "; ".join(days) + f" ({event.timezone})"


# ---------- registration state


REGISTRATION_STATE_MESSAGES = {
    "not_published": "Registration isn't open yet.",
    "ended": "This event has already ended.",
    "closed": "Registration for this event is closed.",
    "full": "This event is fully booked.",
}


def registered_count(db: Session, event_id: int) -> int:
    return db.scalar(
        select(func.count()).select_from(Registration).where(
            Registration.event_id == event_id, Registration.status != "cancelled"
        )
    ) or 0


def registered_counts(db: Session, event_ids: list[int]) -> dict[int, int]:
    if not event_ids:
        return {}
    rows = db.execute(
        select(Registration.event_id, func.count())
        .where(Registration.event_id.in_(event_ids), Registration.status != "cancelled")
        .group_by(Registration.event_id)
    ).all()
    return {event_id: count for event_id, count in rows}


def registration_state(event: Event, registered: int, now: datetime | None = None) -> str:
    now = now or utcnow()
    if event.status != "published":
        return "not_published"
    if now >= event.ends_at:
        return "ended"
    if not event.registration_open or (event.registration_closes_at and now >= event.registration_closes_at):
        return "closed"
    if event.capacity and registered >= event.capacity:
        return "full"
    return "open"


# ---------- attendance


def scans_by_registration(
    db: Session, event_id: int, registration_ids: list[int] | None = None
) -> dict[int, list[tuple[str, datetime]]]:
    q = select(Scan.registration_id, Scan.direction, Scan.scanned_at).where(
        Scan.event_id == event_id, Scan.voided.is_(False)
    )
    if registration_ids is not None:
        q = q.where(Scan.registration_id.in_(registration_ids))
    out: dict[int, list[tuple[str, datetime]]] = defaultdict(list)
    for rid, direction, at in db.execute(q.order_by(Scan.scanned_at)):
        out[rid].append((direction, at))
    return out


def summarize(
    event: Event, scans: list[tuple[str, datetime]], reg: Registration, now: datetime | None = None
) -> AttendanceSummary:
    return compute_attendance(
        scans,
        event_windows(event),
        event.attendance_threshold,
        now or utcnow(),
        event.count_open_until_end,
        reg.eligibility_override,
        event.session_rule,
    )


def registration_summary(db: Session, event: Event, reg: Registration, now: datetime | None = None) -> AttendanceSummary:
    return summarize(event, scans_by_registration(db, event.id, [reg.id]).get(reg.id, []), reg, now)


def event_attendance(
    db: Session, event: Event, now: datetime | None = None, include_cancelled: bool = False
) -> list[tuple[Registration, AttendanceSummary]]:
    now = now or utcnow()
    q = select(Registration).where(Registration.event_id == event.id)
    if not include_cancelled:
        q = q.where(Registration.status != "cancelled")
    regs = db.scalars(q.order_by(Registration.created_at)).all()
    scans = scans_by_registration(db, event.id)
    return [(r, summarize(event, scans.get(r.id, []), r, now)) for r in regs]


CERTIFICATE_MESSAGES = {
    "certificates_disabled": "Certificates aren't enabled for this event.",
    "not_eligible": "The attendance requirement for CME hours hasn't been met.",
    "event_not_ended": "Your certificate will be available once the event ends.",
}


def certificate_blocker(event: Event, summary: AttendanceSummary, now: datetime | None = None) -> str | None:
    if not event.certificates_enabled:
        return "certificates_disabled"
    if not summary.eligible:
        return "not_eligible"
    if (now or utcnow()) < event.ends_at:
        return "event_not_ended"
    return None


def issue_certificate(db: Session, reg: Registration) -> bool:
    """Assign a certificate code if the attendee doesn't have one. Returns True when newly issued."""
    if reg.certificate_code:
        return False
    reg.certificate_code = new_certificate_code(db)
    reg.certificate_issued_at = utcnow()
    return True


def revoke_certificate(reg: Registration) -> None:
    reg.certificate_code = None
    reg.certificate_issued_at = None


def should_auto_issue(event: Event, reg: Registration, summary: AttendanceSummary) -> bool:
    """Whether a check-out that meets the requirement should hand out the certificate right away."""
    return (
        event.certificates_enabled
        and event.auto_issue_certificates
        and summary.eligible
        and summary.status == "checked_out"
        and not reg.certificate_code
    )


# ---------- registration creation


_CLEANERS = {
    "full_name": clean_name,
    "email": clean_email,
    "mobile": clean_mobile,
    "scfhs_number": clean_scfhs,
    "national_id": lambda v: clean_national_id(v, settings.strict_national_id),
    "profession": clean_profession,
}
REGISTRATION_FIELDS = tuple(_CLEANERS)


def clean_registration_fields(values: dict) -> tuple[dict, dict[str, str]]:
    """Clean whichever registration fields are present. Returns (clean_values, errors)."""
    out, errors = {}, {}
    for key, cleaner in _CLEANERS.items():
        if key in values:
            value, err = cleaner(values[key])
            if err:
                errors[key] = err
            else:
                out[key] = value
    return out, errors


def ensure_unique_identity(db: Session, event_id: int, email: str | None, national_id: str | None, exclude_id: int | None = None) -> None:
    conditions = []
    if email:
        conditions.append(Registration.email == email)
    if national_id:
        conditions.append(Registration.national_id == national_id)
    if not conditions:
        return
    q = select(Registration).where(Registration.event_id == event_id, or_(*conditions))
    if exclude_id is not None:
        q = q.where(Registration.id != exclude_id)
    existing = db.scalar(q.limit(1))
    if existing is not None:
        field = "national_id" if national_id and existing.national_id == national_id else "email"
        raise ApiError(409, "duplicate", "This person is already registered for this event.", {field: "already_registered"})


def create_registration(
    db: Session, event: Event, data: RegistrationIn, *, source: str, actor: User | None = None
) -> Registration:
    clean, errors = clean_registration_fields(data.model_dump())
    if not data.consent and source != "import":
        errors["consent"] = "consent_required"
    if errors:
        raise ApiError(422, "validation", "Please check the highlighted fields.", errors)
    ensure_unique_identity(db, event.id, clean["email"], clean["national_id"])
    reg = Registration(
        event_id=event.id,
        ticket_code=new_ticket_code(db),
        access_token=secrets.token_urlsafe(32),
        qr_token=secrets.token_urlsafe(18),
        source=source,
        status="registered",
        consent_at=utcnow() if data.consent else None,
        sponsor_consent=data.sponsor_consent,
        created_by_id=actor.id if actor else None,
        **clean,
    )
    try:
        with db.begin_nested():
            db.add(reg)
            db.flush()
    except IntegrityError:
        # Lost a race with an identical submission.
        raise ApiError(409, "duplicate", "This person is already registered for this event.") from None
    return reg


# ---------- serialisation


def session_out(s: EventSession, tz: ZoneInfo) -> dict:
    start, end = s.starts_at.astimezone(tz), s.ends_at.astimezone(tz)
    return {
        "id": s.id,
        "title": s.title,
        "title_ar": s.title_ar,
        "date": start.date().isoformat(),
        "start": start.strftime("%H:%M"),
        "end": end.strftime("%H:%M"),
        "starts_at": s.starts_at,
        "ends_at": s.ends_at,
    }


_PUBLIC_EVENT_FIELDS = (
    "id", "slug", "title", "title_ar", "description", "description_ar", "venue", "venue_ar",
    "venue_map_url", "timezone", "cme_hours", "accreditation_text", "accreditation_ar",
    "scfhs_activity_code", "attendance_threshold", "session_rule", "capacity", "accent", "starts_at",
    "ends_at", "status",
)
_ADMIN_EVENT_FIELDS = (
    "registration_open", "registration_closes_at", "count_open_until_end", "certificates_enabled",
    "auto_issue_certificates", "created_at", "updated_at",
)


def public_event_out(event: Event, registered: int | None = None, now: datetime | None = None) -> dict:
    tz = tz_of(event)
    out = {f: getattr(event, f) for f in _PUBLIC_EVENT_FIELDS}
    out["sessions"] = [session_out(s, tz) for s in event.sessions]
    out["required_minutes"] = required_minutes(event)
    out["registration_url"] = registration_url(event)
    out["calendar_url"] = f"{_base()}/api/public/events/{event.slug}/calendar.ics"
    if registered is not None:
        out["registration_state"] = registration_state(event, registered, now)
        out["seats_left"] = max(0, event.capacity - registered) if event.capacity else None
    return out


def event_out(event: Event, registered: int = 0, level: str | None = None, now: datetime | None = None) -> dict:
    out = public_event_out(event, registered, now)
    out.update({f: getattr(event, f) for f in _ADMIN_EVENT_FIELDS})
    out["registered"] = registered
    out["my_access"] = level
    return out


def attendance_out(a: AttendanceSummary) -> dict:
    return {
        "status": a.status,
        "attended_minutes": a.attended_seconds // 60,
        "required_minutes": a.required_seconds // 60,
        "threshold": a.threshold,
        "session_rule": a.session_rule,
        "percent": a.percent,
        "eligible": a.eligible,
        "computed_eligible": a.computed_eligible,
        "override": a.override,
        "remaining_minutes": math.ceil(a.remaining_seconds / 60),
        "achievable": a.achievable,
        "first_in": a.first_in,
        "last_scan_at": a.last_scan_at,
        "last_direction": a.last_direction,
        "intervals": [{"start": iv.start, "end": iv.end} for iv in a.intervals],
        "sessions": [
            {
                "index": s.index,
                "start": s.start,
                "end": s.end,
                "attended_minutes": s.attended_seconds // 60,
                "required_minutes": s.required_seconds // 60,
                "percent": s.percent,
                "met": s.met,
            }
            for s in a.sessions
        ],
    }


def registration_out(r: Registration, a: AttendanceSummary, *, full_pii: bool) -> dict:
    """Scanners see masked mobile and ID numbers; managers see everything."""
    return {
        "id": r.id,
        "ticket_code": r.ticket_code,
        "full_name": r.full_name,
        "email": r.email,
        "mobile": r.mobile if full_pii else mask_tail(r.mobile, 3),
        "scfhs_number": r.scfhs_number,
        "national_id": r.national_id if full_pii else mask_tail(r.national_id, 4),
        "profession": r.profession,
        "source": r.source,
        "status": r.status,
        "created_at": r.created_at,
        "certificate_code": r.certificate_code,
        "certificate_issued_at": r.certificate_issued_at,
        "eligibility_override": r.eligibility_override,
        "notes": r.notes if full_pii else None,
        "attendance": attendance_out(a),
    }


def scan_out(s: Scan) -> dict:
    return {
        "id": s.id,
        "direction": s.direction,
        "scanned_at": s.scanned_at,
        "method": s.method,
        "voided": s.voided,
        "note": s.note,
        "device": s.device,
        "scanned_by": s.scanned_by.full_name if s.scanned_by else None,
    }


def _ics_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def event_ics(event: Event) -> str:
    """An iCalendar file with one entry per session, for "Add to calendar" links."""
    stamp = utcnow().strftime("%Y%m%dT%H%M%SZ")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//My Clinic Educational//Events//EN", "METHOD:PUBLISH"]
    for s in event.sessions:
        title = event.title if not s.title else f"{event.title} — {s.title}"
        lines += [
            "BEGIN:VEVENT",
            f"UID:session-{s.id}@myclinic-events",
            f"DTSTAMP:{stamp}",
            f"DTSTART:{s.starts_at.astimezone(UTC).strftime('%Y%m%dT%H%M%SZ')}",
            f"DTEND:{s.ends_at.astimezone(UTC).strftime('%Y%m%dT%H%M%SZ')}",
            f"SUMMARY:{_ics_escape(title)}",
            f"LOCATION:{_ics_escape(event.venue)}",
            f"DESCRIPTION:{_ics_escape(registration_url(event))}",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


def _sponsor_public_fields(s: Sponsor) -> dict:
    return {
        "id": s.id,
        "company_name": s.company_name,
        "company_name_ar": s.company_name_ar,
        "tier": s.tier,
        "logo_url": s.logo_url,
        "website": s.website,
        "description": s.description,
        "description_ar": s.description_ar,
        "booth_number": s.booth_number,
    }


def sponsor_public_out(s: Sponsor) -> dict:
    return _sponsor_public_fields(s)


def sponsor_out(s: Sponsor, *, leads: int = 0, members: int | None = None) -> dict:
    """Full record for managers and the sponsor's own portal."""
    return _sponsor_public_fields(s) | {
        "event_id": s.event_id,
        "status": s.status,
        "show_publicly": s.show_publicly,
        "contact_name": s.contact_name,
        "contact_email": s.contact_email,
        "contact_mobile": s.contact_mobile,
        "notes": s.notes,
        "booth_url": booth_url(s),
        "created_at": s.created_at,
        "approved_at": s.approved_at,
        "leads": leads,
        "members": len(s.members) if members is None else members,
    }


def member_out(m: SponsorMember) -> dict:
    return {
        "id": m.id,
        "full_name": m.full_name,
        "email": m.email,
        "mobile": m.mobile,
        "title": m.title,
        "is_contact": m.is_contact,
        "portal_access": m.user_id is not None and (m.user is None or m.user.is_active),
        "badge_url": badge_url(m),
        "qr_payload": BADGE_PREFIX + m.qr_token,
        "created_at": m.created_at,
    }


def lead_out(lead: SponsorLead) -> dict:
    """Contact details are revealed only with the attendee's consent (booth visit or opt-in)."""
    r = lead.registration
    revealed = lead.consent or r.sponsor_consent
    return {
        "id": lead.id,
        "method": lead.method,
        "captured_at": lead.captured_at,
        "captured_by": lead.captured_by.full_name if lead.captured_by else None,
        "consent": revealed,
        "rating": lead.rating,
        "note": lead.note,
        "attendee": {
            "full_name": r.full_name,
            "profession": r.profession,
            "ticket_code": r.ticket_code,
            "email": r.email if revealed else None,
            "mobile": r.mobile if revealed else None,
        },
    }


def sorted_sponsors(sponsors: list[Sponsor]) -> list[Sponsor]:
    return sorted(sponsors, key=lambda s: (TIER_ORDER.get(s.tier, 9), s.company_name.lower()))


def certificate_out(reg: Registration, event: Event, a: AttendanceSummary) -> dict:
    return {
        "certificate_code": reg.certificate_code,
        "issued_at": reg.certificate_issued_at,
        "full_name": reg.full_name,
        "scfhs_number": reg.scfhs_number,
        "attended_minutes": a.attended_seconds // 60,
        "percent": a.percent,
        "verify_url": verify_url(reg.certificate_code) if reg.certificate_code else None,
        "event": public_event_out(event),
    }
