export type Locale = "en" | "ar";
export type Role = "super_admin" | "admin" | "staff" | "sponsor" | "member";
export type SponsorTier = "platinum" | "gold" | "silver" | "bronze" | "exhibitor" | "partner";
export type SponsorStatus = "pending" | "approved" | "rejected";
export type TeamRole = "manager" | "scanner";
export type EventStatus = "draft" | "published" | "closed" | "archived";
export type AttendanceStatus = "not_arrived" | "inside" | "checked_out" | "no_checkout";
export type RegistrationState = "open" | "closed" | "full" | "ended" | "not_published";
export type Accent = "teal" | "turquoise" | "purple" | "fuchsia" | "navy" | "apple" | "orange";
export type SessionRule = "overall" | "each";
export type RegistrationSource = "online" | "walkin" | "import";
export type CertificateBlocker = "certificates_disabled" | "not_eligible" | "event_not_ended";
export type ScanResultCode =
  | "checked_in"
  | "checked_out"
  | "duplicate"
  | "already_in"
  | "not_in"
  | "invalid"
  | "wrong_event"
  | "cancelled"
  | "outside_window"
  | "sponsor_badge"
  | "badge_inactive";

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  sponsor_id: number | null;
  last_login_at: string | null;
  created_at: string;
}

export interface MemberProfile {
  full_name: string;
  email: string;
  mobile: string;
  scfhs_number: string;
  national_id: string;
  profession: string | null;
  sponsor_consent: boolean;
  member_since: string;
}

export interface MemberMe {
  user: User;
  profile: MemberProfile;
}

export interface MemberRegistration {
  id: number;
  ticket_code: string;
  access_token: string;
  pass_url: string;
  registered_at: string;
  certificate_issued: boolean;
  certificate_url: string | null;
}

export interface MemberEventRow {
  event: PublicEvent;
  registration: MemberRegistration | null;
}

export interface EventSession {
  id: number;
  title: string | null;
  title_ar: string | null;
  /** Local date/time in the event's timezone. */
  date: string;
  start: string;
  end: string;
  starts_at: string;
  ends_at: string;
}

export interface PublicEvent {
  id: number;
  slug: string;
  title: string;
  title_ar: string | null;
  description: string | null;
  description_ar: string | null;
  venue: string;
  venue_ar: string | null;
  venue_map_url: string | null;
  timezone: string;
  cme_hours: number | null;
  accreditation_text: string | null;
  accreditation_ar: string | null;
  scfhs_activity_code: string | null;
  attendance_threshold: number;
  session_rule: SessionRule;
  capacity: number | null;
  accent: Accent;
  starts_at: string;
  ends_at: string;
  status: EventStatus;
  sessions: EventSession[];
  required_minutes: number;
  registration_url: string;
  calendar_url: string;
  registration_state?: RegistrationState;
  seats_left?: number | null;
  is_preview?: boolean;
  sponsors?: SponsorPublic[];
  sponsor_apply_url?: string;
}

export interface SponsorPublic {
  id: number;
  company_name: string;
  company_name_ar: string | null;
  tier: SponsorTier;
  logo_url: string | null;
  website: string | null;
  description: string | null;
  description_ar: string | null;
  booth_number: string | null;
}

export interface Sponsor extends SponsorPublic {
  event_id: number;
  status: SponsorStatus;
  show_publicly: boolean;
  contact_name: string;
  contact_email: string;
  contact_mobile: string;
  notes: string | null;
  booth_url: string;
  created_at: string;
  approved_at: string | null;
  leads: number;
  members: number;
}

export interface SponsorMember {
  id: number;
  full_name: string;
  email: string;
  mobile: string | null;
  title: string | null;
  is_contact: boolean;
  portal_access: boolean;
  badge_url: string;
  qr_payload: string;
  created_at: string;
}

export interface SponsorDetail extends Sponsor {
  members_list: SponsorMember[];
  apply_url: string;
  account?: { login_email: string; temporary_password: string | null; emailed: boolean };
}

export interface SponsorLead {
  id: number;
  method: "booth_qr" | "badge_scan";
  captured_at: string;
  captured_by: string | null;
  consent: boolean;
  rating: number | null;
  note: string | null;
  attendee: {
    full_name: string;
    profession: string | null;
    ticket_code: string;
    email: string | null;
    mobile: string | null;
  };
}

export interface SponsorMe {
  sponsor: Sponsor;
  event: PublicEvent;
  booth_url: string;
  stats: {
    leads_total: number;
    leads_today: number;
    booth_visits: number;
    badge_scans: number;
    with_contact: number;
    team_entries: number;
    members: number;
  };
}

export interface BoothInfo {
  sponsor: SponsorPublic;
  event: PublicEvent;
}

export interface BoothVisitResult {
  sponsor: SponsorPublic;
  attendee_name: string;
  first_visit: boolean;
  visited_at: string;
  booths_visited: number;
  booths_total: number;
}

export interface BadgeInfo {
  member: { full_name: string; title: string | null };
  sponsor: SponsorPublic;
  event: PublicEvent;
  qr_payload: string;
}

export interface AdminEvent extends PublicEvent {
  registration_open: boolean;
  registration_closes_at: string | null;
  count_open_until_end: boolean;
  certificates_enabled: boolean;
  auto_issue_certificates: boolean;
  created_at: string;
  updated_at: string;
  registered: number;
  my_access: TeamRole | null;
}

