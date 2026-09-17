"""Create the super admin and, optionally, realistic demo data.

    uv run python -m app.seed            # super admin from .env only
    uv run python -m app.seed --demo     # plus demo team, events, registrations and scans
    uv run python -m app.seed --reset --demo   # wipe everything first (refused in production)

Demo data: one event happening right now (so the live dashboard and scanner have something to show),
one upcoming event, and one past event with certificates issued.
"""

import argparse
import random
import secrets
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import select, text

from . import services as svc
from .config import settings
from .db import SessionLocal, engine
from .main import ensure_superadmin
from .models import Event, EventStaff, MemberProfile, Registration, Scan, User
from .schemas import RegistrationIn, SessionIn, SponsorApplyIn
from .sponsors import contact_member, create_sponsor, upsert_lead
from .security import hash_password
from .validators import national_id_check_digit

TZ = svc.zone(settings.default_timezone)
rng = random.Random(2026)

MALE = ["Abdullah", "Mohammed", "Khalid", "Fahad", "Saud", "Faisal", "Turki", "Majed", "Omar", "Yousef",
        "Ahmed", "Salman", "Nasser", "Ibrahim", "Hamad", "Bandar", "Sultan", "Ali", "Hassan", "Rakan"]
FEMALE = ["Noura", "Sara", "Reem", "Latifa", "Hind", "Mona", "Jawaher", "Amal", "Aisha", "Ghada",
          "Lama", "Abeer", "Nouf", "Maha", "Dalal", "Haifa", "Rana", "Shahad", "Asma", "Wafa"]
FATHER = ["Saad", "Nasser", "Abdulaziz", "Fahad", "Salem", "Hamad", "Mohammed", "Abdullah", "Ibrahim", "Sulaiman"]
FAMILY = ["Al-Qahtani", "Al-Otaibi", "Al-Dossari", "Al-Shammari", "Al-Harbi", "Al-Ghamdi", "Al-Anazi",
          "Al-Subaie", "Al-Zahrani", "Al-Mutairi", "Al-Sudairi", "Bajaber", "Al-Rasheed", "Al-Hazmi",
          "Bawazir", "Al-Juhani", "Al-Qarni", "Al-Omari", "Al-Shehri", "Al-Maliki"]
FIRST_AR = ["عبدالله", "محمد", "خالد", "فهد", "نورة", "سارة", "ريم", "لطيفة", "هند", "منى"]
FATHER_AR = ["سعد", "ناصر", "عبدالعزيز", "فهد", "سالم", "حمد"]
FAMILY_AR = ["القحطاني", "العتيبي", "الدوسري", "الشمري", "الحربي", "الغامدي", "العنزي", "الزهراني"]
PROFESSIONS = [("consultant", 14), ("specialist", 18), ("resident", 16), ("gp", 14), ("nurse", 18),
               ("pharmacist", 8), ("dentist", 5), ("allied_health", 5), ("student", 2)]

_person_counter = 0


def person() -> dict:
    global _person_counter
    _person_counter += 1
    n = _person_counter
    female = rng.random() < 0.5
    first = rng.choice(FEMALE if female else MALE)
    family = rng.choice(FAMILY)
    if rng.random() < 0.15:
        full_name = f"{rng.choice(FIRST_AR)} {rng.choice(FATHER_AR)} {rng.choice(FAMILY_AR)}"
    else:
        title = "Dr. " if rng.random() < 0.45 else ""
        full_name = f"{title}{first} {rng.choice(FATHER)} {family}"
    first_nine = f"{rng.choice('12')}{rng.randint(0, 99_999_999):08d}"
    return {
        "full_name": full_name,
        "email": f"{first.lower()}.{family.lower().replace('al-', '')}.{n}@example.com",
        "mobile": f"+9665{rng.randint(0, 99_999_999):08d}",
        "scfhs_number": f"{rng.randint(10, 24)}-R-{rng.randint(10000, 99999)}",
        "national_id": first_nine + national_id_check_digit(first_nine),
        "profession": rng.choices([p for p, _ in PROFESSIONS], weights=[w for _, w in PROFESSIONS])[0],
    }


def local(d: date, hhmm: str) -> datetime:
    return datetime.combine(d, time.fromisoformat(hhmm), tzinfo=TZ)


def make_event(db, *, sessions: list[SessionIn], creator_id: int, **fields) -> Event:
    event = Event(**fields, created_by_id=creator_id)
    event.slug = svc.unique_slug(db, svc.slugify(fields["title"]))
    svc.set_sessions(event, sessions)
    db.add(event)
    db.flush()
    return event


