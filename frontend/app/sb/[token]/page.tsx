"use client";

import { use } from "react";
import useSWR from "swr";

import { PublicFooter, PublicHeader } from "@/components/brand";
import { Icon } from "@/components/icons";
import { QrImage } from "@/components/qr";
import { Card, ErrorBox, Skeleton } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { eventDateLabel, pickText, sessionTimesLabel } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { BadgeInfo } from "@/lib/types";

/** A sponsor team member's gate badge. */
export default function BadgePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { t, locale } = useI18n();
  const { data, error, mutate } = useSWR<BadgeInfo>(`/public/badges/${token}`, fetcher, { revalidateOnFocus: false });

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-8 sm:px-6">
        {error ? (
          <ErrorBox error={error} onRetry={() => mutate()} />
        ) : !data ? (
          <Skeleton className="h-96 rounded-2xl" />
        ) : (
          <Card className="overflow-hidden text-center">
            <div className="bg-[#53326f] px-6 py-5 text-white">
              <p className="text-[12px] font-bold tracking-wide text-white/70">{t.sponsors.badgeTitle}</p>
              <p className="mt-1 text-[18px] font-extrabold">{pickText(locale, data.sponsor.company_name, data.sponsor.company_name_ar)}</p>
              <p className="text-[12.5px] text-white/80">
                {t.sponsors.tiers[data.sponsor.tier]}
                {data.sponsor.booth_number && ` · ${t.sponsors.booth} ${data.sponsor.booth_number}`}
              </p>
            </div>
            <div className="p-6">
              <p className="text-[20px] font-extrabold text-navy">{data.member.full_name}</p>
              {data.member.title && <p className="text-[13px] text-ink-500">{data.member.title}</p>}
              <div className="mx-auto mt-5 w-full max-w-[280px] rounded-2xl border-2 border-navy/10 bg-white p-3">
                <QrImage value={data.qr_payload} alt={t.sponsors.badgeTitle} width={720} className="aspect-square w-full" />
              </div>
              <p className="mt-3 text-[13.5px] text-ink-700">{t.sponsors.badgeShow}</p>
              <div className="mt-5 space-y-1 border-t border-hairline pt-4 text-[13px] text-ink-700">
                <p className="font-bold text-navy">{pickText(locale, data.event.title, data.event.title_ar)}</p>
                <p className="flex items-center justify-center gap-1.5">
                  <Icon name="calendar" size={14} className="text-ink-500" />
                  {eventDateLabel(data.event.sessions, locale)}
                  <span className="num text-ink-500">{sessionTimesLabel(data.event.sessions)}</span>
                </p>
                <p className="flex items-center justify-center gap-1.5">
                  <Icon name="pin" size={14} className="text-ink-500" />
                  {pickText(locale, data.event.venue, data.event.venue_ar)}
                </p>
              </div>
            </div>
          </Card>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
