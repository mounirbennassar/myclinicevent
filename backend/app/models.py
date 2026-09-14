from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    full_name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(255))
    # super_admin | admin | staff | sponsor
    role: Mapped[str] = mapped_column(String(20), default="staff")
    # Sponsor portal users belong to exactly one sponsor and see nothing else.
    # use_alter breaks the users ⇄ sponsors FK cycle for create_all/drop_all (the migration is unaffected).
    sponsor_id: Mapped[int | None] = mapped_column(
        ForeignKey("sponsors.id", ondelete="CASCADE", use_alter=True, name="fk_users_sponsor_id"), index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    # Bumped on password change/reset or deactivation to revoke existing sessions.
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Event(TimestampMixin, Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    title: Mapped[str] = mapped_column(String(250))
    title_ar: Mapped[str | None] = mapped_column(String(250))
    description: Mapped[str | None] = mapped_column(Text)
    description_ar: Mapped[str | None] = mapped_column(Text)
    venue: Mapped[str] = mapped_column(String(250))
    venue_ar: Mapped[str | None] = mapped_column(String(250))
    venue_map_url: Mapped[str | None] = mapped_column(String(500))
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Riyadh")
    # Derived from sessions: earliest start / latest end.
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    cme_hours: Mapped[float | None] = mapped_column(Float)
    accreditation_text: Mapped[str | None] = mapped_column(Text)
    accreditation_ar: Mapped[str | None] = mapped_column(Text)
    scfhs_activity_code: Mapped[str | None] = mapped_column(String(64))
    # Minimum share of session time (percent) required for CME eligibility.
    attendance_threshold: Mapped[int] = mapped_column(Integer, default=80)
    # overall: threshold applies to total time | each: every session must reach it on its own.
    session_rule: Mapped[str] = mapped_column(String(10), default="overall", server_default="overall")
    # Issue (and email) the certificate at the check-out scan that meets the requirement.
    auto_issue_certificates: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    capacity: Mapped[int | None] = mapped_column(Integer)
    registration_open: Mapped[bool] = mapped_column(Boolean, default=True)
    registration_closes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # draft | published | closed | archived
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    # When an attendee never scans out, credit them until the end of the event.
    count_open_until_end: Mapped[bool] = mapped_column(Boolean, default=True)
    certificates_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    accent: Mapped[str] = mapped_column(String(20), default="teal")
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    sessions: Mapped[list[EventSession]] = relationship(
        back_populates="event", cascade="all, delete-orphan", order_by="EventSession.starts_at"
    )
    team: Mapped[list[EventStaff]] = relationship(back_populates="event", cascade="all, delete-orphan")


class EventSession(Base):
    """A time window that counts toward CME attendance (e.g. a day, or a morning block)."""

    __tablename__ = "event_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    title: Mapped[str | None] = mapped_column(String(200))
    title_ar: Mapped[str | None] = mapped_column(String(200))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    event: Mapped[Event] = relationship(back_populates="sessions")


class EventStaff(Base):
    """Assigns a staff user to an event. Admins and super admins have access to every event."""

    __tablename__ = "event_staff"

    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    # manager | scanner
    role: Mapped[str] = mapped_column(String(20), default="scanner")
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    event: Mapped[Event] = relationship(back_populates="team")
    user: Mapped[User] = relationship(lazy="joined")


class Registration(TimestampMixin, Base):
    __tablename__ = "registrations"
    __table_args__ = (
        UniqueConstraint("event_id", "national_id", name="uq_registration_event_national_id"),
        UniqueConstraint("event_id", "email", name="uq_registration_event_email"),
        Index("ix_registrations_event_status", "event_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    ticket_code: Mapped[str] = mapped_column(String(16), unique=True)
    # Secret for the attendee's private pass page.
    access_token: Mapped[str] = mapped_column(String(64), unique=True)
    # Encoded in the attendee QR. Separate from access_token so a photographed QR can't open the pass.
    qr_token: Mapped[str] = mapped_column(String(64), unique=True)
    full_name: Mapped[str] = mapped_column(String(250))
    email: Mapped[str] = mapped_column(String(255))
    mobile: Mapped[str] = mapped_column(String(32))
    scfhs_number: Mapped[str] = mapped_column(String(40))
    national_id: Mapped[str] = mapped_column(String(20))
    profession: Mapped[str | None] = mapped_column(String(40))
    # online | walkin | import
    source: Mapped[str] = mapped_column(String(10), default="online")
    # registered | cancelled
    status: Mapped[str] = mapped_column(String(12), default="registered")
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Opted in to sharing contact details with sponsors who scan their badge.
    sponsor_consent: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Manager override of CME eligibility; NULL means "use the attendance calculation".
    eligibility_override: Mapped[bool | None] = mapped_column(Boolean)
    notes: Mapped[str | None] = mapped_column(Text)
    certificate_code: Mapped[str | None] = mapped_column(String(24), unique=True)
    certificate_issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    email_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    event: Mapped[Event] = relationship()
    scans: Mapped[list[Scan]] = relationship(
        back_populates="registration", cascade="all, delete-orphan", order_by="Scan.scanned_at"
    )


class Scan(Base):
    __tablename__ = "scans"
    __table_args__ = (
        Index("ix_scans_registration_time", "registration_id", "scanned_at"),
        Index("ix_scans_event_time", "event_id", "scanned_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    registration_id: Mapped[int] = mapped_column(ForeignKey("registrations.id", ondelete="CASCADE"))
    # in | out
    direction: Mapped[str] = mapped_column(String(3))
    scanned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # qr | manual | admin
    method: Mapped[str] = mapped_column(String(10), default="qr")
    scanned_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    device: Mapped[str | None] = mapped_column(String(160))
    # Voided scans are kept for the record but ignored in attendance.
    voided: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[str | None] = mapped_column(String(300))

    registration: Mapped[Registration] = relationship(back_populates="scans")
    scanned_by: Mapped[User | None] = relationship(lazy="joined")


class Sponsor(TimestampMixin, Base):
    """A company sponsoring or exhibiting at an event. Applies publicly, approved by a manager."""

    __tablename__ = "sponsors"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    company_name: Mapped[str] = mapped_column(String(200))
    company_name_ar: Mapped[str | None] = mapped_column(String(200))
    # platinum | gold | silver | bronze | exhibitor | partner
    tier: Mapped[str] = mapped_column(String(20), default="exhibitor")
    logo_url: Mapped[str | None] = mapped_column(String(500))
    website: Mapped[str | None] = mapped_column(String(300))
    description: Mapped[str | None] = mapped_column(Text)
    description_ar: Mapped[str | None] = mapped_column(Text)
    booth_number: Mapped[str | None] = mapped_column(String(40))
    contact_name: Mapped[str] = mapped_column(String(200))
    contact_email: Mapped[str] = mapped_column(String(255))
    contact_mobile: Mapped[str] = mapped_column(String(32))
    # pending | approved | rejected
    status: Mapped[str] = mapped_column(String(12), default="pending", index=True)
    show_publicly: Mapped[bool] = mapped_column(Boolean, default=True)
    # Encoded in the booth QR as a URL attendees open with any camera app.
    booth_token: Mapped[str] = mapped_column(String(64), unique=True)
    notes: Mapped[str | None] = mapped_column(Text)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    event: Mapped[Event] = relationship()
    members: Mapped[list[SponsorMember]] = relationship(
        back_populates="sponsor", cascade="all, delete-orphan", order_by="SponsorMember.id"
    )


class SponsorMember(Base):
    """Booth staff. Each gets a badge QR for gate access and, optionally, a portal login."""

    __tablename__ = "sponsor_members"

    id: Mapped[int] = mapped_column(primary_key=True)
    sponsor_id: Mapped[int] = mapped_column(ForeignKey("sponsors.id", ondelete="CASCADE"), index=True)
    full_name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(255))
    mobile: Mapped[str | None] = mapped_column(String(32))
    title: Mapped[str | None] = mapped_column(String(120))
    # Scanned at the gate: "MCS1:<qr_token>".
    qr_token: Mapped[str] = mapped_column(String(64), unique=True)
    # Secret for the member's badge page.
    access_token: Mapped[str] = mapped_column(String(64), unique=True)
    is_contact: Mapped[bool] = mapped_column(Boolean, default=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    sponsor: Mapped[Sponsor] = relationship(back_populates="members")
    user: Mapped[User | None] = relationship(foreign_keys=[user_id], lazy="joined")


class SponsorLead(Base):
    """An attendee who visited a sponsor's booth (scanned the booth QR) or whose badge a rep scanned."""

    __tablename__ = "sponsor_leads"
    __table_args__ = (UniqueConstraint("sponsor_id", "registration_id", name="uq_lead_sponsor_registration"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    sponsor_id: Mapped[int] = mapped_column(ForeignKey("sponsors.id", ondelete="CASCADE"), index=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    registration_id: Mapped[int] = mapped_column(ForeignKey("registrations.id", ondelete="CASCADE"), index=True)
    # booth_qr (attendee scanned the booth) | badge_scan (rep scanned the attendee)
    method: Mapped[str] = mapped_column(String(12))
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    captured_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    # True when the attendee shared their details themselves (booth visit) or opted in at registration.
    consent: Mapped[bool] = mapped_column(Boolean, default=False)
    rating: Mapped[int | None] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    registration: Mapped[Registration] = relationship(lazy="joined")
    captured_by: Mapped[User | None] = relationship(lazy="joined")


class BadgeScan(Base):
    """A sponsor badge read at the gate."""

    __tablename__ = "badge_scans"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("sponsor_members.id", ondelete="CASCADE"), index=True)
    scanned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    scanned_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    member: Mapped[SponsorMember] = relationship(lazy="joined")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(String(60), index=True)
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str | None] = mapped_column(String(40))
    # No FK so the trail survives event deletion.
    event_id: Mapped[int | None] = mapped_column(Integer, index=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    ip: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    actor: Mapped[User | None] = relationship(lazy="joined")