def add_registration(db, event: Event, created_at: datetime, source: str = "online", by: int | None = None) -> Registration:
    created = created_at.astimezone(UTC)
    reg = Registration(
        event_id=event.id,
        ticket_code=svc.new_ticket_code(db),
        access_token=secrets.token_urlsafe(32),
        qr_token=secrets.token_urlsafe(18),
        source=source,
        status="registered",
        consent_at=created,
        created_at=created,
        updated_at=created,
        created_by_id=by,
        **person(),
    )
    db.add(reg)
    return reg


def registrations_before(db, event: Event, count: int, now: datetime, days: int = 21) -> list[Registration]:
    """Online sign-ups spread over the weeks before the event, busier near the date."""
    regs = []
    for _ in range(count):
        created = event.starts_at - timedelta(days=days * rng.random() ** 2, hours=rng.randint(1, 14),
                                              minutes=rng.randint(0, 59))
        regs.append(add_registration(db, event, min(created, now - timedelta(minutes=5))))
    db.flush()
    return regs


def simulate_attendance(db, event: Event, regs: list[Registration], now: datetime, scanner_ids: list[int],
                        arrive_rate: float = 0.85) -> None:
    """Arrivals around the start, lunch breaks between sessions, some early leavers."""
    windows = [(s.starts_at, s.ends_at) for s in event.sessions]
    first_start, last_end = windows[0][0], windows[-1][1]
    for reg in regs:
        if rng.random() > arrive_rate:
            continue
        arrive = first_start + timedelta(minutes=rng.choice([-25, -15, -10, -5, 0, 5, 10, 20, 35, 60, 90])
                                         + rng.randint(0, 9))
        if arrive > now:
            continue
        scans = [("in", arrive)]
        profile = rng.random()
        if len(windows) > 1 and profile < 0.45:  # steps out for lunch
            out = windows[0][1] + timedelta(minutes=rng.randint(-8, 6))
            back = windows[1][0] + timedelta(minutes=rng.randint(-10, 18))
            if arrive < out <= now:
                scans.append(("out", out))
                if back <= now and rng.random() < 0.9:
                    scans.append(("in", back))
        elif profile < 0.62:  # leaves early
            out = arrive + timedelta(minutes=rng.randint(60, 240))
            if out <= now:
                scans.append(("out", out))
        if last_end <= now and scans[-1][0] == "in" and rng.random() < 0.9:
            scans.append(("out", last_end + timedelta(minutes=rng.randint(-20, 10))))
        for direction, at in scans:
            if at <= now:
                db.add(Scan(event_id=event.id, registration_id=reg.id, direction=direction,
                            scanned_at=at.astimezone(UTC), recorded_at=at.astimezone(UTC), method="qr",
                            scanned_by_id=rng.choice(scanner_ids)))
    db.flush()


