from datetime import datetime, timedelta

from .conftest import RIYADH, attendee, client_for, live_session, make_user

from app.security import create_reset_token  # noqa: E402  (conftest sets env first)


def create_event(client, **overrides):
    body = {"title": "Scientific Day 2026", "venue": "My Clinic, Riyadh", "status": "published",
            "cme_hours": 6, "sessions": [live_session()]}
    body.update(overrides)
    r = client.post("/api/events", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_registration_scan_and_stats(db):
    make_user(db, "super@test.com", "super_admin")
    admin = client_for("super@test.com")
    event = create_event(admin)
    slug, event_id = event["slug"], event["id"]
    assert event["registration_url"].endswith(f"/e/{slug}")

    public = client_for()
    assert public.get(f"/api/public/events/{slug}").json()["registration_state"] == "open"

    r = public.post(f"/api/public/events/{slug}/register", json=attendee(1, email="Person1@Example.com"))
    assert r.status_code == 201, r.text
    token, ticket = r.json()["access_token"], r.json()["ticket_code"]

    dup = public.post(f"/api/public/events/{slug}/register", json=attendee(1))
    assert dup.status_code == 409 and dup.json()["detail"]["code"] == "duplicate"

    bad = public.post(f"/api/public/events/{slug}/register",
                      json=attendee(2, full_name="Noura", email="x", national_id="1234567890", consent=False))
    assert bad.status_code == 422
    assert set(bad.json()["detail"]["fields"]) == {"full_name", "email", "national_id", "consent"}

    pass_ = public.get(f"/api/public/passes/{token}").json()
    assert pass_["attendance"]["status"] == "not_arrived"
    qr = pass_["qr_payload"]

    scan = f"/api/events/{event_id}/scan"
    assert admin.post(scan, json={"code": qr}).json()["result"] == "checked_in"
    assert admin.post(scan, json={"code": qr}).json()["result"] == "duplicate"
    out = admin.post(scan, json={"code": qr, "mode": "out"}).json()
    assert out["result"] == "checked_out" and out["attendance"]["status"] == "checked_out"
    assert admin.post(scan, json={"code": qr, "mode": "out"}).json()["result"] == "not_in"
    assert admin.post(scan, json={"code": "MCE1:not-a-real-token"}).json()["result"] == "invalid"
    # Typed fallback: ticket code without the prefix, in lower case.
    assert admin.post(scan, json={"code": ticket.lower().removeprefix("mc-"), "mode": "in"}).json()["result"] == "checked_in"

    stats = admin.get(f"/api/events/{event_id}/stats").json()
    assert stats["totals"]["registered"] == 1
    assert stats["totals"]["arrived"] == 1 and stats["totals"]["inside"] == 1
    assert sum(h["in"] for h in stats["hourly"]) == 2
    assert stats["recent_scans"][0]["registration"]["ticket_code"] == ticket

    export = admin.get(f"/api/events/{event_id}/registrations/export.xlsx")
    assert export.status_code == 200
    assert export.headers["content-type"].startswith("application/vnd.openxmlformats")

    overview = admin.get("/api/stats/overview").json()
    assert overview["totals"]["registrations"] == 1 and overview["totals"]["live"] == 1


def test_capacity_and_closed_registration(db):
    make_user(db, "super@test.com", "super_admin")
    admin = client_for("super@test.com")
    event = create_event(admin, capacity=1)
    public = client_for()
    assert public.post(f"/api/public/events/{event['slug']}/register", json=attendee(1)).status_code == 201
    full = public.post(f"/api/public/events/{event['slug']}/register", json=attendee(2))
    assert full.status_code == 409 and full.json()["detail"]["code"] == "registration_full"

    draft = create_event(admin, title="Draft Event", status="draft")
    assert public.get(f"/api/public/events/{draft['slug']}").status_code == 404
    assert admin.get(f"/api/public/events/{draft['slug']}").json()["is_preview"] is True


def test_staff_only_see_assigned_events(db):
    make_user(db, "super@test.com", "super_admin")
    staff_user = make_user(db, "staff@test.com", "staff")
    admin = client_for("super@test.com")
    staff = client_for("staff@test.com")
    event = create_event(admin)
    event_id = event["id"]
    client_for().post(f"/api/public/events/{event['slug']}/register", json=attendee(1))

    assert staff.get("/api/events").json() == []
    assert staff.get(f"/api/events/{event_id}").status_code == 404

    r = admin.put(f"/api/events/{event_id}/team/{staff_user.id}", json={"role": "scanner"})
    assert r.status_code == 200, r.text
    assert [e["id"] for e in staff.get("/api/events").json()] == [event_id]
    assert staff.get(f"/api/events/{event_id}").json()["my_access"] == "scanner"

    assert staff.patch(f"/api/events/{event_id}", json={"title": "Hacked"}).status_code == 403
    assert staff.get(f"/api/events/{event_id}/registrations/export.xlsx").status_code == 403
    assert staff.post("/api/users", json={"email": "x@test.com", "full_name": "X Y"}).status_code == 403
    row = staff.get(f"/api/events/{event_id}/registrations").json()["items"][0]
    assert row["national_id"].startswith("••••••")

    walkin = staff.post(f"/api/events/{event_id}/registrations", json=attendee(5))
    assert walkin.status_code == 201 and walkin.json()["source"] == "walkin"


def test_certificate_rules(db):
    make_user(db, "super@test.com", "super_admin")
    admin = client_for("super@test.com")
    day = (datetime.now(RIYADH) - timedelta(days=3)).date().isoformat()
    event = create_event(admin, sessions=[{"date": day, "start": "08:00", "end": "12:00"}])  # 240 min, past
    eid = event["id"]

    def walkin(n):
        r = admin.post(f"/api/events/{eid}/registrations", json=attendee(n))
        assert r.status_code == 201, r.text
        return r.json()

    def manual(rid, direction, hhmm):
        r = admin.post(f"/api/events/{eid}/registrations/{rid}/scans",
                       json={"direction": direction, "at": f"{day}T{hhmm}:00+03:00"})
        assert r.status_code == 201, r.text
        return r.json()

    good, short = walkin(1), walkin(2)
    manual(good["id"], "in", "08:05")
    detail = manual(good["id"], "out", "11:50")  # 225 of 240 min
    assert detail["attendance"]["eligible"] and detail["attendance"]["percent"] == 93.7
    manual(short["id"], "in", "08:00")
    manual(short["id"], "out", "09:00")

    public = client_for()
    token = good["pass_url"].rsplit("/", 1)[1]
    assert public.get(f"/api/public/passes/{token}").json()["certificate"]["available"] is True
    cert = public.get(f"/api/public/passes/{token}/certificate")
    assert cert.status_code == 200, cert.text
    code = cert.json()["certificate_code"]
    assert public.get(f"/api/public/verify/{code.lower()}").json()["full_name"] == good["full_name"]

    short_token = short["pass_url"].rsplit("/", 1)[1]
    denied = public.get(f"/api/public/passes/{short_token}/certificate")
    assert denied.status_code == 403 and denied.json()["detail"]["code"] == "not_eligible"

    admin.patch(f"/api/events/{eid}/registrations/{short['id']}", json={"eligibility_override": True})
    assert public.get(f"/api/public/passes/{short_token}/certificate").status_code == 200

    # Revoking stops verification straight away.
    revoked = admin.delete(f"/api/events/{eid}/registrations/{good['id']}/certificate")
    assert revoked.status_code == 200 and revoked.json()["certificate_code"] is None
    assert public.get(f"/api/public/verify/{code}").status_code == 404


def test_certificate_is_issued_at_the_qualifying_checkout(db):
    """The QR check-out that completes the attendance requirement hands out the certificate."""
    make_user(db, "super@test.com", "super_admin")
    admin = client_for("super@test.com")
    now = datetime.now(RIYADH)
    # A session that started 5 hours ago and runs another hour: 6h required, 80% = 4h48m.
    start = now - timedelta(hours=5)
    day = start.date().isoformat()
    if start.date() != now.date():  # just after midnight: use a short session instead
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        day = start.date().isoformat()
    end = min(now + timedelta(hours=1), now.replace(hour=23, minute=59))
    event = create_event(admin, sessions=[{"date": day, "start": start.strftime("%H:%M"), "end": end.strftime("%H:%M")}])
    eid = event["id"]
    reg = admin.post(f"/api/events/{eid}/registrations", json=attendee(1)).json()
    qr = client_for().get(f"/api/public/passes/{reg['pass_url'].rsplit('/', 1)[1]}").json()["qr_payload"]

    # Check in "at the start" via a manual scan, then check out now with the QR.
    manual = admin.post(f"/api/events/{eid}/registrations/{reg['id']}/scans",
                        json={"direction": "in", "at": start.isoformat()})
    assert manual.status_code == 201, manual.text
    out = admin.post(f"/api/events/{eid}/scan", json={"code": qr, "mode": "out"}).json()
    assert out["result"] == "checked_out", out
    if out["attendance"]["eligible"]:
        assert out["certificate_issued"] is True
        assert out["registration"]["certificate_code"].startswith("CME-")
        # A second check-out can't issue twice; the pass shows it as available.
        pass_ = client_for().get(f"/api/public/passes/{reg['pass_url'].rsplit('/', 1)[1]}").json()
        assert pass_["certificate"]["available"] and pass_["certificate"]["code"] == out["registration"]["certificate_code"]

    # With auto-issue switched off, an eligible check-out issues nothing.
    admin.patch(f"/api/events/{eid}", json={"auto_issue_certificates": False})
    reg2 = admin.post(f"/api/events/{eid}/registrations", json=attendee(2)).json()
    admin.post(f"/api/events/{eid}/registrations/{reg2['id']}/scans", json={"direction": "in", "at": start.isoformat()})
    out2 = admin.post(f"/api/events/{eid}/registrations/{reg2['id']}/scans", json={"direction": "out"}).json()
    assert out2["certificate_code"] is None


def test_import_spreadsheet(db):
    make_user(db, "super@test.com", "super_admin")
    admin = client_for("super@test.com")
    event = create_event(admin)
    eid = event["id"]
    good = attendee(1)
    dup = attendee(1, email="other@example.com")  # same National ID as row 1
    bad = attendee(3, mobile="12")
    csv_text = "Full name,Email,Mobile,SCFHS No.,National ID / Iqama,Profession\n" + "\n".join(
        ",".join([r["full_name"], r["email"], r["mobile"], r["scfhs_number"], r["national_id"], "استشاري"])
        for r in (good, dup, bad)
    )
    r = admin.post(f"/api/events/{eid}/registrations/import", files={"file": ("list.csv", csv_text.encode(), "text/csv")})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["created"] == 1 and body["total_rows"] == 3
    assert [s["row"] for s in body["skipped"]] == [3, 4]
    assert body["skipped"][0]["code"] == "duplicate" and body["skipped"][1]["fields"] == {"mobile": "mobile_invalid"}
    items = admin.get(f"/api/events/{eid}/registrations?source=import").json()["items"]
    assert len(items) == 1 and items[0]["profession"] == "consultant"
    assert client_for().get(f"/api/public/events/{event['slug']}/calendar.ics").text.startswith("BEGIN:VCALENDAR")


def test_user_management(db):
    make_user(db, "super@test.com", "super_admin")
    admin_user = make_user(db, "admin@test.com", "admin")
    sup = client_for("super@test.com")

    r = sup.post("/api/users", json={"email": "New.Staff@test.com", "full_name": "New Staff", "role": "staff"})
    assert r.status_code == 201, r.text
    temp = r.json()["temporary_password"]
    new_staff = client_for("new.staff@test.com", temp)
    assert new_staff.get("/api/auth/me").json()["must_change_password"] is True
    changed = new_staff.post("/api/auth/change-password",
                             json={"current_password": temp, "new_password": "a-much-better-password"})
    assert changed.status_code == 200 and changed.json()["must_change_password"] is False

    me = sup.get("/api/auth/me").json()
    assert sup.patch(f"/api/users/{me['id']}", json={"is_active": False}).json()["detail"]["code"] == "self_change"

    admin = client_for("admin@test.com")
    assert admin.post("/api/users", json={"email": "y@test.com", "full_name": "Y Z"}).status_code == 403
    assert admin.get("/api/users").status_code == 200

    sup.patch(f"/api/users/{admin_user.id}", json={"is_active": False})
    assert admin.get("/api/auth/me").status_code == 401  # deactivation ends existing sessions


def test_password_reset_link(db):
    user = make_user(db, "staff@test.com", "staff")
    public = client_for()
    # Unknown emails get the same answer, so accounts can't be discovered.
    assert public.post("/api/auth/forgot-password", json={"email": "nobody@test.com"}).json() == {"ok": True}
    assert public.post("/api/auth/forgot-password", json={"email": "staff@test.com"}).json() == {"ok": True}

    token = create_reset_token(user)
    public.cookies.set("mce_session", token)
    assert public.get("/api/auth/me").status_code == 401  # a reset token is not a session
    public.cookies.clear()

    r = public.post("/api/auth/reset-password", json={"token": token, "new_password": "brand-new-password-1"})
    assert r.status_code == 200, r.text
    assert public.get("/api/auth/me").status_code == 200  # signed in straight away
    again = client_for().post("/api/auth/reset-password", json={"token": token, "new_password": "another-password-22"})
    assert again.status_code == 400  # single use
    client_for("staff@test.com", "brand-new-password-1")


def test_public_catalogue_includes_past_published_events_only(db):
    make_user(db, "super@test.com", "super_admin")
    admin = client_for("super@test.com")
    future_day = (datetime.now(RIYADH) + timedelta(days=7)).date().isoformat()
    past_day = (datetime.now(RIYADH) - timedelta(days=3)).date().isoformat()
    upcoming = create_event(admin, title="Upcoming Scientific Day", sessions=[{"date": future_day, "start": "09:00", "end": "12:00"}])
    past = create_event(admin, title="Past Scientific Day", sessions=[{"date": past_day, "start": "09:00", "end": "12:00"}])
    create_event(admin, title="Private Draft", status="draft")
    create_event(admin, title="Closed Event", status="closed")
    public = client_for()
    default_feed = public.get("/api/public/events")
    assert default_feed.status_code == 200
    assert [e["id"] for e in default_feed.json()] == [upcoming["id"]]
    catalogue = public.get("/api/public/events?include_past=true")
    assert catalogue.status_code == 200
    assert [e["id"] for e in catalogue.json()] == [upcoming["id"], past["id"]]
    assert [e["registration_state"] for e in catalogue.json()] == ["open", "ended"]
    # Adding a past event to the catalogue must never reopen registration.
    response = public.post(f"/api/public/events/{past['slug']}/register", json=attendee(9))
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "registration_ended"
