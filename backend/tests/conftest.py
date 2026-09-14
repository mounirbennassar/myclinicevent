import os

# Must be set before the app (and its settings) are imported.
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://localhost/myclinic_events_test"
)
os.environ["SECRET_KEY"] = "test-secret-key-that-is-long-enough-for-hs256"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["SUPERADMIN_EMAIL"] = ""
# Blank out real providers from backend/.env so tests never send email.
os.environ["SMTP_HOST"] = ""
os.environ["RESEND_API_KEY"] = ""

from datetime import datetime, timedelta  # noqa: E402
from zoneinfo import ZoneInfo  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.security import hash_password  # noqa: E402
from app.validators import national_id_check_digit  # noqa: E402

PASSWORD = "correct-horse-battery"
RIYADH = ZoneInfo("Asia/Riyadh")


@pytest.fixture(scope="session", autouse=True)
def schema():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture(autouse=True)
def clean_tables():
    yield
    with engine.begin() as conn:
        conn.execute(text(
            "TRUNCATE audit_logs, badge_scans, sponsor_leads, sponsor_members, sponsors, scans, registrations, "
            "event_staff, event_sessions, events, users RESTART IDENTITY CASCADE"
        ))


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


def make_user(db, email: str, role: str) -> User:
    user = User(email=email, full_name=f"{role.title()} Person", role=role,
                password_hash=hash_password(PASSWORD), is_active=True, token_version=0)
    db.add(user)
    db.commit()
    return user


def client_for(email: str | None = None, password: str = PASSWORD) -> TestClient:
    client = TestClient(app)
    if email:
        r = client.post("/api/auth/login", json={"email": email, "password": password})
        assert r.status_code == 200, r.text
    return client


def national_id(n: int) -> str:
    first_nine = f"1{n:08d}"
    return first_nine + national_id_check_digit(first_nine)


def live_session() -> dict:
    """A session on today's Riyadh date that covers the current moment."""
    now = datetime.now(RIYADH)
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start = max(midnight, now - timedelta(hours=2))
    end = min(midnight + timedelta(hours=23, minutes=59), now + timedelta(hours=2))
    return {"date": now.date().isoformat(), "start": start.strftime("%H:%M"), "end": end.strftime("%H:%M")}


def attendee(n: int, **overrides) -> dict:
    # Names can't contain digits, so spell the number with letters (1 → "B", 12 → "Bc").
    word = "".join(chr(97 + int(d)) for d in str(n)).title()
    data = {
        "full_name": f"Attendee {word}son Test",
        "email": f"person{n}@example.com",
        "mobile": f"05{n:08d}",
        "scfhs_number": f"12-R-{n:05d}",
        "national_id": national_id(n),
        "profession": "consultant",
        "consent": True,
    }
    data.update(overrides)
    return data
