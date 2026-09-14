"""Attendance maths for CME eligibility. Pure functions, no database access.

Scans are paired chronologically into presence intervals (in → out). Credit is the overlap of those
intervals with the event's session windows, so time spent before the start, during breaks between
sessions, or after the end never counts.

Windows carry a `group` (one per event day). A visit that was never closed by a check-out scan is
capped at the end of its own day: someone who forgot to scan out on day 1 is not "inside" on day 2,
and never gets credit for a day they didn't attend.

Eligibility: `overall` = attended / required >= threshold; `each` = every session individually.
"""

from __future__ import annotations

import math
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime

Scan = tuple[str, datetime]


@dataclass(frozen=True)
class Window:
    start: datetime
    end: datetime
    group: int = 0  # windows on the same local day share a group


@dataclass
class Interval:
    start: datetime
    end: datetime | None  # None while no check-out scan closed it


@dataclass
class SessionAttendance:
    index: int
    start: datetime
    end: datetime
    attended_seconds: int
    required_seconds: int
    percent: float
    met: bool


@dataclass
class AttendanceSummary:
    # not_arrived | inside | checked_out | no_checkout
    status: str
    attended_seconds: int
    required_seconds: int
    threshold: int
    session_rule: str
    percent: float
    eligible: bool
    computed_eligible: bool
    override: bool | None
    # Seconds still needed to reach the threshold.
    remaining_seconds: int
    # Whether the threshold can still be reached if the attendee stays until the end.
    achievable: bool
    first_in: datetime | None
    last_scan_at: datetime | None
    last_direction: str | None
    intervals: list[Interval] = field(default_factory=list)
    # The intervals as actually credited (open visits closed at "now" or the end of their day).
    credited: list[tuple[datetime, datetime]] = field(default_factory=list)
    sessions: list[SessionAttendance] = field(default_factory=list)


def _floor1(value: float) -> float:
    # Floor so 79.96% never displays as 80% for someone who isn't eligible.
    return math.floor(value * 10) / 10


def sort_windows(windows: Iterable[Window]) -> list[Window]:
    return sorted((w for w in windows if w.end > w.start), key=lambda w: w.start)


def group_end(windows: list[Window], at: datetime) -> datetime:
    """End of the day (window group) a moment belongs to.

    A moment inside or before a window belongs to that window's day; after the last window it belongs
    to the last day.
    """
    if not windows:
        return at
    for w in windows:
        if at < w.end:
            return max(x.end for x in windows if x.group == w.group)
    last = windows[-1]
    return max(x.end for x in windows if x.group == last.group)


def pair_scans(scans: Iterable[Scan], windows: Iterable[Window] = ()) -> list[Interval]:
    """Pair in/out scans into visits.

    A repeated "in" on the same day keeps the first; an "in" on a later day starts a new visit (the
    earlier one stays open and is capped later); an "out" with nothing open is ignored.
    """
    windows = sort_windows(windows)
    intervals: list[Interval] = []
    open_start: datetime | None = None
    for direction, at in sorted(scans, key=lambda s: s[1]):
        if direction == "in":
            if open_start is None:
                open_start = at
            elif at >= group_end(windows, open_start):
                intervals.append(Interval(open_start, None))
                open_start = at
        elif direction == "out" and open_start is not None:
            intervals.append(Interval(open_start, at))
            open_start = None
    if open_start is not None:
        intervals.append(Interval(open_start, None))
    return intervals


def is_inside(scans: Iterable[Scan], windows: Iterable[Window], now: datetime) -> bool:
    """Whether the attendee is currently inside: an open visit whose day hasn't ended."""
    windows = sort_windows(windows)
    intervals = pair_scans(scans, windows)
    if not intervals or intervals[-1].end is not None:
        return False
    return now < group_end(windows, intervals[-1].start)


def _overlap(start: datetime, end: datetime, windows: Iterable[Window]) -> float:
    total = 0.0
    for w in windows:
        s = max(start, w.start)
        e = min(end, w.end)
        if e > s:
            total += (e - s).total_seconds()
    return total


def compute_attendance(
    scans: Iterable[Scan],
    windows: Iterable[Window],
    threshold: int,
    now: datetime,
    count_open_until_end: bool = True,
    override: bool | None = None,
    session_rule: str = "overall",
) -> AttendanceSummary:
    windows = sort_windows(windows)
    scans = sorted(scans, key=lambda s: s[1])
    required = int(sum((w.end - w.start).total_seconds() for w in windows))
    event_end = windows[-1].end if windows else now
    intervals = pair_scans(scans, windows)

    credited: list[tuple[datetime, datetime]] = []
    for iv in intervals:
        if iv.end is not None:
            end = iv.end
        else:
            cap = group_end(windows, iv.start)
            if now < cap:
                end = now  # live: credit up to this moment
            elif count_open_until_end:
                end = cap  # forgot to scan out: credit until that day ended
            else:
                end = iv.start  # forgot to scan out: no credit for the open stretch
        credited.append((iv.start, max(end, iv.start)))

    sessions: list[SessionAttendance] = []
    for i, w in enumerate(windows):
        req = int((w.end - w.start).total_seconds())
        att = int(sum(_overlap(s, e, [w]) for s, e in credited))
        needed = math.ceil(req * threshold / 100)
        sessions.append(SessionAttendance(
            index=i, start=w.start, end=w.end, attended_seconds=att, required_seconds=req,
            percent=_floor1(min(100.0, att * 100 / req)) if req else 0.0, met=req > 0 and att >= needed,
        ))
    attended_s = sum(s.attended_seconds for s in sessions)

    if not intervals:
        status = "not_arrived"
    elif intervals[-1].end is None:
        status = "inside" if now < group_end(windows, intervals[-1].start) else "no_checkout"
    else:
        status = "checked_out"

    def future(w: Window) -> float:
        return _overlap(now, w.end, [w]) if now < w.end else 0.0

    if session_rule == "each":
        computed_eligible = bool(sessions) and all(s.met for s in sessions)
        remaining = sum(max(0, math.ceil(s.required_seconds * threshold / 100) - s.attended_seconds) for s in sessions)
        achievable = computed_eligible or all(
            s.met or s.attended_seconds + future(windows[s.index]) >= math.ceil(s.required_seconds * threshold / 100)
            for s in sessions
        )
    else:
        needed = math.ceil(required * threshold / 100) if required else 0
        computed_eligible = required > 0 and attended_s >= needed
        remaining = max(0, needed - attended_s)
        achievable = computed_eligible or attended_s + sum(future(w) for w in windows) >= needed

    return AttendanceSummary(
        status=status,
        attended_seconds=attended_s,
        required_seconds=required,
        threshold=threshold,
        session_rule=session_rule,
        percent=_floor1(min(100.0, attended_s * 100 / required)) if required else 0.0,
        eligible=override if override is not None else computed_eligible,
        computed_eligible=computed_eligible,
        override=override,
        remaining_seconds=remaining,
        achievable=achievable,
        first_in=next((at for d, at in scans if d == "in"), None),
        last_scan_at=scans[-1][1] if scans else None,
        last_direction=scans[-1][0] if scans else None,
        intervals=intervals,
        credited=credited,
        sessions=sessions,
    )