export interface Interval {
  start: string;
  end: string | null;
}

export interface SessionAttendance {
  index: number;
  start: string;
  end: string;
  attended_minutes: number;
  required_minutes: number;
  percent: number;
  met: boolean;
}

export interface Attendance {
  status: AttendanceStatus;
  attended_minutes: number;
  required_minutes: number;
  threshold: number;
  session_rule: SessionRule;
  percent: number;
  eligible: boolean;
  computed_eligible: boolean;
  override: boolean | null;
  remaining_minutes: number;
  achievable: boolean;
  first_in: string | null;
  last_scan_at: string | null;
  last_direction: "in" | "out" | null;
  intervals: Interval[];
  sessions: SessionAttendance[];
}

export interface Registration {
  id: number;
  ticket_code: string;
  full_name: string;
  email: string;
  mobile: string;
  scfhs_number: string;
  national_id: string;
  profession: string | null;
  source: RegistrationSource;
  status: "registered" | "cancelled";
  created_at: string;
  certificate_code: string | null;
  certificate_issued_at: string | null;
  eligibility_override: boolean | null;
  notes: string | null;
  attendance: Attendance;
}

export interface Scan {
  id: number;
  direction: "in" | "out";
  scanned_at: string;
  method: "qr" | "manual" | "admin";
  voided: boolean;
  note: string | null;
  device: string | null;
  scanned_by: string | null;
}

export interface RegistrationDetail extends Registration {
  scans: Scan[];
  email_sent_at: string | null;
  certificate_blocker: CertificateBlocker | null;
  pass_url?: string;
}

export interface RegistrationList {
  items: Registration[];
  total: number;
  page: number;
  page_size: number;
  counts: Record<string, number>;
}

export interface ScanPerson {
  id: number;
  ticket_code: string;
  full_name: string;
}

export interface ScanResult {
  result: ScanResultCode;
  message: string;
  registration: (ScanPerson & { profession: string | null; certificate_code: string | null }) | null;
  attendance: Attendance | null;
  scan: Scan | null;
  other_event: string | null;
  certificate_issued: boolean;
  certificate_emailed: boolean;
  sponsor?: {
    company_name: string;
    tier: SponsorTier;
    booth_number: string | null;
    member_name: string;
    member_title: string | null;
  };
}

export interface ImportResult {
  created: number;
  total_rows: number;
  emailed: boolean;
  skipped: { row: number; name: string; code: string; fields: Record<string, string> }[];
}

export interface RecentScan extends Scan {
  registration: ScanPerson;
}

export interface EventStats {
  generated_at: string;
  event_id: number;
  threshold: number;
  session_rule: SessionRule;
  required_minutes: number;
  sessions: { index: number; title: string | null; title_ar: string | null; start: string; end: string; attended: number; met: number }[];
  phase: "live" | "upcoming" | "ended";
  totals: {
    registered: number;
    arrived: number;
    inside: number;
    checked_out: number;
    no_checkout: number;
    not_arrived: number;
    eligible: number;
    certificates_issued: number;
    walkins: number;
    cancelled: number;
    avg_percent: number;
    capacity: number | null;
  };
  registrations_daily: { date: string; count: number; cumulative: number }[];
  days: string[];
  day: string;
  hourly: { hour: string; in: number; out: number }[];
  occupancy: { time: string; inside: number }[];
  attendance_buckets: { from: number; to: number; count: number }[];
  professions: { name: string; count: number }[];
  sources: { online: number; walkin: number; import: number };
  recent_scans: RecentScan[];
}

export interface OverviewEvent {
  id: number;
  slug: string;
  title: string;
  title_ar: string | null;
  status: EventStatus;
  venue: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  phase: "live" | "upcoming" | "past";
  registered: number;
  capacity: number | null;
  arrived: number | null;
  inside: number | null;
  eligible: number | null;
}

export interface Overview {
  generated_at: string;
  totals: {
    events: number;
    live: number;
    upcoming: number;
    registrations: number;
    inside_now: number;
    certificates: number;
  };
  events: OverviewEvent[];
}

export interface Pass {
  event: PublicEvent;
  attendee: {
    full_name: string;
    ticket_code: string;
    email: string;
    mobile: string;
    scfhs_number: string;
    profession: string | null;
    registered_at: string;
  };
  qr_payload: string;
  attendance: Attendance;
  certificate: { available: boolean; blocker: CertificateBlocker | null; code: string | null };
  booth_visits: { sponsor: string; at: string }[];
  sponsors_total: number;
}

export interface Certificate {
  certificate_code: string;
  issued_at: string;
  full_name: string;
  scfhs_number: string;
  attended_minutes: number;
  percent: number;
  verify_url: string;
  event: PublicEvent;
}

export interface VerifyResult {
  valid: boolean;
  certificate_code: string;
  issued_at: string;
  full_name: string;
  event: {
    title: string;
    title_ar: string | null;
    venue: string;
    venue_ar: string | null;
    starts_at: string;
    ends_at: string;
    timezone: string;
    cme_hours: number | null;
    scfhs_activity_code: string | null;
  };
}

export interface TeamMember {
  user: User;
  role: TeamRole;
  added_at: string;
}

export interface AuditItem {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  event_id: number | null;
  details: Record<string, unknown>;
  ip: string | null;
  created_at: string;
  actor: { id: number; full_name: string; email: string } | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}
