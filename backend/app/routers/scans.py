"""The attendance scanner. Business outcomes return 200 with a `result` code so the phone UI
(and its offline retry queue) can tell "done, show this" apart from "request failed, retry"."""

import re
from datetime import UTC, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from .. import services as svc
from ..attendance import AttendanceSummary, is_inside
from ..audit import audit
from ..config import settings
from ..db import get_db
from ..emailer import queue_certificate_email
from ..models import BadgeScan, Event, Registration, Scan, SponsorMember
from ..schemas import ScanIn
from ..security import EventAccess, event_access
from ..validators import normalize_digits

router = APIRouter(prefix="/events/{event_id}", tags=["scanning"])

RESULT_MESSAGES = {
    "checked_in": "Checked in.",
    "checked_out": "Checked out.",
    "duplicate": "Already scanned a moment ago.",
    "already_in": "Already checked in.",
    "not_in": "Not checked in yet.",
    "invalid": "Code not recognised.",
    "wrong_event": "This ticket is for a different event.",
    "cancelled": "This registration was cancelled.",
    "outside_window": "Scanning is closed at this time for this event.",
    "sponsor_badge": "Sponsor badge.",
    "badge_inactive": "This sponsor badge isn't active.",
}


def _scan_badge(db: Session, event: Event, code: str, scanned_by_id: int) -> dict:
    """Sponsor badges are for gate access only; they're logged, not timed."""
    member = db.scalar(select(SponsorMember).where(SponsorMember.qr_token == code[len(svc.BADGE_PREFIX):].strip()))
    if member is None:
        return _result("invalid")
    sponsor = member.sponsor
    if sponsor.event_id != event.id:
        return _result("wrong_event", other_event=sponsor.event.title)
    if sponsor.status != "approved":
        return _result("badge_inactive")
    db.add(BadgeScan(event_id=event.id, member_id=member.id, scanned_by_id=scanned_by_id))
    db.commit()
    return _result("sponsor_badge") | {
        "sponsor": {
            "company_name": sponsor.company_name,
            "tier": sponsor.tier,
            "booth_number": sponsor.booth_number,
            "member_name": member.full_name,
            "member_title": member.title,
        }
    }


def _find_registration(db: Session, event: Event, code: str) -> tuple[Registration | None, str]:
    raw = code.strip()
    if raw.upper().startswith(svc.QR_PREFIX):
        token = raw[len(svc.QR_PREFIX):].strip()
        return db.scalar(select(Registration).where(Registration.qr_token == token)), "qr"
    # Typed fallback: a National ID / Iqama number within this event, or a ticket code.
    compact = re.sub(r"\s", "", normalize_digits(raw)).upper()
    if re.fullmatch(r"[12]\d{9}", compact):
        reg = db.scalar(
            select(Registration).where(Registration.event_id == event.id, Registration.national_id == compact)
        )
        return reg, "manual"
    ticket = compact if compact.startswith("MC-") else f"MC-{compact.removeprefix('MC')}"
    return db.scalar(select(Registration).where(Registration.ticket_code == ticket)), "manual"


def _result(
    result: str,
    *,
    reg: Registration | None = None,
    summary: AttendanceSummary | None = None,
    scan: Scan | None = None,
    other_event: str | None = None,
    certificate_issued: bool = False,
    certificate_emailed: bool = False,
) -> dict:
    return {
        "result": result,
        "message": RESULT_MESSAGES[result],
        "registration": {
            "id": reg.id,
            "ticket_code": reg.ticket_code,
            "full_name": reg.full_name,
            "profession": reg.profession,
            "certificate_code": reg.certificate_code,
        } if reg else None,
        "attendance": svc.attendance_out(summary) if summary else None,
        "scan": svc.scan_out(scan) if scan else None,
        "other_event": other_event,
        "certificate_issued": certificate_issued,
        "certificate_emailed": certificate_emailed,
    }


