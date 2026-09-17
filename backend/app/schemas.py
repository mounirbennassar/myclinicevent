import datetime as dt
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Role = Literal["super_admin", "admin", "staff", "sponsor", "member"]
SponsorTier = Literal["platinum", "gold", "silver", "bronze", "exhibitor", "partner"]
SponsorStatus = Literal["pending", "approved", "rejected"]
EventStatus = Literal["draft", "published", "closed", "archived"]
TeamRole = Literal["manager", "scanner"]
Accent = Literal["teal", "turquoise", "purple", "fuchsia", "navy", "apple", "orange"]
SessionRule = Literal["overall", "each"]


def _http_url(value: str | None) -> str | None:
    # Rendered as a link on the public page, so only allow http(s) — never javascript: URLs.
    if value in (None, ""):
        return None
    if not value.startswith(("https://", "http://")):
        raise ValueError("Must start with https://")
    return value


# ---------- users / auth


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    role: Role
    is_active: bool
    must_change_password: bool
    sponsor_id: int | None = None
    last_login_at: dt.datetime | None
    created_at: dt.datetime


class LoginIn(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(max_length=256)


class ChangePasswordIn(BaseModel):
    current_password: str = Field(max_length=256)
    new_password: str = Field(min_length=10, max_length=128)


StaffRole = Literal["super_admin", "admin", "staff"]


class UserCreate(BaseModel):
    email: str = Field(max_length=255)
    full_name: str = Field(min_length=2, max_length=200)
    role: StaffRole = "staff"
    password: str | None = Field(default=None, min_length=10, max_length=128)


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=200)
    role: StaffRole | None = None
    is_active: bool | None = None


class UserWithPassword(BaseModel):
    user: UserOut
    temporary_password: str | None = None
    email_sent: bool = False


class ForgotPasswordIn(BaseModel):
    email: str = Field(max_length=255)


class ResetPasswordIn(BaseModel):
    token: str = Field(max_length=2000)
    new_password: str = Field(min_length=10, max_length=128)


# ---------- events


class SessionIn(BaseModel):
    """A CME-counted time window, in the event's local timezone."""

    title: str | None = Field(default=None, max_length=200)
    title_ar: str | None = Field(default=None, max_length=200)
    date: dt.date
    start: dt.time
    end: dt.time


class EventCreate(BaseModel):
    title: str = Field(min_length=3, max_length=250)
    title_ar: str | None = Field(default=None, max_length=250)
    slug: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=5000)
    description_ar: str | None = Field(default=None, max_length=5000)
    venue: str = Field(min_length=2, max_length=250)
    venue_ar: str | None = Field(default=None, max_length=250)
    venue_map_url: str | None = Field(default=None, max_length=500)
    timezone: str = "Asia/Riyadh"
    cme_hours: float | None = Field(default=None, ge=0, le=200)
    accreditation_text: str | None = Field(default=None, max_length=2000)
    accreditation_ar: str | None = Field(default=None, max_length=2000)
    scfhs_activity_code: str | None = Field(default=None, max_length=64)
    attendance_threshold: int = Field(default=80, ge=50, le=100)
    session_rule: SessionRule = "overall"
    capacity: int | None = Field(default=None, ge=1, le=100000)
    registration_open: bool = True
    registration_closes_at: dt.datetime | None = None
    status: EventStatus = "draft"
    count_open_until_end: bool = True
    certificates_enabled: bool = True
    auto_issue_certificates: bool = True
    accent: Accent = "teal"
    sessions: list[SessionIn] = Field(min_length=1, max_length=30)

    _check_url = field_validator("venue_map_url")(_http_url)


class EventUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=250)
    title_ar: str | None = Field(default=None, max_length=250)
    slug: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=5000)
    description_ar: str | None = Field(default=None, max_length=5000)
    venue: str | None = Field(default=None, min_length=2, max_length=250)
    venue_ar: str | None = Field(default=None, max_length=250)
    venue_map_url: str | None = Field(default=None, max_length=500)
    timezone: str | None = None
    cme_hours: float | None = Field(default=None, ge=0, le=200)
    accreditation_text: str | None = Field(default=None, max_length=2000)
    accreditation_ar: str | None = Field(default=None, max_length=2000)
    scfhs_activity_code: str | None = Field(default=None, max_length=64)
    attendance_threshold: int | None = Field(default=None, ge=50, le=100)
    session_rule: SessionRule | None = None
    capacity: int | None = Field(default=None, ge=1, le=100000)
    registration_open: bool | None = None
    registration_closes_at: dt.datetime | None = None
    status: EventStatus | None = None
    count_open_until_end: bool | None = None
    certificates_enabled: bool | None = None
    auto_issue_certificates: bool | None = None
    accent: Accent | None = None
    sessions: list[SessionIn] | None = Field(default=None, min_length=1, max_length=30)

    _check_url = field_validator("venue_map_url")(_http_url)


class DuplicateEventIn(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=250)
    shift_days: int = Field(default=0, ge=-3650, le=3650)


class TeamMemberIn(BaseModel):
    role: TeamRole = "scanner"


# ---------- registrations


class RegistrationIn(BaseModel):
    # Loose limits here; the real rules live in validators.py so errors come back per field.
    full_name: str = Field(default="", max_length=300)
    email: str = Field(default="", max_length=300)
    mobile: str = Field(default="", max_length=40)
    scfhs_number: str = Field(default="", max_length=60)
    national_id: str = Field(default="", max_length=40)
    profession: str | None = Field(default=None, max_length=40)
    consent: bool = False
    sponsor_consent: bool = False


