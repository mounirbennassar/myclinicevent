# My Clinic Educational — Events Platform

Registration, QR attendance scanning and CME certificates for My Clinic educational events.

**Production URL:** https://event.myclinic.com.sa (registration pages at `/e/<event>`, team sign-in at `/login`, sponsor portal at `/sponsor`).

- **Frontend:** Next.js 16 (App Router) + Tailwind CSS v4, English/Arabic with RTL — `frontend/`
- **Backend:** FastAPI + SQLAlchemy + Alembic — `backend/`
- **Database:** PostgreSQL 15
- **Email:** Resend (SMTP also supported)

## How it covers the My Clinic feedback

| Feedback | Where |
|---|---|
| 1. Main title "My Clinic Educational", event info below it, the 80% CME note | Public event page `/e/<slug>` |
| 2. Mandatory fields: full name (three names), email, mobile, SCFHS number, National ID / Iqama | Registration form (validated server-side, including the Saudi ID checksum and Arabic digits) |
| 3. Dedicated link, embeddable on the My Clinic website, registration QR | Admin → event → **Registration link & QR** (link, PNG/SVG QR, print poster, iframe embed code) |
| 4. Private attendee page with a unique QR | `/r/<private-token>` — emailed on registration |
| 5. Phone-camera scanning, check-in/out, duration, automatic % and 80% eligibility | Admin → event → **Scanner** (works offline, syncs later) |
| 6. One connected, reusable system | Multi-event; duplicate an event to reuse it |

Beyond the brief:
- a sponsor module: public sponsorship applications, a sponsor portal with lead capture (booth QR and badge scanning), team badges for gate access, and admin approval (see below)
- roles (super admin / admin / staff / sponsor) and per-event teams (manager / scanner)
- a live dashboard with charts, including attendance per session
- walk-in registration and bulk import from Excel/CSV
- manual attendance corrections, eligibility overrides and certificate revocation
- an Excel export
- printable certificates with public verification (`/verify/<code>`)
- "Add to calendar" (.ics) and WhatsApp sharing of the attendee pass
- password reset by email
- an audit log

## Run locally

