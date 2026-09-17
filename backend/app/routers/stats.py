"""Dashboard data. Everything is computed from registrations and scans on request — no cached counters."""

from collections import Counter
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from .. import services as svc
from ..db import get_db
from ..models import Event, EventStaff, Registration, Scan, User
from ..security import ADMIN_ROLES, EventAccess, event_access, get_current_user

router = APIRouter(tags=["stats"])


@router.get("/events/{event_id}/stats")
def event_stats(
    day: str | None = None,
    access: EventAccess = Depends(event_access("scanner")),
    db: Session = Depends(get_db),
):
    event = access.event
    now = svc.utcnow()
    tz = svc.tz_of(event)
    rows = svc.event_attendance(db, event, now)
    summaries = [a for _, a in rows]
    arrived = [a for a in summaries if a.status != "not_arrived"]
    by_status = Counter(a.status for a in summaries)

    totals = {
        "registered": len(rows),
        "arrived": len(arrived),
        "inside": by_status["inside"],
        "checked_out": by_status["checked_out"],
        "no_checkout": by_status["no_checkout"],
        "not_arrived": by_status["not_arrived"],
        "eligible": sum(1 for a in summaries if a.eligible),
        "certificates_issued": sum(1 for r, _ in rows if r.certificate_code),
        "walkins": sum(1 for r, _ in rows if r.source == "walkin"),
        "cancelled": db.scalar(
            select(func.count()).select_from(Registration).where(
                Registration.event_id == event.id, Registration.status == "cancelled"
            )
        ) or 0,
        "avg_percent": round(sum(a.percent for a in arrived) / len(arrived), 1) if arrived else 0.0,
        "capacity": event.capacity,
    }

    # Registrations per local day, with a running total (last 45 days at most).
    reg_dates = sorted(r.created_at.astimezone(tz).date() for r, _ in rows)
    registrations_daily = []
    if reg_dates:
        today = now.astimezone(tz).date()
        last = max(reg_dates[-1], min(today, event.ends_at.astimezone(tz).date()))
        first = max(reg_dates[0], last - timedelta(days=44))
        per_day = Counter(reg_dates)
        running = sum(c for d, c in per_day.items() if d < first)
        d = first
        while d <= last:
            running += per_day.get(d, 0)
            registrations_daily.append({"date": d.isoformat(), "count": per_day.get(d, 0), "cumulative": running})
            d += timedelta(days=1)

    # Pick the event day to chart: the requested one, today if it's an event day, else the first.
    days = sorted({s.starts_at.astimezone(tz).date() for s in event.sessions})
    today = now.astimezone(tz).date()
    try:
        selected = date.fromisoformat(day) if day else None
    except ValueError:
        selected = None
    if selected not in days:
        selected = today if today in days else (days[0] if days else today)
    day_sessions = [s for s in event.sessions if s.starts_at.astimezone(tz).date() == selected]
    if day_sessions:
        day_start = min(s.starts_at for s in day_sessions)
        day_end = max(s.ends_at for s in day_sessions)
    else:
        day_start = datetime.combine(selected, time(8), tzinfo=tz)
        day_end = day_start + timedelta(hours=8)

    all_scans = db.execute(
        select(Scan.direction, Scan.scanned_at).where(Scan.event_id == event.id, Scan.voided.is_(False))
    ).all()
    local_scans = [(d, at.astimezone(tz)) for d, at in all_scans]
    day_scans = [(d, at) for d, at in local_scans if at.date() == selected]

    first_hour = min([day_start.astimezone(tz).hour] + [at.hour for _, at in day_scans])
    last_hour = max([(day_end.astimezone(tz) - timedelta(seconds=1)).hour] + [at.hour for _, at in day_scans])
    hourly = [{"hour": f"{h:02d}:00", "in": 0, "out": 0} for h in range(first_hour, last_hour + 1)]
    for direction, at in day_scans:
        hourly[at.hour - first_hour][direction] += 1

    # How many people were inside at each 15-minute mark (credited visits, so a forgotten check-out
    # follows the event's policy instead of counting as "inside" forever).
    occupancy = []
    tick = day_start - timedelta(minutes=30)
    stop = min(day_end + timedelta(minutes=30), now)
    while tick <= stop:
        inside = sum(1 for a in summaries for start, end in a.credited if start <= tick < end)
        occupancy.append({"time": tick.astimezone(tz).strftime("%H:%M"), "inside": inside})
        tick += timedelta(minutes=15)

    # Per session: how many attended at all, and how many met the threshold for that session.
    session_stats = []
    for i, s in enumerate(sorted(event.sessions, key=lambda s: s.starts_at)):
        per = [a.sessions[i] for a in summaries if i < len(a.sessions)]
        session_stats.append({
            "index": i,
            "title": s.title,
            "title_ar": s.title_ar,
            "start": s.starts_at,
            "end": s.ends_at,
            "attended": sum(1 for p in per if p.attended_seconds > 0),
            "met": sum(1 for p in per if p.met),
        })

    buckets = [{"from": i * 10, "to": i * 10 + 10, "count": 0} for i in range(10)]
    for a in arrived:
        buckets[min(9, int(a.percent // 10))]["count"] += 1

    professions_counter = Counter((r.profession or "unspecified") for r, _ in rows)
    top = professions_counter.most_common(8)
    other = sum(professions_counter.values()) - sum(c for _, c in top)
    professions = [{"name": n, "count": c} for n, c in top] + ([{"name": "other_group", "count": other}] if other else [])

    recent = db.scalars(
        select(Scan)
        .options(joinedload(Scan.registration))
        .where(Scan.event_id == event.id, Scan.voided.is_(False))
        .order_by(Scan.recorded_at.desc(), Scan.id.desc())
        .limit(12)
    ).all()

    return {
        "generated_at": now,
        "event_id": event.id,
        "threshold": event.attendance_threshold,
        "session_rule": event.session_rule,
        "required_minutes": svc.required_minutes(event),
        "sessions": session_stats,
        "phase": "live" if event.starts_at <= now < event.ends_at else ("upcoming" if now < event.starts_at else "ended"),
        "totals": totals,
        "registrations_daily": registrations_daily,
        "days": [d.isoformat() for d in days],
        "day": selected.isoformat(),
        "hourly": hourly,
        "occupancy": occupancy,
        "attendance_buckets": buckets,
        "professions": professions,
        "sources": {
            "online": sum(1 for r, _ in rows if r.source == "online"),
            "walkin": totals["walkins"],
            "import": sum(1 for r, _ in rows if r.source == "import"),
        },
        "recent_scans": [
            svc.scan_out(s) | {"registration": {"id": s.registration.id, "full_name": s.registration.full_name,
                                                "ticket_code": s.registration.ticket_code}}
            for s in recent
        ],
    }


@router.get("/stats/overview")
def overview(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = svc.utcnow()
    q = select(Event).where(Event.status != "archived")
    if user.role in ("sponsor", "member"):
        q = q.where(False)
    elif user.role not in ADMIN_ROLES:
        q = q.join(EventStaff, EventStaff.event_id == Event.id).where(EventStaff.user_id == user.id)
    events = db.scalars(q.order_by(Event.starts_at.desc())).all()
    counts = svc.registered_counts(db, [e.id for e in events])

    items = []
    for e in events:
        phase = "live" if e.starts_at <= now < e.ends_at else ("upcoming" if now < e.starts_at else "past")
        item = {
            "id": e.id, "slug": e.slug, "title": e.title, "title_ar": e.title_ar, "status": e.status,
            "venue": e.venue, "starts_at": e.starts_at, "ends_at": e.ends_at, "timezone": e.timezone,
            "phase": phase, "registered": counts.get(e.id, 0), "capacity": e.capacity,
            "arrived": None, "inside": None, "eligible": None,
        }
        # Full attendance maths only for recent and upcoming events; old ones just show registrations.
        if e.ends_at >= now - timedelta(days=60):
            rows = svc.event_attendance(db, e, now)
            item["arrived"] = sum(1 for _, a in rows if a.status != "not_arrived")
            item["inside"] = sum(1 for _, a in rows if a.status == "inside")
            item["eligible"] = sum(1 for _, a in rows if a.eligible)
        items.append(item)

    certificates = 0
    if events:
        certificates = db.scalar(
            select(func.count()).select_from(Registration).where(
                Registration.event_id.in_([e.id for e in events]), Registration.certificate_code.is_not(None)
            )
        ) or 0

    return {
        "generated_at": now,
        "totals": {
            "events": len(events),
            "live": sum(1 for i in items if i["phase"] == "live"),
            "upcoming": sum(1 for i in items if i["phase"] == "upcoming"),
            "registrations": sum(counts.values()),
            "inside_now": sum(i["inside"] or 0 for i in items),
            "certificates": certificates,
        },
        "events": items,
    }
