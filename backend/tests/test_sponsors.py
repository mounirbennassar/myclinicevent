from .conftest import attendee, client_for, live_session, make_user
from .test_api import create_event

APPLICATION = {
    "company_name": "Nova Pharma",
    "company_name_ar": "نوفا فارما",
    "website": "https://nova.example.com",
    "description": "Cardiology portfolio.",
    "tier": "gold",
    "contact_name": "Lina Haddad",
    "contact_email": "Lina@Nova.example.com",
    "contact_mobile": "0551234567",
    "consent": True,
}


def approved_sponsor(admin, event_id, slug):
    """Apply publicly, approve as admin. Returns (sponsor detail, sponsor client)."""
    r = client_for().post(f"/api/public/events/{slug}/sponsors/apply", json=APPLICATION)
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    r = admin.post(f"/api/events/{event_id}/sponsors/{sid}/approve", json={"booth_number": "A4", "notify": False})
    assert r.status_code == 200, r.text
    detail = r.json()
    assert detail["status"] == "approved" and detail["account"]["login_email"] == "lina@nova.example.com"
    sponsor = client_for("lina@nova.example.com", detail["account"]["temporary_password"])
    return detail, sponsor


def test_application_approval_and_portal_isolation(db):
    make_user(db, "super@test.com", "super_admin")
    admin = client_for("super@test.com")
    event = create_event(admin)
    public = client_for()

    # Pending applications are invisible to the public and blocked from the portal.
    r = public.post(f"/api/public/events/{event['slug']}/sponsors/apply", json=APPLICATION)
    assert r.status_code == 201
    assert public.get(f"/api/public/events/{event['slug']}").json()["sponsors"] == []
    listing = admin.get(f"/api/events/{event['id']}/sponsors").json()
    assert listing["counts"]["pending"] == 1 and listing["items"][0]["members"] == 1

    detail, sponsor = approved_sponsor(admin, event["id"], event["slug"] + "-x") if False else (None, None)
    sid = listing["items"][0]["id"]
    r = admin.post(f"/api/events/{event['id']}/sponsors/{sid}/approve", json={"tier": "platinum", "booth_number": "B1", "notify": False})
    assert r.status_code == 200, r.text
    account = r.json()["account"]
    sponsor = client_for(account["login_email"], account["temporary_password"])

    me = sponsor.get("/api/sponsor/me").json()
    assert me["sponsor"]["tier"] == "platinum" and me["sponsor"]["booth_number"] == "B1"
    assert me["stats"]["members"] == 1 and me["booth_url"].endswith(f"/s/{me['booth_url'].rsplit('/', 1)[1]}")
    # Sponsor accounts see no events and can't touch event endpoints.
    assert sponsor.get("/api/events").json() == []
    assert sponsor.get(f"/api/events/{event['id']}").status_code == 404
    assert sponsor.get(f"/api/events/{event['id']}/registrations").status_code == 404
    assert sponsor.get("/api/users").status_code == 403
    # ...and don't appear in the staff user list.
    assert all(u["role"] != "sponsor" for u in admin.get("/api/users").json())
    # Approved sponsors show publicly, ordered by tier.
    shown = public.get(f"/api/public/events/{event['slug']}").json()["sponsors"]
    assert [s["company_name"] for s in shown] == ["Nova Pharma"]
    assert "contact_email" not in shown[0]