def seed_demo() -> None:
    with SessionLocal() as db:
        if db.scalar(select(Event.id).limit(1)):
            print("Events already exist, so no demo data was added. Use --reset --demo to start over.")
            return
        password = secrets.token_urlsafe(9)

        def user(email: str, name: str, role: str) -> User:
            u = db.scalar(select(User).where(User.email == email))
            if u is None:
                u = User(email=email, full_name=name, role=role, password_hash=hash_password(password),
                         is_active=True, token_version=0)
                db.add(u)
                db.flush()
            return u

        creator = db.scalar(select(User).where(User.role == "super_admin")) or user(
            "events.admin@myclinic.local", "Events Admin", "admin")
        user("events.admin@myclinic.local", "Events Admin", "admin")
        manager = user("omar.manager@myclinic.local", "Omar Al-Harbi", "staff")
        scanner = user("sara.scanner@myclinic.local", "Sara Al-Dossari", "staff")
        gate = user("fahad.gate@myclinic.local", "Fahad Al-Otaibi", "staff")
        now = svc.utcnow()
        today = now.astimezone(TZ)

        # 1) Happening now: two sessions with a lunch break, the current time in the afternoon block.
        start = today - timedelta(hours=4, minutes=30)
        start = start.replace(minute=start.minute // 30 * 30, second=0, microsecond=0)
        start = max(start, today.replace(hour=0, minute=0, second=0, microsecond=0))
        last_minute = today.replace(hour=23, minute=59, second=0, microsecond=0)
        a_end, b_start, b_end = start + timedelta(hours=4), start + timedelta(hours=4, minutes=30), \
            min(start + timedelta(hours=8), last_minute)
        live = make_event(
            db,
            creator_id=creator.id,
            title="My Clinic Scientific Day 2026",
            title_ar="اليوم العلمي الأول لعيادتي 2026",
            description="A full day of clinical updates for physicians, nurses and pharmacists across My Clinic.",
            description_ar="يوم كامل من المستجدات السريرية للأطباء والتمريض والصيادلة في عيادتي.",
            venue="My Clinic Conference Hall, Riyadh",
            venue_ar="قاعة مؤتمرات عيادتي، الرياض",
            venue_map_url="https://maps.google.com/?q=Riyadh",
            cme_hours=6,
            accreditation_text="Demo event. CME hours are awarded to attendees who attend at least 80% of the programme.",
            accreditation_ar="فعالية تجريبية. تُمنح ساعات التعليم الطبي المستمر لمن يحضر 80% على الأقل من البرنامج.",
            scfhs_activity_code="DEMO-0412",
            capacity=300,
            status="published",
            accent="teal",
            sessions=[
                SessionIn(date=start.date(), start=start.time(), end=a_end.time(),
                          title="Morning sessions", title_ar="الجلسات الصباحية"),
                SessionIn(date=start.date(), start=b_start.time(), end=b_end.time(),
                          title="Afternoon sessions", title_ar="الجلسات المسائية"),
            ],
        )
        live_regs = registrations_before(db, live, 168, now)
        simulate_attendance(db, live, live_regs, now, [scanner.id, gate.id])
        for _ in range(12):  # walk-ins registered at the desk this morning
            at = min(live.starts_at + timedelta(minutes=rng.randint(-20, 150)), now - timedelta(minutes=2))
            reg = add_registration(db, live, at, source="walkin", by=scanner.id)
            db.flush()
            db.add(Scan(event_id=live.id, registration_id=reg.id, direction="in", scanned_at=at + timedelta(minutes=1),
                        recorded_at=at + timedelta(minutes=1), method="qr", scanned_by_id=scanner.id))
        live_regs[0].status = "cancelled"
        live.team.extend([EventStaff(user_id=manager.id, role="manager"), EventStaff(user_id=scanner.id, role="scanner"),
                          EventStaff(user_id=gate.id, role="scanner")])

        # 2) Upcoming, registration open.
        upcoming_day = (today + timedelta(days=21)).date()
        upcoming = make_event(
            db,
            creator_id=creator.id,
            title="Family Medicine Update: Diabetes Care",
            title_ar="مستجدات طب الأسرة: رعاية مرضى السكري",
            description="Practical updates on diagnosing and managing type 2 diabetes in primary care.",
            description_ar="مستجدات عملية في تشخيص وعلاج السكري من النوع الثاني في الرعاية الأولية.",
            venue="My Clinic Training Centre, Jeddah",
            venue_ar="مركز التدريب في عيادتي، جدة",
            cme_hours=5,
            accreditation_text="Demo event. Attend at least 80% of the programme to be eligible for CME hours.",
            scfhs_activity_code="DEMO-0519",
            capacity=150,
            status="published",
            accent="purple",
            sessions=[SessionIn(date=upcoming_day, start=time(9), end=time(15))],
        )
        registrations_before(db, upcoming, 64, now, days=18)
        upcoming.team.append(EventStaff(user_id=manager.id, role="manager"))

        # 3) Past, closed, certificates issued.
        past_day = (today - timedelta(days=20)).date()
        past = make_event(
            db,
            creator_id=creator.id,
            title="Emergency Medicine Workshop",
            title_ar="ورشة عمل طب الطوارئ",
            venue="My Clinic Conference Hall, Riyadh",
            venue_ar="قاعة مؤتمرات عيادتي، الرياض",
            cme_hours=7,
            accreditation_text="Demo event. Attend at least 80% of the programme to be eligible for CME hours.",
            scfhs_activity_code="DEMO-0388",
            status="closed",
            registration_open=False,
            accent="fuchsia",
            sessions=[
                SessionIn(date=past_day, start=time(8), end=time(12), title="Morning", title_ar="الفترة الصباحية"),
                SessionIn(date=past_day, start=time(13), end=time(16), title="Afternoon", title_ar="الفترة المسائية"),
            ],
        )
        past_regs = registrations_before(db, past, 96, now)
        simulate_attendance(db, past, past_regs, now, [scanner.id, gate.id], arrive_rate=0.9)
        for reg, summary in svc.event_attendance(db, past, now):
            if summary.eligible:
                svc.issue_certificate(db, reg)
                reg.certificate_issued_at = past.ends_at + timedelta(days=1)

        # 4) Sponsors: two approved on the live event (with a few leads), one pending on the upcoming one.
        sponsor_password = "Sponsor-Demo-2026"
        demo_sponsors = [
            (live, "approved", "platinum", "A1", "Nova Pharma", "نوفا فارما", "Cardiology and metabolic portfolio.",
             "Lina Haddad", "lina.sponsor@example.com"),
            (live, "approved", "gold", "B3", "MedDevice Arabia", "ميد ديفايس العربية", "Diagnostic imaging and monitoring.",
             "Faisal Rep", "faisal.sponsor@example.com"),
            (upcoming, "pending", "exhibitor", None, "HealthTech Labs", None, "Point-of-care diagnostics.",
             "Sara Applicant", "sara.applicant@example.com"),
        ]
        for ev, status, tier, booth, name, name_ar, desc, contact, email in demo_sponsors:
            sponsor = create_sponsor(
                db, ev,
                SponsorApplyIn(company_name=name, company_name_ar=name_ar, tier=tier, description=desc,
                               contact_name=contact, contact_email=email, contact_mobile=f"05510000{len(db.scalars(select(User)).all()):02d}",
                               website="https://example.com", consent=True),
                status=status, actor=creator, booth_number=booth,
            )
            if status == "approved":
                member = contact_member(sponsor)
                portal_user = User(email=email, full_name=contact, role="sponsor", sponsor_id=sponsor.id,
                                   password_hash=hash_password(sponsor_password), is_active=True, token_version=0)
                db.add(portal_user)
                db.flush()
                member.user_id = portal_user.id
                for reg in live_regs[1:5] if name == "Nova Pharma" else live_regs[5:7]:
                    upsert_lead(db, sponsor, reg, method="booth_qr" if reg.id % 2 else "badge_scan",
                                consent=bool(reg.id % 2), captured_by=None)

        # 5) A demo member who signed up once and already applied to the upcoming event from the portal.
        member_password = "Member-Demo-2026"
        member_nine = "109876543"
        member = User(email="member.demo@example.com", full_name="Dr. Reem Abdulaziz Al-Harbi", role="member",
                      password_hash=hash_password(member_password), is_active=True, token_version=0)
        db.add(member)
        db.flush()
        member_profile = MemberProfile(
            user_id=member.id, mobile="+966555010203", scfhs_number="18-R-40117",
            national_id=member_nine + national_id_check_digit(member_nine), profession="consultant",
            sponsor_consent=True, consent_at=svc.utcnow(),
        )
        db.add(member_profile)
        member_reg = svc.create_registration(
            db, upcoming,
            RegistrationIn(full_name=member.full_name, email=member.email, mobile=member_profile.mobile,
                           scfhs_number=member_profile.scfhs_number, national_id=member_profile.national_id,
                           profession=member_profile.profession, consent=True, sponsor_consent=True),
            source="online",
        )
        member_reg.member_id = member.id

        db.commit()
        print(f"Demo data created: {len(live_regs) + 12} registrations for '{live.title}' (live now),")
        print(f"  64 for '{upcoming.title}', 96 for '{past.title}' (with certificates).")
        print("Demo sponsor portal logins (password for both):", sponsor_password)
        print("   lina.sponsor@example.com (Nova Pharma) · faisal.sponsor@example.com (MedDevice Arabia)")
        print("Demo member portal login:", "member.demo@example.com", "/", member_password)
        print("Demo team accounts (password for all):", password)
        for email in ("events.admin@myclinic.local (admin)", "omar.manager@myclinic.local (event manager)",
                      "sara.scanner@myclinic.local (scanner)", "fahad.gate@myclinic.local (scanner)"):
            print("  ", email)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--demo", action="store_true", help="add demo team, events, registrations and scans")
    parser.add_argument("--reset", action="store_true", help="delete ALL data first (development only)")
    args = parser.parse_args()
    if args.reset:
        if settings.is_production:
            raise SystemExit("Refusing to reset a production database.")
        with engine.begin() as conn:
            conn.execute(text("TRUNCATE audit_logs, scans, registrations, event_staff, event_sessions, events, member_profiles, users "
                              "RESTART IDENTITY CASCADE"))
        print("All data deleted.")
    ensure_superadmin()
    if args.demo:
        seed_demo()


if __name__ == "__main__":
    main()
