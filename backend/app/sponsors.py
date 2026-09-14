"""Sponsor domain logic shared by the public, portal and admin routers."""

from __future__ import annotations

import secrets

from fastapi import BackgroundTasks, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import services as svc
from .audit import audit
from .emailer import queue_sponsor_approved_email, queue_sponsor_member_email
from .errors import ApiError
from .models import Event, Registration, Sponsor, SponsorLead, SponsorMember, User
from .schemas import SponsorApplyIn, SponsorMemberIn
from .security import generate_password, hash_password
from .validators import clean_email, clean_mobile


def _contact_fields(name: str, email: str, mobile: str | None, *, mobile_required: bool) -> dict:
    errors: dict[str, str] = {}
    clean_name = " ".join(name.split())
    if len(clean_name) < 2:
        errors["contact_name"] = "name_length"
    clean_mail, err = clean_email(email)
    if err:
        errors["contact_email"] = err
    clean_mob = None
    if mobile or mobile_required:
        clean_mob, err = clean_mobile(mobile)
        if err:
            errors["contact_mobile"] = err
    if errors:
        raise ApiError(422, "validation", "Please check the highlighted fields.", errors)
    return {"name": clean_name, "email": clean_mail, "mobile": clean_mob}


def create_sponsor(
    db: Session, event: Event, data: SponsorApplyIn, *, status: str, actor: User | None = None,
    booth_number: str | None = None,
) -> Sponsor:
    contact = _contact_fields(data.contact_name, data.contact_email, data.contact_mobile, mobile_required=True)
    sponsor = Sponsor(
        event_id=event.id,
        company_name=" ".join(data.company_name.split()),
        company_name_ar=(data.company_name_ar or "").strip() or None,
        tier=data.tier,
        website=data.website or None,
        description=(data.description or "").strip() or None,
        booth_number=(booth_number or "").strip() or None,
        contact_name=contact["name"],
        contact_email=contact["email"],
        contact_mobile=contact["mobile"],
        status=status,
        booth_token=secrets.token_urlsafe(18),
        approved_at=svc.utcnow() if status == "approved" else None,
        created_by_id=actor.id if actor else None,
    )
    db.add(sponsor)
    db.flush()
    db.add(SponsorMember(
        sponsor_id=sponsor.id,
        full_name=contact["name"],
        email=contact["email"],
        mobile=contact["mobile"],
        title=None,
        qr_token=secrets.token_urlsafe(18),
        access_token=secrets.token_urlsafe(32),
        is_contact=True,
    ))
    db.flush()
    db.refresh(sponsor)
    return sponsor


def contact_member(sponsor: Sponsor) -> SponsorMember:
    return next((m for m in sponsor.members if m.is_contact), sponsor.members[0])


def ensure_portal_user(db: Session, sponsor: Sponsor, member: SponsorMember) -> tuple[User, str | None]:
    """Give a member a portal login. Returns (user, temporary password or None if they already had one)."""
    if member.user_id:
        user = db.get(User, member.user_id)
        if user is not None:
            if not user.is_active:
                user.is_active = True
                user.token_version += 1
            return user, None
    existing = db.scalar(select(User).where(User.email == member.email))
    if existing is not None:
        if existing.role == "sponsor" and existing.sponsor_id == sponsor.id:
            member.user_id = existing.id
            return existing, None
        raise ApiError(409, "email_taken", "This email already has an account. Use a different contact email.",
                       {"email": "email_taken"})
    temporary = generate_password()
    user = User(
        email=member.email,
        full_name=member.full_name,
        role="sponsor",
        sponsor_id=sponsor.id,
        password_hash=hash_password(temporary),
        must_change_password=True,
        is_active=True,
        token_version=0,
    )
    db.add(user)
    db.flush()
    member.user_id = user.id
    return user, temporary