Requirements: Python 3.12 with [uv](https://docs.astral.sh/uv/), Node 20+, PostgreSQL 15.

Keep the project **outside iCloud Drive** (not under `~/Documents` or `~/Desktop` while "Desktop & Documents" sync is on). iCloud evicts `node_modules` and `.venv` files to free space, and every import then blocks on a cloud download. The project lives in `~/dev/myclinic-event` for that reason.

**Backend** (port 8000)

```bash
cd backend
cp .env.example .env          # then set SECRET_KEY and SUPERADMIN_* at least
createdb myclinic_events
uv sync
uv run alembic upgrade head
uv run python -m app.seed --demo   # optional: demo team, 3 events, registrations, scans
uv run uvicorn app.main:app --reload --port 8000
```

The super admin in `.env` is created on first start. `--demo` prints the demo team password.

**Frontend** (port 3000)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. Team sign-in is at `/login`. The frontend proxies `/api/*` to the backend (`BACKEND_URL`, default `http://127.0.0.1:8000`), so there's no CORS to configure.

**Tests**

```bash
createdb myclinic_events_test
cd backend && uv run pytest
```

## Roles

| Role | Can do |
|---|---|
| Super admin | Everything, plus users, event deletion and the audit log |
| Admin | Create and manage every event, assign event teams |
| Staff | Only events they're assigned to, as **Event manager** (attendees, attendance, certificates, export) or **Scanner** (scan, walk-ins, masked attendee list) |

## How attendance and CME eligibility work

- An event has one or more **sessions** (e.g. 08:00–12:00 and 13:00–16:00). Only session time counts, so breaks and time before or after are excluded.
- Scans are paired in time order: check-in → check-out. Several visits add up.
- **Attendance % = attended session time ÷ total session time.** Eligible when ≥ the event's threshold (default 80%).
- Per event, the minimum applies either to the **total** across all sessions (default) or to **every session separately** ("How the minimum applies" in Settings). With the second rule, skipping a whole session means no certificate.
- Forgot to scan out? The visit is closed at the end of *that day*. By default it's credited until then (switchable per event). It never spills into the next day of a multi-day event, and the person isn't "inside" the next morning — their next scan is a fresh check-in.
- Managers can add a missed scan, void a wrong one, override eligibility, or revoke a certificate. Every change is logged.

## Sponsors

1. A company applies at `/e/<slug>/sponsor` (linked from the event page as "Become a sponsor"). Managers can also add a sponsor directly from the event's **Sponsors** tab.
2. A manager approves it (tier, booth number). That creates the contact's **sponsor portal** login (`/sponsor`, emailed with a temporary password), a **booth QR code** and a **badge** for the contact.
3. Approved sponsors appear on the public event page, ordered by tier.

**Lead capture** works two ways, both privacy-safe:
- **Booth QR** (`/s/<token>`): the attendee scans the sponsor's printed code with their phone and taps "Share my contact details". That tap is the consent; the lead appears in the portal with full contact details. The attendee's pass counts booths visited.
- **Badge scan**: a sponsor rep scans an attendee's pass from the portal. Contact details are shown only if the attendee ticked "Allow sponsors who scan my badge…" at registration; otherwise the lead shows name and profession only, with a hint to use the booth code.

The portal also has: team members with their own badge QR codes (read at the gate by the normal scanner and logged as entries), optional portal logins per member, lead rating and notes, Excel export, and a company profile shown to attendees. Sponsor accounts can't reach anything in `/admin`.

## When certificates are issued

The exit scan is what triggers the certificate:

1. The attendee scans out. The system recalculates their attendance.
2. If they now meet the requirement, the certificate is **issued on the spot and emailed** (the scanner shows "Certificate issued and emailed"). A manager recording a forgotten check-out by hand triggers the same check.
3. Someone who never scans out gets theirs from their pass page after the event ends (or when a manager clicks "Issue certificates").

This is the per-event setting "Issue the certificate automatically at the check-out that meets the requirement". Turn it off to issue everything yourself after the event. Certificates are never issued to anyone below the threshold unless a manager sets an eligibility override.

Each certificate has a code and a QR that opens `/verify/<code>`; a revoked code stops verifying immediately.

## Scanning on a phone

Phone cameras only work on **https**. For local testing, the easiest way is a Cloudflare tunnel:

```bash
cloudflared tunnel --url http://localhost:3000
```

Open the `https://….trycloudflare.com` address on the phone. It's already allowed in `next.config.ts`. Set `PUBLIC_BASE_URL` in `backend/.env` to that address so emailed links and QR codes point to it.

## Email (Resend)

Set `RESEND_API_KEY` and `EMAIL_FROM` in `backend/.env`. Until `myclinic.com.sa` is verified in Resend, the test sender `onboarding@resend.dev` only delivers to the Resend account owner's address. Without any provider configured, emails are printed to the API log.

## Deploy with Docker

A ready-made stack is in `docker-compose.yml`: Postgres, the API, the Next.js app and Caddy (automatic HTTPS from Let's Encrypt). On a server with Docker, with the DNS record for `event.myclinic.com.sa` pointing at it:

```bash
cp .env.example .env                  # DOMAIN=event.myclinic.com.sa and POSTGRES_PASSWORD
cp backend/.env.example backend/.env  # SECRET_KEY, SUPERADMIN_*, RESEND_API_KEY, EMAIL_FROM
docker compose up -d --build
```

Migrations run automatically when the API starts. Only Caddy (ports 80/443) is exposed; the API is reachable solely through the Next.js `/api` proxy. Back up the `pgdata` volume (`docker compose exec db pg_dump -U mce myclinic_events > backup.sql`).

The Docker files were written but not built on this machine (Docker wasn't running), so expect to fix small things on the first `docker compose up`.

## Production checklist

- `APP_ENV=production`, a long random `SECRET_KEY`, `COOKIE_SECURE=true`, `PUBLIC_BASE_URL` = the public https address. The compose file sets these.
- Keep the API private. Next.js forwards headers but doesn't add `X-Forwarded-For`; the reverse proxy in front (Caddy in the compose file) must set it, because the API's rate limiter uses the **last** entry of that header as the client IP. Exactly one trusted proxy hop is assumed.
- Run one API instance (the rate limiter is in-memory), or move it to Redis before scaling out.
- This needs a server (Next.js + FastAPI + PostgreSQL). Static hosting such as Cloudflare Pages can't run it.

## To confirm with My Clinic

- The Arabic title used for "My Clinic Educational": **عيادتي التعليمية**.
- SCFHS number format. Validation is deliberately permissive: 4–24 letters, digits, hyphens or slashes.
- Certificate wording and signatory line.
- Whether to keep the National ID / Iqama checksum check (`STRICT_NATIONAL_ID`, on by default).