def test_booth_visit_and_badge_scan_consent(db):
    make_user(db, "super@test.com", "super_admin")
    admin = client_for("super@test.com")
    event = create_event(admin)
    eid, slug = event["id"], event["slug"]
    public = client_for()
    r = public.post(f"/api/public/events/{slug}/sponsors/apply", json=APPLICATION)
    sid = r.json()["id"]
    account = admin.post(f"/api/events/{eid}/sponsors/{sid}/approve", json={"notify": False}).json()["account"]
    sponsor = client_for(account["login_email"], account["temporary_password"])
    booth_token = sponsor.get("/api/sponsor/me").json()["booth_url"].rsplit("/", 1)[1]

    # Attendee 1 didn't opt in; attendee 2 did.
    a1 = public.post(f"/api/public/events/{slug}/register", json=attendee(1)).json()
    a2 = public.post(f"/api/public/events/{slug}/register", json=attendee(2, sponsor_consent=True)).json()
    qr1 = public.get(f"/api/public/passes/{a1['access_token']}").json()["qr_payload"]
    qr2 = public.get(f"/api/public/passes/{a2['access_token']}").json()["qr_payload"]

    # Booth page is public; visiting with the pass token shares the contact (consent by action).
    assert public.get(f"/api/public/booths/{booth_token}").json()["sponsor"]["company_name"] == "Nova Pharma"
    visit = public.post(f"/api/public/booths/{booth_token}/visit", json={"pass_token": a1["access_token"]}).json()
    assert visit["first_visit"] is True and visit["booths_visited"] == 1 and visit["booths_total"] == 1
    again = public.post(f"/api/public/booths/{booth_token}/visit", json={"pass_token": a1["access_token"]}).json()
    assert again["first_visit"] is False
    assert public.get(f"/api/public/passes/{a1['access_token']}").json()["booth_visits"][0]["sponsor"] == "Nova Pharma"

    # Rep scans attendee 2's badge: contact revealed because they opted in.
    scanned = sponsor.post("/api/sponsor/leads/scan", json={"code": qr2}).json()
    assert scanned["result"] == "captured" and scanned["lead"]["consent"] is True
    assert scanned["lead"]["attendee"]["email"] == attendee(2)["email"].lower()
    assert sponsor.post("/api/sponsor/leads/scan", json={"code": qr2}).json()["result"] == "already"
    # Scanning attendee 1 again as a badge scan doesn't downgrade the booth-visit consent.
    assert sponsor.post("/api/sponsor/leads/scan", json={"code": qr1}).json()["lead"]["consent"] is True

    # A third attendee who neither opted in nor visited: contact hidden.
    a3 = public.post(f"/api/public/events/{slug}/register", json=attendee(3)).json()
    lead3 = sponsor.post("/api/sponsor/leads/scan", json={"code": a3["ticket_code"]}).json()["lead"]
    assert lead3["consent"] is False and lead3["attendee"]["email"] is None and lead3["attendee"]["mobile"] is None

    leads = sponsor.get("/api/sponsor/leads").json()
    assert leads["total"] == 3 and leads["counts"] == {"all": 3, "booth_qr": 1, "badge_scan": 2, "with_contact": 2}
    rated = sponsor.patch(f"/api/sponsor/leads/{lead3['id']}", json={"rating": 4, "note": "Wants a demo"}).json()
    assert rated["rating"] == 4 and rated["note"] == "Wants a demo"
    export = sponsor.get("/api/sponsor/leads/export.xlsx")
    assert export.status_code == 200 and export.headers["content-type"].startswith("application/vnd.openxmlformats")

    # Identify fallback for attendees without their pass open.
    found = public.post(f"/api/public/booths/{booth_token}/identify", json={"ticket_code": a3["ticket_code"].lower(), "mobile": attendee(3)["mobile"]})
    assert found.status_code == 200 and found.json()["pass_token"] == a3["access_token"]
    assert public.post(f"/api/public/booths/{booth_token}/identify", json={"ticket_code": a3["ticket_code"], "mobile": "0500000000"}).status_code == 404

    # Managers see the same leads.
    assert len(admin.get(f"/api/events/{eid}/sponsors/{sid}/leads").json()) == 3


def test_team_badges_and_gate_scan(db):
    make_user(db, "super@test.com", "super_admin")
    admin = client_for("super@test.com")
    event = create_event(admin)
    eid, slug = event["id"], event["slug"]
    sid = client_for().post(f"/api/public/events/{slug}/sponsors/apply", json=APPLICATION).json()["id"]
    account = admin.post(f"/api/events/{eid}/sponsors/{sid}/approve", json={"notify": False}).json()["account"]
    sponsor = client_for(account["login_email"], account["temporary_password"])

    r = sponsor.post("/api/sponsor/members", json={"full_name": "Omar Rep", "email": "omar@nova.example.com", "portal_access": True, "notify": False})
    assert r.status_code == 201, r.text
    member = r.json()
    assert member["member"]["portal_access"] is True and member["temporary_password"]
    rep = client_for("omar@nova.example.com", member["temporary_password"])
    assert rep.get("/api/sponsor/me").json()["stats"]["members"] == 2
    assert sponsor.post("/api/sponsor/members", json={"full_name": "Omar Rep", "email": "omar@nova.example.com"}).status_code == 409

    # Badge page is public; gate scanner logs the badge without timing it.
    badge_token = member["member"]["badge_url"].rsplit("/", 1)[1]
    badge = client_for().get(f"/api/public/badges/{badge_token}").json()
    assert badge["member"]["full_name"] == "Omar Rep" and badge["qr_payload"].startswith("MCS1:")
    gate = admin.post(f"/api/events/{eid}/scan", json={"code": badge["qr_payload"]}).json()
    assert gate["result"] == "sponsor_badge" and gate["sponsor"]["member_name"] == "Omar Rep"
    assert sponsor.get("/api/sponsor/badge-scans").json()[0]["member"] == "Omar Rep"
    assert sponsor.get("/api/sponsor/me").json()["stats"]["team_entries"] == 1

    # Removing the member deactivates their login.
    assert sponsor.delete(f"/api/sponsor/members/{member['member']['id']}").status_code == 204
    assert rep.get("/api/auth/me").status_code == 401
    contact_id = [m["id"] for m in sponsor.get("/api/sponsor/members").json() if m["is_contact"]][0]
    assert sponsor.delete(f"/api/sponsor/members/{contact_id}").status_code == 422

    # Rejecting later deactivates the portal and hides the sponsor; the badge stops working.
    admin.post(f"/api/events/{eid}/sponsors/{sid}/reject", json={"notify": False})
    assert sponsor.get("/api/sponsor/me").status_code == 401
    assert client_for().get(f"/api/public/events/{slug}").json()["sponsors"] == []


def test_admin_creates_sponsor_directly(db):
    make_user(db, "super@test.com", "super_admin")
    admin = client_for("super@test.com")
    event = create_event(admin)
    r = admin.post(f"/api/events/{event['id']}/sponsors", json=APPLICATION | {"booth_number": "C2", "notify": False})
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "approved" and r.json()["booth_number"] == "C2"
    # Same contact email again for another sponsor is refused.
    dup = admin.post(f"/api/events/{event['id']}/sponsors", json=APPLICATION | {"company_name": "Other Co", "notify": False})
    assert dup.status_code == 409