def auto_issue_after_checkout(
    db: Session,
    background: BackgroundTasks,
    request: Request | None,
    event: Event,
    reg: Registration,
    summary: AttendanceSummary,
    *,
    actor_id: int | None,
    via: str,
) -> tuple[bool, bool]:
    """Hand out the certificate at the check-out that meets the requirement. Returns (issued, emailed)."""
    if not svc.should_auto_issue(event, reg, summary):
        return False, False
    svc.issue_certificate(db, reg)
    audit(db, actor=None, action="certificate.issued", entity_type="registration", entity_id=reg.id,
          event_id=event.id, details={"via": via, "by_user_id": actor_id}, request=request)
    return True, queue_certificate_email(background, reg, event)


@router.post("/scan")
def scan(
    body: ScanIn,
    request: Request,
    background: BackgroundTasks,
    access: EventAccess = Depends(event_access("scanner")),
    db: Session = Depends(get_db),
):
    event = access.event
    now = svc.utcnow()
    if body.code.strip().upper().startswith(svc.BADGE_PREFIX):
        return _scan_badge(db, event, body.code.strip(), access.user.id)
    reg, method = _find_registration(db, event, body.code)
    if reg is None:
        return _result("invalid")
    if reg.event_id != event.id:
        return _result("wrong_event", other_event=reg.event.title)
    if reg.status == "cancelled":
        return _result("cancelled", reg=reg)

    at = now
    if body.client_ts:
        ts = body.client_ts if body.client_ts.tzinfo else body.client_ts.replace(tzinfo=UTC)
        # Trust the device clock only for plausible queued scans.
        if now - timedelta(hours=12) <= ts <= now + timedelta(minutes=2):
            at = min(ts, now)
    margin = timedelta(hours=settings.scan_window_margin_hours)
    if not (event.starts_at - margin <= at <= event.ends_at + margin):
        return _result("outside_window", reg=reg)

    # Serialise concurrent scans of one attendee (e.g. two gates reading the same code).
    db.execute(select(Registration.id).where(Registration.id == reg.id).with_for_update())
    history = [
        (s.direction, s.scanned_at)
        for s in db.scalars(
            select(Scan).where(Scan.registration_id == reg.id, Scan.voided.is_(False)).order_by(Scan.scanned_at)
        )
    ]
    windows = svc.event_windows(event)
    inside = is_inside(history, windows, at)

    if history and body.mode == "auto" and abs((at - history[-1][1]).total_seconds()) < settings.scan_cooldown_seconds:
        return _result("duplicate", reg=reg, summary=svc.summarize(event, history, reg, now))

    direction = body.mode if body.mode != "auto" else ("out" if inside else "in")
    if direction == "in" and inside:
        return _result("already_in", reg=reg, summary=svc.summarize(event, history, reg, now))
    if direction == "out" and not inside:
        return _result("not_in", reg=reg, summary=svc.summarize(event, history, reg, now))

    record = Scan(
        event_id=event.id,
        registration_id=reg.id,
        direction=direction,
        scanned_at=at,
        method=method,
        scanned_by_id=access.user.id,
        device=body.device,
    )
    db.add(record)
    db.flush()
    summary = svc.summarize(event, history + [(direction, at)], reg, now)
    issued, emailed = auto_issue_after_checkout(
        db, background, request, event, reg, summary, actor_id=access.user.id, via="scan",
    )
    db.commit()
    return _result(
        "checked_in" if direction == "in" else "checked_out",
        reg=reg, summary=summary, scan=record, certificate_issued=issued, certificate_emailed=emailed,
    )


@router.get("/scans/recent")
def recent_scans(
    limit: int = Query(20, ge=1, le=100),
    access: EventAccess = Depends(event_access("scanner")),
    db: Session = Depends(get_db),
):
    scans = db.scalars(
        select(Scan)
        .options(joinedload(Scan.registration))
        .where(Scan.event_id == access.event.id)
        .order_by(Scan.recorded_at.desc(), Scan.id.desc())
        .limit(limit)
    ).all()
    return [
        svc.scan_out(s) | {
            "registration": {
                "id": s.registration.id,
                "full_name": s.registration.full_name,
                "ticket_code": s.registration.ticket_code,
            }
        }
        for s in scans
    ]
