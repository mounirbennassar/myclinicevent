"""Event managers: review applications, approve, edit, and see each sponsor's leads."""

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import services as svc
from ..audit import audit
from ..db import get_db
from ..emailer import queue_sponsor_approved_email, queue_sponsor_rejected_email
from ..errors import ApiError
from ..models import Sponsor, SponsorLead, User
from ..schemas import SponsorAdminUpdate, SponsorCreateIn, SponsorDecisionIn
from ..security import EventAccess, event_access, generate_password, hash_password
from ..sponsors import approve_sponsor, contact_member, create_sponsor, lead_counts
from ..validators import clean_email, clean_mobile

router = APIRouter(prefix="/events/{event_id}/sponsors", tags=["sponsors admin"])


def _get(db: Session, access: EventAccess, sponsor_id: int) -> Sponsor:
    sponsor = db.get(Sponsor, sponsor_id)
    if sponsor is None or sponsor.event_id != access.event.id:
        raise ApiError(404, "sponsor_not_found", "Sponsor not found.")
    return sponsor


def _out(db: Session, sponsor: Sponsor) -> dict:
    out = svc.sponsor_out(sponsor, leads=lead_counts(db, [sponsor.id]).get(sponsor.id, 0))
    out["members_list"] = [svc.member_out(m) for m in sponsor.members]
    out["apply_url"] = svc.sponsor_apply_url(sponsor.event)
    return out


@router.get("")
def list_sponsors(status: str = "", access: EventAccess = Depends(event_access("manager")), db: Session = Depends(get_db)):
    q = select(Sponsor).options(selectinload(Sponsor.members)).where(Sponsor.event_id == access.event.id)
    sponsors = svc.sorted_sponsors(db.scalars(q).all())
    counts = {s: sum(1 for x in sponsors if x.status == s) for s in ("pending", "approved", "rejected")}
    if status in counts:
        sponsors = [s for s in sponsors if s.status == status]
    leads = lead_counts(db, [s.id for s in sponsors])
    return {
        "items": [svc.sponsor_out(s, leads=leads.get(s.id, 0)) for s in sponsors],
        "counts": counts | {"all": sum(counts.values()), "leads": sum(leads.values())},
        "apply_url": svc.sponsor_apply_url(access.event),
    }


@router.post("", status_code=201)
def create(
    body: SponsorCreateIn,
    request: Request,
    background: BackgroundTasks,
    access: EventAccess = Depends(event_access("manager")),
    db: Session = Depends(get_db),
):
    """Add a sponsor the team already agreed with: approved immediately, portal login emailed."""
    sponsor = create_sponsor(db, access.event, body, status="approved", actor=access.user, booth_number=body.booth_number)
    audit(db, actor=access.user, action="sponsor.created", entity_type="sponsor", entity_id=sponsor.id,
          event_id=access.event.id, details={"company": sponsor.company_name}, request=request)
    result = approve_sponsor(db, sponsor, actor=access.user, background=background, request=request, notify=body.notify)
    return _out(db, sponsor) | {"account": result}


@router.get("/{sponsor_id}")
def get_sponsor(sponsor_id: int, access: EventAccess = Depends(event_access("manager")), db: Session = Depends(get_db)):
    return _out(db, _get(db, access, sponsor_id))


@router.patch("/{sponsor_id}")
def update_sponsor(
    sponsor_id: int,
    body: SponsorAdminUpdate,
    request: Request,
    access: EventAccess = Depends(event_access("manager")),
    db: Session = Depends(get_db),
):
    sponsor = _get(db, access, sponsor_id)
    data = body.model_dump(exclude_unset=True)
    errors = {}
    if "contact_email" in data:
        data["contact_email"], err = clean_email(data["contact_email"])
        if err:
            errors["contact_email"] = err
    if "contact_mobile" in data:
        data["contact_mobile"], err = clean_mobile(data["contact_mobile"])
        if err:
            errors["contact_mobile"] = err
    if errors:
        raise ApiError(422, "validation", "Please check the highlighted fields.", errors)
    for key, value in data.items():
        if value is None and key in ("company_name", "tier", "contact_name", "contact_email", "contact_mobile", "show_publicly"):
            continue
        setattr(sponsor, key, value.strip() or None if isinstance(value, str) and key not in ("tier",) else value)
    # Keep the main contact's badge in step with the contact details.
    contact = contact_member(sponsor)
    if "contact_name" in data and data["contact_name"]:
        contact.full_name = sponsor.contact_name
    if "contact_mobile" in data and data["contact_mobile"]:
        contact.mobile = sponsor.contact_mobile
    audit(db, actor=access.user, action="sponsor.updated", entity_type="sponsor", entity_id=sponsor.id,
          event_id=access.event.id, details={"fields": sorted(data)}, request=request)
    db.commit()
    return _out(db, sponsor)