class MemberSignupIn(BaseModel):
    """Sign-up form for the member portal: the registration details once, plus a password."""

    # Loose limits here; the real rules live in validators.py so errors come back per field.
    full_name: str = Field(default="", max_length=300)
    email: str = Field(default="", max_length=300)
    mobile: str = Field(default="", max_length=40)
    scfhs_number: str = Field(default="", max_length=60)
    national_id: str = Field(default="", max_length=40)
    profession: str | None = Field(default=None, max_length=40)
    password: str = Field(default="", max_length=128)
    consent: bool = False
    sponsor_consent: bool = False


class MemberProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=300)
    mobile: str | None = Field(default=None, max_length=40)
    scfhs_number: str | None = Field(default=None, max_length=60)
    national_id: str | None = Field(default=None, max_length=40)
    profession: str | None = Field(default=None, max_length=40)
    sponsor_consent: bool | None = None


class MemberApplyIn(BaseModel):
    # None means "use the preference saved on my profile".
    sponsor_consent: bool | None = None


class FindPassIn(BaseModel):
    email: str = Field(max_length=300)
    national_id: str = Field(max_length=40)
    mobile: str = Field(max_length=40)


class RegistrationUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=300)
    email: str | None = Field(default=None, max_length=300)
    mobile: str | None = Field(default=None, max_length=40)
    scfhs_number: str | None = Field(default=None, max_length=60)
    national_id: str | None = Field(default=None, max_length=40)
    profession: str | None = Field(default=None, max_length=40)
    status: Literal["registered", "cancelled"] | None = None
    notes: str | None = Field(default=None, max_length=2000)
    eligibility_override: bool | None = None


# ---------- scanning


class ScanIn(BaseModel):
    # "MCE1:<qr_token>" from a QR, or a typed ticket code / National ID as a fallback.
    code: str = Field(min_length=1, max_length=200)
    mode: Literal["auto", "in", "out"] = "auto"
    # When the scan happened on the device; used for scans queued while offline.
    client_ts: dt.datetime | None = None
    device: str | None = Field(default=None, max_length=160)


class ManualScanIn(BaseModel):
    direction: Literal["in", "out"]
    at: dt.datetime | None = None
    note: str | None = Field(default=None, max_length=300)


class ScanUpdate(BaseModel):
    voided: bool
    note: str | None = Field(default=None, max_length=300)


# ---------- sponsors


class SponsorApplyIn(BaseModel):
    company_name: str = Field(min_length=2, max_length=200)
    company_name_ar: str | None = Field(default=None, max_length=200)
    website: str | None = Field(default=None, max_length=300)
    description: str | None = Field(default=None, max_length=2000)
    tier: SponsorTier = "exhibitor"
    contact_name: str = Field(min_length=2, max_length=200)
    contact_email: str = Field(max_length=300)
    contact_mobile: str = Field(max_length=40)
    consent: bool = False

    _check_url = field_validator("website")(_http_url)


class SponsorCreateIn(SponsorApplyIn):
    """Admin-side creation: approved straight away."""

    booth_number: str | None = Field(default=None, max_length=40)
    notify: bool = True


class SponsorAdminUpdate(BaseModel):
    company_name: str | None = Field(default=None, min_length=2, max_length=200)
    company_name_ar: str | None = Field(default=None, max_length=200)
    tier: SponsorTier | None = None
    booth_number: str | None = Field(default=None, max_length=40)
    website: str | None = Field(default=None, max_length=300)
    logo_url: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=2000)
    description_ar: str | None = Field(default=None, max_length=2000)
    contact_name: str | None = Field(default=None, min_length=2, max_length=200)
    contact_email: str | None = Field(default=None, max_length=300)
    contact_mobile: str | None = Field(default=None, max_length=40)
    show_publicly: bool | None = None
    notes: str | None = Field(default=None, max_length=2000)

    _check_url = field_validator("website", "logo_url")(_http_url)


class SponsorProfileUpdate(BaseModel):
    """What the sponsor may edit about themselves."""

    company_name_ar: str | None = Field(default=None, max_length=200)
    website: str | None = Field(default=None, max_length=300)
    logo_url: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=2000)
    description_ar: str | None = Field(default=None, max_length=2000)
    contact_mobile: str | None = Field(default=None, max_length=40)

    _check_url = field_validator("website", "logo_url")(_http_url)


class SponsorDecisionIn(BaseModel):
    tier: SponsorTier | None = None
    booth_number: str | None = Field(default=None, max_length=40)
    message: str | None = Field(default=None, max_length=1000)
    notify: bool = True


class SponsorMemberIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=200)
    email: str = Field(max_length=300)
    mobile: str | None = Field(default=None, max_length=40)
    title: str | None = Field(default=None, max_length=120)
    portal_access: bool = False
    notify: bool = True


class LeadScanIn(BaseModel):
    code: str = Field(min_length=1, max_length=200)


class LeadUpdate(BaseModel):
    rating: int | None = Field(default=None, ge=1, le=5)
    note: str | None = Field(default=None, max_length=2000)


class BoothIdentifyIn(BaseModel):
    ticket_code: str = Field(max_length=40)
    mobile: str = Field(max_length=40)


class BoothVisitIn(BaseModel):
    pass_token: str = Field(max_length=100)
