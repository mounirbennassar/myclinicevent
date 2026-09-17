"""Member portal: sign up once, then apply to events without filling a form again."""

from datetime import datetime, timedelta

from sqlalchemy import select

from app.models import MemberProfile, Registration, User

from .conftest import RIYADH, attendee, client_for, make_user, national_id
from .test_api import create_event

MEMBER_PASSWORD = "member-password-123"


def signup_payload(n: int, **overrides) -> dict:
    data = attendee(n)
    data.update({"password": MEMBER_PASSWORD, "sponsor_consent": False})
    data.update(overrides)
    return data


def future_session(days: int = 7) -> dict:
    day = (datetime.now(RIYADH) + timedelta(days=days)).date().isoformat()
    return {"date": day, "start": "09:00", "end": "12:00"}


def past_session(days: int = 3) -> dict:
    day = (datetime.now(RIYADH) - timedelta(days=days)).date().isoformat()
    return {"date": day, "start": "09:00", "end": "12:00"}


def admin_client(db):
    make_user(db, "super@test.com", "super_admin")
    return client_for("super@test.com")


def test_signup_creates_member_and_signs_in(db):
    client = client_for()
    r = client.post("/api/member/signup", json=signup_payload(1))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["user"]["role"] == "member"
    assert body["profile"]["national_id"] == national_id(1)
    # The session cookie is set, so the portal works straight away.
    assert client.get("/api/member/me").status_code == 200
    assert client.get("/api/auth/me").json()["role"] == "member"
    user = db.scalar(select(User).where(User.email == "person1@example.com"))
    assert user is not None and user.role == "member"
    assert db.scalar(select(MemberProfile).where(MemberProfile.user_id == user.id)).mobile
    # And they can sign in again later with the password they chose.
    assert client_for("person1@example.com", MEMBER_PASSWORD).get("/api/member/me").status_code == 200


def test_signup_validates_fields_and_rejects_duplicates(db):
    client = client_for()
    bad = client.post("/api/member/signup", json=signup_payload(2, password="short", consent=False, email="nope"))
    assert bad.status_code == 422
    fields = bad.json()["detail"]["fields"]
    assert fields["password"] == "password_short"
    assert fields["consent"] == "consent_required"
    assert "email" in fields
    assert client.post("/api/member/signup", json=signup_payload(2)).status_code == 201
    same_email = client_for().post("/api/member/signup", json=signup_payload(3, email="person2@example.com"))
    assert same_email.status_code == 409 and same_email.json()["detail"]["code"] == "account_exists"
    same_id = client_for().post("/api/member/signup", json=signup_payload(3, national_id=national_id(2)))
    assert same_id.status_code == 409 and same_id.json()["detail"]["code"] == "national_id_taken"
    # A staff email can't be taken over through sign-up either.
    make_user(db, "staff@test.com", "staff")
    staff_email = client_for().post("/api/member/signup", json=signup_payload(4, email="staff@test.com"))
    assert staff_email.status_code == 409


def test_member_applies_with_saved_details(db):
    admin = admin_client(db)
    event = create_event(admin, title="Cardiology Update", sessions=[future_session()])
    member = client_for()
    assert member.post("/api/member/signup", json=signup_payload(5, sponsor_consent=True)).status_code == 201

    listing = member.get("/api/member/events").json()
    assert [row["event"]["slug"] for row in listing] == [event["slug"]]
    assert listing[0]["registration"] is None and listing[0]["event"]["registration_state"] == "open"

    applied = member.post(f"/api/member/events/{event['slug']}/apply", json={})
    assert applied.status_code == 201, applied.text
    assert applied.json()["already_registered"] is False
    reg = db.scalar(select(Registration).where(Registration.event_id == event["id"]))
    expected = attendee(5)
    assert (reg.email, reg.national_id, reg.scfhs_number, reg.profession) == (
        expected["email"], expected["national_id"], expected["scfhs_number"], expected["profession"]
    )
    assert reg.member_id is not None and reg.sponsor_consent is True and reg.consent_at is not None
    # The pass works like any other registration.
    assert client_for().get(f"/api/public/passes/{applied.json()['registration']['access_token']}").status_code == 200

    # Applying again is harmless and returns the same pass.
    again = member.post(f"/api/member/events/{event['slug']}/apply", json={})
    assert again.status_code == 200 and again.json()["already_registered"] is True
    assert again.json()["registration"]["ticket_code"] == applied.json()["registration"]["ticket_code"]
    assert member.get("/api/member/events").json()[0]["registration"]["ticket_code"] == reg.ticket_code
    # The team sees it in the normal attendee list.
    attendees = admin.get(f"/api/events/{event['id']}/registrations").json()
    assert attendees["total"] == 1