@router.post("/{sponsor_id}/approve")
def approve(
    sponsor_id: int,
    body: SponsorDecisionIn,
    request: Request,
    background: BackgroundTasks,
    access: EventAccess = Depends(event_access("manager")),
    db: Session = Depends(get_db),
):
    sponsor = _get(db, access, sponsor_id)
    result = approve_sponsor(db, sponsor, actor=access.user, background=background, request=request,
                             tier=body.tier, booth_number=body.booth_number, notify=body.notify)
    return _out(db, sponsor) | {"account": result}


@router.post("/{sponsor_id}/reject")
def reject(
    sponsor_id: int,
    body: SponsorDecisionIn,
    request: Request,
    background: BackgroundTasks,
    access: EventAccess = Depends(event_access("manager")),
    db: Session = Depends(get_db),
):
    sponsor = _get(db, access, sponsor_id)
    sponsor.status = "rejected"
    sponsor.show_publicly = False
    for member in sponsor.members:
        if member.user_id:
            portal_user = db.get(User, member.user_id)
            if portal_user is not None:
                portal_user.is_active = False
                portal_user.token_version += 1
    audit(db, actor=access.user, action="sponsor.rejected", entity_type="sponsor", entity_id=sponsor.id,
          event_id=access.event.id, details={"company": sponsor.company_name}, request=request)
    db.commit()
    emailed = queue_sponsor_rejected_email(background, sponsor, access.event, body.message) if body.notify else False
    return _out(db, sponsor) | {"emailed": emailed}


@router.post("/{sponsor_id}/resend")
def resend_credentials(
    sponsor_id: int,
    request: Request,
    background: BackgroundTasks,
    access: EventAccess = Depends(event_access("manager")),
    db: Session = Depends(get_db),
):
    """New temporary password for the main contact, emailed with the portal and booth details."""
    sponsor = _get(db, access, sponsor_id)
    if sponsor.status != "approved":
        raise ApiError(422, "not_approved", "Approve the sponsor first.")
    member = contact_member(sponsor)
    portal_user = db.get(User, member.user_id) if member.user_id else None
    if portal_user is None:
        raise ApiError(422, "no_account", "This sponsor has no portal account yet.")
    temporary = generate_password()
    portal_user.password_hash = hash_password(temporary)
    portal_user.must_change_password = True
    portal_user.is_active = True
    portal_user.token_version += 1
    audit(db, actor=access.user, action="sponsor.credentials_resent", entity_type="sponsor", entity_id=sponsor.id,
          event_id=access.event.id, request=request)
    db.commit()
    emailed = queue_sponsor_approved_email(background, sponsor, access.event, member, portal_user.email, temporary)
    return {"login_email": portal_user.email, "temporary_password": temporary, "emailed": emailed}


@router.get("/{sponsor_id}/leads")
def sponsor_leads(sponsor_id: int, access: EventAccess = Depends(event_access("manager")), db: Session = Depends(get_db)):
    sponsor = _get(db, access, sponsor_id)
    leads = db.scalars(
        select(SponsorLead).options(selectinload(SponsorLead.registration))
        .where(SponsorLead.sponsor_id == sponsor.id).order_by(SponsorLead.captured_at.desc())
    ).all()
    return [svc.lead_out(lead) for lead in leads]


@router.delete("/{sponsor_id}", status_code=204)
def delete_sponsor(
    sponsor_id: int,
    request: Request,
    access: EventAccess = Depends(event_access("manager")),
    db: Session = Depends(get_db),
):
    sponsor = _get(db, access, sponsor_id)
    audit(db, actor=access.user, action="sponsor.deleted", entity_type="sponsor", entity_id=sponsor.id,
          event_id=access.event.id, details={"company": sponsor.company_name}, request=request)
    db.delete(sponsor)  # portal users cascade with the sponsor
    db.commit()
    return Response(status_code=204)
