"use client";

import { use, useEffect } from "react";
import useSWR from "swr";

import { PublicFooter, PublicHeader } from "@/components/brand";
import { Icon } from "@/components/icons";
import { downloadUrl, useQrDataUrl } from "@/components/qr";
import { SessionBreakdown } from "@/components/session-breakdown";
import { Badge, Button, Card, ErrorBox, LinkButton, Ring, Skeleton, type Tone } from "@/components/ui";
import { ApiError, fetcher } from "@/lib/api";
import { ACCENTS, eventDateLabel, fmtDuration, fmtTime, pickText, sessionTimesLabel } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Pass } from "@/lib/types";
import { whatsappUrl } from "@/lib/whatsapp";

const STATUS_TONE: Record<string, Tone> = {
  not_arrived: "neutral",
  inside: "teal",
  checked_out: "navy",
  no_checkout: "warning",
};

export default function PassPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { token } = use(params);
  const { welcome } = use(searchParams);
  const { t, locale } = useI18n();
  const { data, error, mutate } = useSWR<Pass>(`/public/passes/${token}`, fetcher, {
    refreshInterval: 15000,
    revalidateOnFocus: true,
  });
  const qr = useQrDataUrl(data?.qr_payload, 720);

  // Remember the pass on this phone so scanning a sponsor's booth QR knows who is visiting.
  useEffect(() => {
    try {
      document.cookie = `mce_pass=${encodeURIComponent(token)}; path=/; max-age=1209600; samesite=lax`;
    } catch {
      // cookies blocked: the booth page falls back to asking for the ticket code
    }
  }, [token]);

  if (error) {
    return (
      <Shell>
        {error instanceof ApiError && error.status === 404 ? (
          <Card className="p-10 text-center">
            <Icon name="alert" size={28} className="mx-auto text-danger" />
            <p className="mt-3 font-bold text-ink-900">{t.pass.notFound}</p>
          </Card>
        ) : (
          <ErrorBox error={error} onRetry={() => mutate()} />
        )}
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell>
        <Skeleton className="h-28" />
        <Skeleton className="mt-4 h-96" />
      </Shell>
    );
  }

  const { event, attendee, attendance: a, certificate } = data;
  const accent = ACCENTS[event.accent] ?? ACCENTS.teal;
  const tz = event.timezone;

  return (
    <Shell>
      {welcome === "1" && (
        <div className="mb-4 flex animate-fade-up gap-3 rounded-2xl bg-success-tint p-4 text-success">
          <Icon name="check" size={22} className="shrink-0" />
          <div>
            <p className="font-extrabold">{t.pass.welcome}</p>
            <p className="mt-0.5 text-[13.5px] text-ink-700">{t.pass.welcomeBody}</p>
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="h-1.5" style={{ background: accent.mid }} />
        <div className="p-5 sm:p-6">
          <p className="text-[12px] font-bold text-ink-500">{t.pass.title}</p>
          <h1 className="mt-1 text-[20px] font-extrabold leading-snug sm:text-[22px]">
            {pickText(locale, event.title, event.title_ar)}
          </h1>
          <div className="mt-3 space-y-1.5 text-[14px] text-ink-700">
            <p className="flex items-center gap-2">
              <Icon name="calendar" size={16} className="shrink-0 text-ink-500" />
              {eventDateLabel(event.sessions, locale)}
              <span className="num text-ink-500">{sessionTimesLabel(event.sessions)}</span>
            </p>
            <p className="flex items-center gap-2">
              <Icon name="pin" size={16} className="shrink-0 text-ink-500" />
              {pickText(locale, event.venue, event.venue_ar)}
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2" data-noprint>
            <a
              href={event.calendar_url}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-[13px] font-bold text-navy hover:bg-tint"
            >
              <Icon name="calendar" size={15} />
              {t.public.addToCalendar}
            </a>
            <a
              href={whatsappUrl(
                t.pass.whatsappText(pickText(locale, event.title, event.title_ar), `${new URL(event.registration_url).origin}/r/${token}`),
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-[13px] font-bold text-[#128c7e] hover:bg-tint"
            >
              <Icon name="phone" size={15} />
              {t.pass.shareWhatsapp}
            </a>
          </div>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {/* The attendee's personal QR, scanned at the entrance and exit. */}
        <Card className="flex flex-col items-center p-6 text-center">
          <p className="text-[17px] font-extrabold text-navy">{attendee.full_name}</p>
          <p className="mt-0.5 text-[13px] text-ink-500">{attendee.scfhs_number}</p>
          <div className="mt-5 w-full max-w-[280px] rounded-2xl border-2 border-navy/10 bg-white p-3">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt={`QR ${attendee.ticket_code}`} className="aspect-square w-full [image-rendering:pixelated]" />
            ) : (
              <Skeleton className="aspect-square w-full" />
            )}
          </div>
          <p className="mt-3 text-[12px] font-bold text-ink-500">{t.pass.ticket}</p>
          <p className="num text-[22px] font-extrabold tracking-wider text-navy">{attendee.ticket_code}</p>
          <p className="mt-3 max-w-xs text-[13.5px] text-ink-700">{t.pass.showQr}</p>
          <p className="mt-1 text-[12.5px] text-ink-500">{t.pass.brightness}</p>
          <Button
            variant="secondary"
            size="sm"
            icon="download"
            className="mt-4"
            disabled={!qr}
            onClick={() => qr && downloadUrl(qr, `${attendee.ticket_code}.png`)}
          >
            {t.pass.saveQr}
          </Button>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[16px] font-extrabold">{t.pass.attendance}</h2>
              <Badge tone={STATUS_TONE[a.status]} dot pulse={a.status === "inside"}>
                {t.pass.status[a.status]}
                {a.status === "inside" && a.last_scan_at && ` ${t.pass.since(fmtTime(a.last_scan_at, tz, locale))}`}
              </Badge>
            </div>
            <div className="mt-5 flex items-center gap-5">
              <Ring value={a.percent} threshold={a.threshold} size={132} stroke={11}>
                <div>
                  <div className="num text-[28px] font-extrabold leading-none text-navy">{a.percent}%</div>
                  <div className="mt-1 text-[11px] font-bold text-ink-500">/ {a.threshold}%</div>
                </div>
              </Ring>
              <dl className="grid flex-1 gap-3 text-[14px]">
                <div>
                  <dt className="text-[12px] font-bold text-ink-500">{t.pass.attended}</dt>
                  <dd className="num text-[18px] font-extrabold text-navy">{fmtDuration(a.attended_minutes, locale)}</dd>
                </div>
                <div>
                  <dt className="text-[12px] font-bold text-ink-500">{t.pass.required}</dt>
                  <dd className="num text-[15px] font-bold text-ink-700">
                    {fmtDuration(Math.ceil((a.required_minutes * a.threshold) / 100), locale)}
                    <span className="text-ink-500"> / {fmtDuration(a.required_minutes, locale)}</span>
                  </dd>
                </div>
              </dl>
            </div>
            <p
              className={`mt-5 rounded-xl px-4 py-3 text-[13.5px] font-bold ${
                a.eligible ? "bg-success-tint text-success" : a.achievable ? "bg-tint text-navy" : "bg-warning-tint text-warning"
              }`}
            >
              {a.eligible
                ? t.pass.reached
                : a.achievable
                  ? t.pass.needed(fmtDuration(a.remaining_minutes, locale))
                  : t.pass.notAchievable}
            </p>
            {a.sessions.length > 1 && (
              <div className="mt-5">
                <p className="text-[12px] font-bold text-ink-500">
                  {t.pass.perSession}
                  {a.session_rule === "each" && <span className="ms-1.5 font-medium">· {t.public.ruleEach}</span>}
                </p>
                <div className="mt-2">
                  <SessionBreakdown sessions={a.sessions} eventSessions={event.sessions} threshold={a.threshold} tz={tz} compact />
                </div>
              </div>
            )}
            {a.intervals.length > 0 && (
              <div className="mt-5">
                <p className="text-[12px] font-bold text-ink-500">{t.pass.visits}</p>
                <ul className="mt-2 space-y-1.5">
                  {a.intervals.map((iv) => (
                    <li key={iv.start} className="num flex items-center gap-2 text-[14px] text-ink-700">
                      <Icon name="arrowIn" size={15} className="text-brand-teal" />
                      {fmtTime(iv.start, tz, locale)}
                      <span className="text-ink-300">→</span>
                      {iv.end ? fmtTime(iv.end, tz, locale) : <span className="font-bold text-brand-teal">{t.common.live}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-4 flex items-center gap-1.5 text-[12px] text-ink-500">
              <span className="size-1.5 animate-pulse-soft rounded-full bg-brand-teal-mid" />
              {t.pass.auto}
            </p>
          </Card>

          {data.sponsors_total > 0 && (
            <Card className="p-6">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f0eaf6] text-[#53326f]">
                  <Icon name="team" size={20} />
                </div>
                <div className="flex-1">
                  <h2 className="text-[16px] font-extrabold">{t.sponsors.passVisits}</h2>
                  <p className="num mt-0.5 text-[13.5px] font-bold text-navy">
                    {t.sponsors.boothsVisited(data.booth_visits.length, data.sponsors_total)}
                  </p>
                  {data.booth_visits.length > 0 ? (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {data.booth_visits.map((v) => (
                        <li key={v.at} className="rounded-full bg-tint px-2.5 py-[3px] text-[12px] font-bold text-navy">
                          {v.sponsor}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[12.5px] text-ink-500">{t.sponsors.passVisitsHint}</p>
                  )}
                </div>
              </div>
            </Card>
          )}

          <Card className="p-6">
            <div className="flex items-start gap-3">
              <div
                className="grid size-10 shrink-0 place-items-center rounded-xl"
                style={{ background: accent.tint, color: accent.strong }}
              >
                <Icon name="award" size={20} />
              </div>
              <div className="flex-1">
                <h2 className="text-[16px] font-extrabold">{t.pass.certificate}</h2>
                <p className="mt-1 text-[13.5px] text-ink-700">
                  {certificate.available
                    ? t.pass.certReady
                    : t.pass.blockers[certificate.blocker ?? "not_eligible"]}
                </p>
                {!certificate.available && certificate.blocker !== "certificates_disabled" && (
                  <p className="mt-1 text-[12.5px] text-ink-500">{t.pass.certAuto}</p>
                )}
                {certificate.available && (
                  <LinkButton href={`/r/${token}/certificate`} size="sm" icon="award" className="mt-3">
                    {t.pass.viewCertificate}
                  </LinkButton>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
      <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[12.5px] text-ink-500">
        <Icon name="lock" size={13} />
        {t.pass.private}
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      <PublicFooter />
    </div>
  );
}
