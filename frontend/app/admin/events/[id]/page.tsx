"use client";

import { useState } from "react";
import useSWR from "swr";

import { Donut, DistributionChart, HBarChart, HourlyChart, OccupancyChart, RegistrationsChart, CHART } from "@/components/charts";
import { useEventCtx } from "@/components/event-context";
import { Icon } from "@/components/icons";
import { Card, CardHeader, EmptyState, ErrorBox, LinkButton, Progress, Segmented, Skeleton, StatCard } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { ACCENTS, fmtLocalDate, fmtRelative, fmtTime, pickText } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { EventStats } from "@/lib/types";

const pct = (a: number, b: number) => (b ? Math.round((a * 100) / b) : 0);

export default function EventDashboardPage() {
  const { event } = useEventCtx();
  const { t, locale } = useI18n();
  const [day, setDay] = useState<string | null>(null);
  const { data: s, error, mutate } = useSWR<EventStats>(
    `/events/${event.id}/stats${day ? `?day=${day}` : ""}`,
    fetcher,
    { refreshInterval: 5000, keepPreviousData: true },
  );
  const accent = ACCENTS[event.accent] ?? ACCENTS.teal;
  const tz = event.timezone;

  if (error && !s) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!s) {
    return (
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[118px] rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  const T = s.totals;
  const statusSegments = [
    { key: "inside", label: t.attStatus.inside, value: T.inside, color: accent.mid },
    { key: "checked_out", label: t.attStatus.checked_out, value: T.checked_out, color: CHART.navy },
    { key: "no_checkout", label: t.attStatus.no_checkout, value: T.no_checkout, color: CHART.amber },
    { key: "not_arrived", label: t.attStatus.not_arrived, value: T.not_arrived, color: CHART.gray },
  ];

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-[13px] font-bold text-ink-500">
          {s.phase === "live" ? (
            <span className="inline-flex items-center gap-2 text-brand-teal">
              <span className="size-2 animate-pulse-soft rounded-full bg-brand-teal-mid" />
              {t.phase.live}
            </span>
          ) : (
            <span>{s.phase === "upcoming" ? t.dash.phaseUpcoming(fmtRelative(event.starts_at, locale)) : t.dash.phaseEnded}</span>
          )}
          <span className="num font-medium">{t.common.updated(fmtTime(s.generated_at, tz, locale))}</span>
          {s.days.length > 1 && (
            <Segmented
              size="sm"
              value={s.day}
              onChange={setDay}
              options={s.days.map((d) => ({ value: d, label: fmtLocalDate(d, locale, { year: undefined, month: "short" }) }))}
            />
          )}
        </div>
        <LinkButton href={`/admin/events/${event.id}/scanner`} icon="scan">
          {t.dash.openScanner}
        </LinkButton>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label={t.dash.registered}
          value={T.registered}
          icon="users"
          sub={T.capacity ? `${t.dash.capacity(T.capacity)} · ${t.dash.walkins(T.walkins)}` : t.dash.walkins(T.walkins)}
        />
        <StatCard
          label={t.dash.insideNow}
          value={T.inside}
          icon="arrowIn"
          tone="teal"
          live={s.phase === "live"}
          sub={t.dash.ofRegistered(pct(T.inside, T.registered))}
        />
        <StatCard label={t.dash.arrived} value={T.arrived} icon="check" tone="info" sub={t.dash.noShow(T.not_arrived)} />
        <StatCard
          label={t.dash.eligible}
          value={T.eligible}
          icon="award"
          tone="success"
          sub={t.dash.ofArrived(pct(T.eligible, T.arrived))}
        />
        <StatCard label={t.dash.avgAttendance} value={`${T.avg_percent}%`} icon="clock" tone="warning" sub={`CME ≥ ${s.threshold}%`} />
        <StatCard label={t.dash.certificates} value={T.certificates_issued} icon="sparkle" tone="fuchsia" />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={t.dash.registrationsTitle} subtitle={t.dash.registrationsSub} />
          <div className="px-3 pb-4 pt-4">
            <RegistrationsChart
              data={s.registrations_daily}
              color={accent.mid}
              totalLabel={t.dash.total}
              dailyLabel={t.dash.daily}
              formatDate={(d) => fmtLocalDate(d, locale, { weekday: undefined, year: undefined, month: "short" })}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title={t.dash.statusTitle} />
          <div className="flex flex-col items-center gap-5 px-5 pb-5 pt-4">
            <Donut segments={statusSegments}>
              <div>
                <div className="num text-[30px] font-extrabold leading-none text-navy">{pct(T.arrived, T.registered)}%</div>
                <div className="mt-1 text-[12px] font-bold text-ink-500">{t.dash.arrived}</div>
              </div>
            </Donut>
            <ul className="grid w-full gap-2">
              {statusSegments.map((seg) => (
                <li key={seg.key} className="flex items-center justify-between text-[13.5px]">
                  <span className="flex items-center gap-2.5 text-ink-700">
                    <span className="size-2.5 rounded-sm" style={{ background: seg.color }} />
                    {seg.label}
                  </span>
                  <span className="num font-extrabold text-navy">{seg.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t.dash.occupancyTitle} subtitle={t.dash.occupancySub} />
          <div className="px-3 pb-4 pt-4">
            {s.occupancy.length ? (
              <OccupancyChart data={s.occupancy} color={accent.strong} label={t.dash.inside} />
            ) : (
              <EmptyState icon="clock" title={t.dash.noScans} />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title={t.dash.hourlyTitle} subtitle={t.dash.hourlySub} />
          <div className="px-3 pb-4 pt-4">
            <HourlyChart data={s.hourly} color={accent.mid} inLabel={t.dash.in} outLabel={t.dash.out} />
          </div>
        </Card>
      </div>

      {s.sessions.length > 1 && (
        <Card>
          <CardHeader title={t.dash.sessionsTitle} subtitle={t.dash.sessionsSub(s.threshold)} />
          <ul className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {s.sessions.map((sess) => (
              <li key={sess.index} className="rounded-xl border border-hairline p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[13.5px] font-bold text-ink-900">
                    {pickText(locale, sess.title, sess.title_ar) || t.dash.sessionN(sess.index + 1)}
                  </span>
                  <span className="num shrink-0 text-[12px] text-ink-500">
                    {fmtLocalDate(sess.start.slice(0, 10), locale, { year: undefined, month: "short" })} · {fmtTime(sess.start, tz, locale)}–{fmtTime(sess.end, tz, locale)}
                  </span>
                </div>
                <div className="mt-3 flex items-end gap-4">
                  <div>
                    <div className="num text-[24px] font-extrabold leading-none text-navy">{sess.attended}</div>
                    <div className="mt-1 text-[11.5px] font-bold text-ink-500">{t.dash.arrived}</div>
                  </div>
                  <div>
                    <div className="num text-[24px] font-extrabold leading-none text-success">{sess.met}</div>
                    <div className="mt-1 text-[11.5px] font-bold text-ink-500">{t.dash.metThreshold}</div>
                  </div>
                </div>
                <Progress value={T.registered ? (sess.attended / T.registered) * 100 : 0} className="mt-3" />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t.dash.distributionTitle} subtitle={t.dash.distributionSub(s.threshold)} />
          <div className="px-3 pb-4 pt-4">
            <DistributionChart data={s.attendance_buckets} threshold={s.threshold} label={t.dash.arrived} />
          </div>
        </Card>
        <Card>
          <CardHeader title={t.dash.professionsTitle} />
          <div className="px-3 pb-4 pt-4">
            <HBarChart
              data={s.professions.map((p) => ({ name: t.professions[p.name] ?? p.name, count: p.count }))}
              color={accent.strong}
              label={t.dash.registered}
            />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title={t.dash.recentTitle} />
        {s.recent_scans.length === 0 ? (
          <EmptyState icon="scan" title={t.dash.noScans} />
        ) : (
          <ul className="mt-3 divide-y divide-hairline">
            {s.recent_scans.map((scan) => (
              <li key={scan.id} className="flex items-center gap-4 px-5 py-3">
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                    scan.direction === "in" ? "bg-brand-teal-tint text-brand-teal" : "bg-[#e3edf7] text-navy"
                  }`}
                >
                  <Icon name={scan.direction === "in" ? "arrowIn" : "arrowOut"} size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-bold text-ink-900">{scan.registration.full_name}</div>
                  <div className="num text-[12px] text-ink-500">
                    {scan.registration.ticket_code}
                    {scan.scanned_by && <span className="font-sans"> · {scan.scanned_by}</span>}
                  </div>
                </div>
                <div className="text-end">
                  <div className="text-[12.5px] font-bold text-navy">{scan.direction === "in" ? t.dash.in : t.dash.out}</div>
                  <div className="num text-[12px] text-ink-500">{fmtTime(scan.scanned_at, tz, locale)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
