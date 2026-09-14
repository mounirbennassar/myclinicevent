"""Unauthenticated sponsor endpoints: applications, booth pages, booth visits, badge pages."""

import re

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import services as svc
from ..audit import audit
from ..db import get_db
from ..emailer import queue_sponsor_application_email
from ..errors import ApiError
from ..models import Event, Registration, Sponsor, SponsorLead, SponsorMember, User
from ..ratelimit import check_rate
from ..schemas import BoothIdentifyIn, BoothVisitIn, SponsorApplyIn
from ..security import access_level, get_optional_user
from ..sponsors import create_sponsor, upsert_lead
from ..validators import clean_mobile, normalize_digits

router = APIRouter(prefix="/public", tags=["sponsors"])


def _visible_event(db: Session, slug: str, user: User | None) -> Event:
    event = db.scalar(select(Event).where(Event.slug == slug))
    visible = event is not None and (
        event.status in ("published", "closed") or (user is not None and access_level(db, event.id, user))
    )
    if not visible:
        raise ApiError(404, "event_not_found", "We couldn't find that event.")
    return event


def _booth(db: Session, token: str) -> Sponsor:
    sponsor = db.scalar(select(Sponsor).where(Sponsor.booth_token == token))
    if sponsor is None or sponsor.status != "approved" or sponsor.event.status not in ("published", "closed"):
        raise ApiError(404, "booth_not_found", "This booth code isn't valid.")
    return sponsor


@router.post("/events/{slug}/sponsors/apply", status_code=201)
def apply(
    slug: str,
    body: SponsorApplyIn,
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    check_rate(request, "sponsor_apply", 5, 3600)
    event = _visible_event(db, slug, user)
    if event.status != "published" or svc.utcnow() >= event.ends_at:
        raise ApiError(409, "sponsorship_closed", "Sponsorship applications for this event are closed.")
    if not body.consent:
        raise ApiError(422, "validation", "Please check the highlighted fields.", {"consent": "consent_required"})
    sponsor = create_sponsor(db, event, body, status="pending")
    audit(db, actor=None, action="sponsor.applied", entity_type="sponsor", entity_id=sponsor.id, event_id=event.id,
          details={"company": sponsor.company_name}, request=request)
    db.commit()
    queue_sponsor_application_email(background, sponsor, event)
    return {"id": sponsor.id, "company_name": sponsor.company_name}


@router.get("/booths/{token}")
def booth(token: str, db: Session = Depends(get_db)):
    sponsor = _booth(db, token)
    return {"sponsor": svc.sponsor_public_out(sponsor), "event": svc.public_event_out(sponsor.event)}


@router.post("/booths/{token}/identify")
def booth_identify(token: str, body: BoothIdentifyIn, request: Request, db: Session = Depends(get_db)):
    """For attendees without their pass open: ticket code + mobile number unlock their pass token."""
    check_rate(request, "booth_identify", 10, 15 * 60)
    sponsor = _booth(db, token)
    compact = re.sub(r"\s", "", normalize_digits(body.ticket_code)).upper()
    ticket = compact if compact.startswith("MC-") else f"MC-{compact.removeprefix('MC')}"
    mobile, _ = clean_mobile(body.mobile)
    reg = db.scalar(select(Registration).where(Registration.ticket_code == ticket, Registration.event_id == sponsor.event_id))
    if reg is None or reg.status == "cancelled" or not mobile or reg.mobile != mobile:
        raise ApiError(404, "not_found", "We couldn't find a registration with those details.")
    return {"pass_token": reg.access_token, "full_name": reg.full_name}


@router.post("/booths/{token}/visit")
def booth_visit(token: str, body: BoothVisitIn, request: Request, db: Session = Depends(get_db)):
    """The attendee scanned the booth QR and tapped "share my contact": that's their consent."""
    check_rate(request, "booth_visit", 60, 3600)
    sponsor = _booth(db, token)
    reg = db.scalar(select(Registration).where(Registration.access_token == body.pass_token))
    if reg is None or reg.status == "cancelled":
        raise ApiError(404, "pass_not_found", "This pass link isn't valid.")
    if reg.event_id != sponsor.event_id:
        raise ApiError(409, "wrong_event", "This pass is for a different event.")
    lead, created = upsert_lead(db, sponsor, reg, method="booth_qr", consent=True, captured_by=None)
    db.commit()
    visited = db.scalar(
        select(func.count()).select_from(SponsorLead).where(SponsorLead.registration_id == reg.id)
    ) or 0
    total = db.scalar(
        select(func.count()).select_from(Sponsor).where(Sponsor.event_id == sponsor.event_id, Sponsor.status == "approved")
    ) or 0
    return {
        "sponsor": svc.sponsor_public_out(sponsor),
        "attendee_name": reg.full_name,
        "first_visit": created,
        "visited_at": lead.captured_at,
        "booths_visited": visited,
        "booths_total": total,
    }


@router.get("/badges/{access_token}")
def badge(access_token: str, db: Session = Depends(get_db)):
    member = db.scalar(select(SponsorMember).where(SponsorMember.access_token == access_token))
    if member is None or member.sponsor.status != "approved":
        raise ApiError(404, "badge_not_found", "This badge link isn't valid.")
    sponsor = member.sponsor
    return {
        "member": {"full_name": member.full_name, "title": member.title},
        "sponsor": svc.sponsor_public_out(sponsor),
        "event": svc.public_event_out(sponsor.event),
        "qr_payload": svc.BADGE_PREFIX + member.qr_token,
    }