def test_member_cannot_apply_to_ended_draft_or_closed_events(db):
    admin = admin_client(db)
    ended = create_event(admin, title="Past Scientific Day", sessions=[past_session()])
    draft = create_event(admin, title="Private Draft", status="draft", sessions=[future_session()])
    closed = create_event(admin, title="Closed Event", status="closed", sessions=[future_session()])
    member = client_for()
    member.post("/api/member/signup", json=signup_payload(6))
    r = member.post(f"/api/member/events/{ended['slug']}/apply", json={})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "registration_ended"
    assert member.post(f"/api/member/events/{draft['slug']}/apply", json={}).status_code == 404
    assert member.post(f"/api/member/events/{closed['slug']}/apply", json={}).status_code == 404
    # Being signed in must not open the public form on a non-published event either.
    public = member.post(f"/api/public/events/{closed['slug']}/register", json=attendee(60))
    assert public.status_code == 409
    # Drafts never show in the portal; the ended event does, as history.
    slugs = [row["event"]["slug"] for row in member.get("/api/member/events").json()]
    assert slugs == [ended["slug"]]


def test_member_has_no_team_or_sponsor_access(db):
    admin = admin_client(db)
    event = create_event(admin, title="Team Only", sessions=[future_session()])
    member = client_for()
    member.post("/api/member/signup", json=signup_payload(7))
    assert member.get("/api/events").json() == []
    assert member.get("/api/stats/overview").json()["events"] == []
    assert member.get(f"/api/events/{event['id']}").status_code == 404
    assert member.get(f"/api/events/{event['id']}/registrations").status_code == 404
    assert member.get("/api/users").status_code == 403
    assert member.get("/api/sponsor/me").status_code == 403
    # Staff can't use the member portal, and members don't show up as team accounts.
    assert admin.get("/api/member/me").status_code == 403
    assert all(u["role"] != "member" for u in admin.get("/api/users").json())


def test_signup_claims_earlier_public_registration_only_on_full_match(db):
    admin = admin_client(db)
    event = create_event(admin, title="Claimable", sessions=[future_session()])
    other = create_event(admin, title="Not Mine", sessions=[future_session(9)])
    public = client_for()
    assert public.post(f"/api/public/events/{event['slug']}/register", json=attendee(8)).status_code == 201
    # Same email on another event, but a different person's ID and mobile: must not be claimed.
    assert public.post(
        f"/api/public/events/{other['slug']}/register",
        json=attendee(9, email="person8@example.com"),
    ).status_code == 201

    member = client_for()
    assert member.post("/api/member/signup", json=signup_payload(8)).status_code == 201
    rows = {row["event"]["slug"]: row["registration"] for row in member.get("/api/member/events").json()}
    assert rows[event["slug"]] is not None
    assert rows[other["slug"]] is None
    # Applying to the claimed event returns the existing pass instead of a duplicate error.
    again = member.post(f"/api/member/events/{event['slug']}/apply", json={})
    assert again.status_code == 200 and again.json()["already_registered"] is True
    # The other event already has this email under someone else's details: explain, don't leak.
    blocked = member.post(f"/api/member/events/{other['slug']}/apply", json={})
    assert blocked.status_code == 409 and blocked.json()["detail"]["code"] == "duplicate_unlinked"


def test_profile_update_changes_future_applications_only(db):
    admin = admin_client(db)
    first = create_event(admin, title="First Event", sessions=[future_session()])
    second = create_event(admin, title="Second Event", sessions=[future_session(10)])
    member = client_for()
    member.post("/api/member/signup", json=signup_payload(10))
    member.post(f"/api/member/events/{first['slug']}/apply", json={})
    updated = member.patch("/api/member/profile", json={"mobile": "0555000111", "profession": "nurse"})
    assert updated.status_code == 200, updated.text
    assert updated.json()["profile"]["profession"] == "nurse"
    bad = member.patch("/api/member/profile", json={"national_id": "123"})
    assert bad.status_code == 422 and "national_id" in bad.json()["detail"]["fields"]
    member.post(f"/api/member/events/{second['slug']}/apply", json={})
    regs = {r.event_id: r for r in db.scalars(select(Registration))}
    assert regs[first["id"]].profession == "consultant"
    assert regs[second["id"]].profession == "nurse"