def approve_sponsor(
    db: Session, sponsor: Sponsor, *, actor: User, background: BackgroundTasks, request: Request | None,
    tier: str | None = None, booth_number: str | None = None, notify: bool = True,
) -> dict:
    if tier:
        sponsor.tier = tier
    if booth_number is not None:
        sponsor.booth_number = booth_number.strip() or None
    sponsor.status = "approved"
    sponsor.approved_at = sponsor.approved_at or svc.utcnow()
    member = contact_member(sponsor)
    user, temporary = ensure_portal_user(db, sponsor, member)
    audit(db, actor=actor, action="sponsor.approved", entity_type="sponsor", entity_id=sponsor.id,
          event_id=sponsor.event_id, details={"company": sponsor.company_name, "tier": sponsor.tier}, request=request)
    db.commit()
    emailed = queue_sponsor_approved_email(background, sponsor, sponsor.event, member, user.email, temporary) if notify else False
    return {"login_email": user.email, "temporary_password": temporary, "emailed": emailed}


def add_member(
    db: Session, sponsor: Sponsor, data: SponsorMemberIn, *, background: BackgroundTasks,
) -> tuple[SponsorMember, str | None, bool]:
    contact = _contact_fields(data.full_name, data.email, data.mobile, mobile_required=False)
    if any(m.email == contact["email"] for m in sponsor.members):
        raise ApiError(409, "duplicate", "This person is already on the team.", {"email": "already_registered"})
    if len(sponsor.members) >= 25:
        raise ApiError(422, "team_full", "A sponsor team can have up to 25 members.")
    member = SponsorMember(
        sponsor_id=sponsor.id,
        full_name=contact["name"],
        email=contact["email"],
        mobile=contact["mobile"],
        title=(data.title or "").strip() or None,
        qr_token=secrets.token_urlsafe(18),
        access_token=secrets.token_urlsafe(32),
        is_contact=False,
    )
    db.add(member)
    db.flush()
    temporary = None
    if data.portal_access:
        _, temporary = ensure_portal_user(db, sponsor, member)
    db.commit()
    db.refresh(member)
    emailed = queue_sponsor_member_email(background, member, sponsor, sponsor.event, temporary) if data.notify else False
    return member, temporary, emailed


def lead_counts(db: Session, sponsor_ids: list[int]) -> dict[int, int]:
    if not sponsor_ids:
        return {}
    rows = db.execute(
        select(SponsorLead.sponsor_id, func.count()).where(SponsorLead.sponsor_id.in_(sponsor_ids)).group_by(SponsorLead.sponsor_id)
    ).all()
    return {sid: n for sid, n in rows}


def upsert_lead(
    db: Session, sponsor: Sponsor, reg: Registration, *, method: str, consent: bool, captured_by: User | None,
) -> tuple[SponsorLead, bool]:
    """Record an attendee as a lead once per sponsor. Returns (lead, created)."""
    lead = db.scalar(select(SponsorLead).where(SponsorLead.sponsor_id == sponsor.id, SponsorLead.registration_id == reg.id))
    if lead is not None:
        # A booth visit after a badge scan upgrades the lead: the attendee has now shared their details.
        if consent and not lead.consent:
            lead.consent = True
            lead.method = method if method == "booth_qr" else lead.method
        return lead, False
    lead = SponsorLead(
        sponsor_id=sponsor.id,
        event_id=sponsor.event_id,
        registration_id=reg.id,
        method=method,
        consent=consent,
        captured_by_id=captured_by.id if captured_by else None,
    )
    db.add(lead)
    db.flush()
    return lead, True


def sponsor_stats(db: Session, sponsor: Sponsor) -> dict:
    from .models import BadgeScan  # local import keeps the module import order simple

    now = svc.utcnow()
    tz = svc.tz_of(sponsor.event)
    today = now.astimezone(tz).date()
    leads = db.scalars(select(SponsorLead).where(SponsorLead.sponsor_id == sponsor.id)).all()
    member_ids = [m.id for m in sponsor.members]
    badge_scans = 0
    if member_ids:
        badge_scans = db.scalar(select(func.count()).select_from(BadgeScan).where(BadgeScan.member_id.in_(member_ids))) or 0
    return {
        "leads_total": len(leads),
        "leads_today": sum(1 for lead in leads if lead.captured_at.astimezone(tz).date() == today),
        "booth_visits": sum(1 for lead in leads if lead.method == "booth_qr"),
        "badge_scans": sum(1 for lead in leads if lead.method == "badge_scan"),
        "with_contact": sum(1 for lead in leads if lead.consent or lead.registration.sponsor_consent),
        "team_entries": badge_scans,
        "members": len(sponsor.members),
    }
