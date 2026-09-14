"use client";

import Link from "next/link";
import useSWR from "swr";

import { useAdminUser } from "@/components/admin-shell";
import { EventsBarChart } from "@/components/charts";
import { PhaseBadge } from "@/components/event-context";
import { Icon } from "@/components/icons";
import { Card, CardHeader, EmptyState, ErrorBox, LinkButton, PageHeader, Progress, Skeleton, StatCard } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { fmtDate, fmtNumber, pickText } from "@/lib/format";
import { isAdminRole } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { Overview } from "@/lib/types";

export default function OverviewPage() {
  const { t, locale } = useI18n();
  const user = useAdminUser();
  const { data, error, mutate } = useSWR<Overview>("/stats/overview", fetcher, { refreshInterval: 15000 });
  const canCreate = isAdminRole(user);

  if (error && !data) return <ErrorBox error={error} onRetry={() => mutate()} />;

  const live = data?.events.filter((e) => e.phase === "live") ?? [];
  const chartData = (data?.events ?? [])
    .filter((e) => e.arrived != null && e.phase !== "upcoming")
    .slice(0, 8)
    .reverse()
    .map((e) => ({
      name: pickText(locale, e.title, e.title_ar),
      registered: e.registered,
      arrived: e.arrived ?? 0,
      eligible: e.eligible ?? 0,
    }));

  return (
    <>
      <PageHeader
        title={t.overview.title}
        subtitle={t.overview.subtitle}
        actions={
          canCreate && (
            <LinkButton href="/admin/events/new" icon="plus">
              {t.events.new}
            </LinkButton>
          )
        }
      />

      {!data ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-[118px] rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          <StatCard label={t.overview.liveEvents} value={data.totals.live} icon="sparkle" tone="teal" live={data.totals.live > 0} />
          <StatCard label={t.overview.upcomingEvents} value={data.totals.upcoming} icon="calendar" tone="info" />
          <StatCard label={t.overview.registrations} value={fmtNumber(data.totals.registrations, locale)} icon="users" />
          <StatCard label={t.overview.insideNow} value={data.totals.inside_now} icon="arrowIn" tone="success" live={data.totals.inside_now > 0} />
          <StatCard label={t.overview.certificates} value={data.totals.certificates} icon="award" tone="fuchsia" />
        </div>
      )}

      {live.length > 0 && (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {live.map((e) => (
            <Card key={e.id} className="relative overflow-hidden border-brand-teal-mid/30 p-6">
              <div className="absolute inset-y-0 start-0 w-1.5 bg-brand-teal-mid" />
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <PhaseBadge event={e} />
                  <h2 className="mt-2 text-[19px] font-extrabold leading-snug">{pickText(locale, e.title, e.title_ar)}</h2>
                  <p className="mt-1 text-[13px] text-ink-500">{e.venue}</p>
                </div>
                <div className="flex gap-2">
                  <LinkButton href={`/admin/events/${e.id}/scanner`} variant="secondary" size="sm" icon="scan">
                    {t.nav.scanner}
                  </LinkButton>
                  <LinkButton href={`/admin/events/${e.id}`} size="sm" icon="grid">
                    {t.nav.dashboard}
                  </LinkButton>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                {[
                  [t.dash.insideNow, e.inside],
                  [t.dash.arrived, e.arrived],
                  [t.dash.eligible, e.eligible],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl bg-tint px-2 py-3">
                    <div className="num text-[24px] font-extrabold text-navy">{value ?? 0}</div>
                    <div className="text-[12px] font-bold text-ink-500">{label}</div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title={t.overview.byEvent} />
          <div className="px-3 pb-4 pt-3">
            {chartData.length ? (
              <EventsBarChart
                data={chartData}
                labels={{ registered: t.dash.registered, arrived: t.dash.arrived, eligible: t.dash.eligible }}
              />
            ) : (
              <EmptyState icon="grid" title={t.overview.noEvents} />
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title={t.overview.events}
            action={
              <Link href="/admin/events" className="text-[13px] font-bold text-action hover:underline">
                {t.common.view}
              </Link>
            }
          />
          {data && data.events.length === 0 ? (
            <EmptyState
              icon="calendar"
              title={t.overview.noEvents}
              action={
                canCreate && (
                  <LinkButton href="/admin/events/new" icon="plus">
                    {t.overview.createFirst}
                  </LinkButton>
                )
              }
            />
          ) : (
            <ul className="mt-3 divide-y divide-hairline">
              {(data?.events ?? []).slice(0, 7).map((e) => (
                <li key={e.id}>
                  <Link href={`/admin/events/${e.id}`} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-tint">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-bold text-ink-900">{pickText(locale, e.title, e.title_ar)}</span>
                        <PhaseBadge event={e} />
                      </div>
                      <div className="mt-0.5 text-[12.5px] text-ink-500">{fmtDate(e.starts_at, e.timezone, locale)}</div>
                      {e.capacity ? <Progress value={(e.registered / e.capacity) * 100} className="mt-2 max-w-56" /> : null}
                    </div>
                    <div className="text-end">
                      <div className="num text-[18px] font-extrabold text-navy">{e.registered}</div>
                      <div className="text-[11.5px] text-ink-500">
                        {e.capacity ? `/ ${e.capacity}` : t.overview.registered}
                      </div>
                    </div>
                    <Icon name="chevronRight" size={16} className="text-ink-300 rtl:rotate-180" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
