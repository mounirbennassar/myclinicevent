"use client";

import Link from "next/link";

import { Icon } from "@/components/icons";
import { QrImage } from "@/components/qr";
import { useSponsor } from "@/components/sponsor-shell";
import { Card, CardHeader, LinkButton, StatCard } from "@/components/ui";
import { eventDateLabel, pickText, sessionTimesLabel } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export default function SponsorOverviewPage() {
  const { me } = useSponsor();
  const { t, locale } = useI18n();
  const { sponsor, event, stats } = me;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[12px] font-bold text-ink-500">{t.sponsors.tiers[sponsor.tier]}</p>
          <h1 className="text-[26px] font-extrabold leading-tight">{t.sponsors.portal.welcome(pickText(locale, sponsor.company_name, sponsor.company_name_ar))}</h1>
        </div>
        <div className="flex gap-2">
          <LinkButton href="/sponsor/scan" variant="secondary" icon="scan">
            {t.sponsors.portal.scan}
          </LinkButton>
          <LinkButton href="/sponsor/booth" icon="qr">
            {t.sponsors.portal.booth}
          </LinkButton>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label={t.sponsors.portal.leadsTotal} value={stats.leads_total} icon="users" />
        <StatCard label={t.sponsors.portal.leadsToday} value={stats.leads_today} icon="sparkle" tone="teal" live={stats.leads_today > 0} />
        <StatCard label={t.sponsors.portal.boothVisits} value={stats.booth_visits} icon="qr" tone="info" />
        <StatCard label={t.sponsors.portal.badgeScans} value={stats.badge_scans} icon="scan" tone="fuchsia" />
        <StatCard label={t.sponsors.portal.withContact} value={stats.with_contact} icon="mail" tone="success" />
        <StatCard label={t.sponsors.portal.teamEntries} value={stats.team_entries} icon="arrowIn" tone="warning" sub={`${stats.members} ${t.sponsors.portal.members}`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-6">
          <h2 className="text-[16px] font-extrabold">{t.sponsors.portal.howTitle}</h2>
          <ol className="mt-4 grid gap-3 text-[14px] text-ink-700">
            {[t.sponsors.portal.how1, t.sponsors.portal.how2, t.sponsors.portal.how3].map((text, i) => (
              <li key={i} className="flex gap-3">
                <span className="num grid size-7 shrink-0 place-items-center rounded-full bg-navy text-[12px] font-extrabold text-white">{i + 1}</span>
                <span>{text}</span>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex flex-wrap gap-2">
            <LinkButton href="/sponsor/leads" variant="secondary" size="sm" icon="users">
              {t.sponsors.portal.leads}
            </LinkButton>
            <LinkButton href="/sponsor/team" variant="secondary" size="sm" icon="team">
              {t.sponsors.portal.team}
            </LinkButton>
            <LinkButton href="/sponsor/profile" variant="secondary" size="sm" icon="settings">
              {t.sponsors.portal.profile}
            </LinkButton>
          </div>
        </Card>

        <div className="grid content-start gap-5">
          <Card>
            <CardHeader title={t.sponsors.portal.yourEvent} />
            <div className="px-5 pb-5 pt-3 text-[14px]">
              <p className="text-[16px] font-extrabold text-navy">{pickText(locale, event.title, event.title_ar)}</p>
              <p className="mt-2 flex items-center gap-2 text-ink-700">
                <Icon name="calendar" size={15} className="text-ink-500" />
                {eventDateLabel(event.sessions, locale)}
                <span className="num text-ink-500">{sessionTimesLabel(event.sessions)}</span>
              </p>
              <p className="mt-1 flex items-center gap-2 text-ink-700">
                <Icon name="pin" size={15} className="text-ink-500" />
                {pickText(locale, event.venue, event.venue_ar)}
              </p>
              {sponsor.booth_number && (
                <p className="mt-3 inline-block rounded-full bg-tint px-3 py-1 text-[13px] font-bold text-navy">
                  {t.sponsors.booth} {sponsor.booth_number}
                </p>
              )}
            </div>
          </Card>
          <Card className="flex items-center gap-4 p-5">
            <Link href="/sponsor/booth" className="shrink-0 rounded-xl border border-hairline p-1.5">
              <QrImage value={me.booth_url} alt={t.sponsors.portal.boothQrTitle} width={320} className="size-20" />
            </Link>
            <div className="min-w-0">
              <p className="text-[14px] font-extrabold text-navy">{t.sponsors.portal.boothQrTitle}</p>
              <p className="mt-0.5 text-[12.5px] text-ink-500">{t.sponsors.portal.scanToConnect}</p>
              <Link href="/sponsor/booth" className="mt-1.5 inline-block text-[13px] font-bold text-action hover:underline">
                {t.sponsors.portal.printSign}
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
