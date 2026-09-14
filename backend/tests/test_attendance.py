from datetime import UTC, datetime, timedelta

from app.attendance import Window, compute_attendance, is_inside, pair_scans

T0 = datetime(2026, 11, 12, 5, 0, tzinfo=UTC)  # 08:00 in Riyadh


def at(hours: float) -> datetime:
    return T0 + timedelta(hours=hours)


DAY = [Window(at(0), at(8))]  # one 8-hour session = 480 minutes
AFTER = at(10)
# Two-day event: 08:00–16:00 on day 1 (group 0) and day 2 (group 1).
TWO_DAYS = [Window(at(0), at(8), 0), Window(at(24), at(32), 1)]


def run(scans, windows=DAY, now=AFTER, **kw):
    return compute_attendance(scans, windows, 80, now, **kw)


def test_no_scans():
    a = run([])
    assert a.status == "not_arrived"
    assert a.attended_seconds == 0 and not a.eligible


def test_full_day_is_eligible():
    a = run([("in", at(0)), ("out", at(8))])
    assert a.percent == 100.0 and a.eligible and a.status == "checked_out"


def test_threshold_boundary_is_exact():
    ok = run([("in", at(0)), ("out", at(0) + timedelta(minutes=384))])  # exactly 80%
    short = run([("in", at(0)), ("out", at(0) + timedelta(minutes=383))])
    assert ok.eligible and ok.percent == 80.0
    assert not short.eligible and short.percent == 79.7  # floored, never shown as 80%
    assert short.remaining_seconds == 60


def test_time_outside_sessions_does_not_count():
    a = run([("in", at(-1)), ("out", at(1))])
    assert a.attended_seconds == 3600


def test_breaks_between_sessions_are_excluded():
    windows = [Window(at(0), at(4)), Window(at(5), at(8))]  # 7 hours required
    a = run([("in", at(0)), ("out", at(8))], windows=windows)
    assert a.required_seconds == 7 * 3600
    assert a.attended_seconds == 7 * 3600 and a.eligible
    assert [s.percent for s in a.sessions] == [100.0, 100.0]


def test_multiple_visits_add_up():
    a = run([("in", at(0)), ("out", at(2)), ("in", at(3)), ("out", at(7))])
    assert a.attended_seconds == 6 * 3600
    assert a.percent == 75.0 and not a.eligible


def test_repeated_in_and_stray_out_are_ignored():
    a = run([("out", at(-0.5)), ("in", at(0)), ("in", at(1)), ("out", at(4))])
    assert a.attended_seconds == 4 * 3600
    assert a.first_in == at(0)


def test_live_attendee_counts_until_now():
    a = run([("in", at(0))], now=at(2))
    assert a.status == "inside"
    assert a.attended_seconds == 2 * 3600
    assert a.achievable  # 2h done + 6h left ≥ 6.4h needed


def test_unreachable_threshold_is_flagged():
    a = run([("in", at(3))], now=at(3))
    assert not a.achievable  # only 5h left, 6.4h needed


def test_missing_checkout_policy():
    counted = run([("in", at(0))], count_open_until_end=True)
    not_counted = run([("in", at(0))], count_open_until_end=False)
    assert counted.status == "no_checkout" and counted.eligible
    assert not_counted.attended_seconds == 0 and not not_counted.eligible


def test_manual_override_wins():
    assert run([], override=True).eligible
    assert not run([("in", at(0)), ("out", at(8))], override=False).eligible


def test_forgotten_checkout_is_capped_at_the_end_of_its_day():
    scans = [("in", at(0))]  # day 1, never scanned out
    # On the morning of day 2 they are not "inside" any more...
    assert not is_inside(scans, TWO_DAYS, at(25))
    # ...and a day-2 "in" starts a fresh visit instead of being ignored.
    intervals = pair_scans(scans + [("in", at(25))], TWO_DAYS)
    assert [(iv.start, iv.end) for iv in intervals] == [(at(0), None), (at(25), None)]
    a = run(scans + [("in", at(25)), ("out", at(32))], windows=TWO_DAYS, now=at(33))
    # Day 1 credited to the end of day 1 (policy), day 2 from 09:00 to 16:00 — not from 08:00.
    assert [s.attended_seconds for s in a.sessions] == [8 * 3600, 7 * 3600]
    assert a.percent == 93.7 and a.eligible


def test_never_attended_day_gets_no_credit():
    a = run([("in", at(0))], windows=TWO_DAYS, now=at(33))
    assert a.attended_seconds == 8 * 3600  # day 1 only, even with count_open_until_end
    assert a.percent == 50.0 and not a.eligible and a.status == "no_checkout"


def test_each_session_rule():
    windows = [Window(at(0), at(4)), Window(at(5), at(8))]
    # 100% of the morning, 40% of the afternoon: 74% overall.
    scans = [("in", at(0)), ("out", at(4)), ("in", at(5)), ("out", at(6.2))]
    overall = run(scans, windows=windows)
    each = run(scans, windows=windows, session_rule="each")
    assert not overall.eligible and not each.eligible
    assert [s.met for s in each.sessions] == [True, False]
    # 100% morning + 90% afternoon passes both rules.
    scans = [("in", at(0)), ("out", at(4)), ("in", at(5)), ("out", at(7.7))]
    assert run(scans, windows=windows, session_rule="each").eligible
    # 100% morning + 60% afternoon: 82% overall passes "overall" but fails "each".
    scans = [("in", at(0)), ("out", at(4)), ("in", at(5)), ("out", at(6.8))]
    assert run(scans, windows=windows).eligible
    assert not run(scans, windows=windows, session_rule="each").eligible
