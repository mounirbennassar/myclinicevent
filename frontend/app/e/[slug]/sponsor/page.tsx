import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Petal, PublicFooter, PublicHeader } from "@/components/brand";
import { Icon } from "@/components/icons";
import { ACCENTS, eventDateLabel, pickText } from "@/lib/format";
import { dictionaries } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { serverApi } from "@/lib/server-api";
import type { PublicEvent } from "@/lib/types";

import { SponsorForm } from "./sponsor-form";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await serverApi<PublicEvent>(`/public/events/${encodeURIComponent((await params).slug)}`);
  const t = dictionaries[await getLocale()];
  return { title: event ? `${t.sponsors.applyTitle} · ${event.title}` : t.sponsors.applyTitle };
}

export default async function SponsorApplyPage({ params }: Props) {
  const { slug } = await params;
  const event = await serverApi<PublicEvent>(`/public/events/${encodeURIComponent(slug)}`);
  if (!event) notFound();
  const locale = await getLocale();
  const t = dictionaries[locale];
  const accent = ACCENTS[event.accent] ?? ACCENTS.teal;
  // registration_state is computed server-side, so no clock access is needed here.
  const open = event.status === "published" && event.registration_state !== "ended";

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <section className="relative overflow-hidden bg-navy text-white">
        <Petal className="absolute -top-20 end-[-70px] w-[460px] opacity-[0.07]" />
        <div className="relative mx-auto max-w-5xl px-4 pb-24 pt-12 sm:px-6">
          <Link href={`/e/${event.slug}`} className="inline-flex items-center gap-1 text-[13px] font-bold text-white/70 hover:text-white">
            <Icon name="chevronLeft" size={15} className="rtl:rotate-180" />
            {pickText(locale, event.title, event.title_ar)}
          </Link>
          <p className="mt-4 text-[13px] font-bold" style={{ color: accent.soft }}>
            {t.brand.name}
          </p>
          <h1 className="mt-2 text-[32px] font-extrabold leading-tight text-white sm:text-[42px]">{t.sponsors.applyTitle}</h1>
          <p className="mt-2 text-[15px] text-white/75">
            {eventDateLabel(event.sessions, locale)} · {pickText(locale, event.venue, event.venue_ar)}
          </p>
        </div>
      </section>
      <main className="relative mx-auto -mt-12 w-full max-w-5xl flex-1 px-4 pb-10 sm:px-6">
        {open ? (
          <SponsorForm slug={event.slug} />
        ) : (
          <div className="rounded-2xl border border-hairline/80 bg-white p-10 text-center shadow-raised">
            <Icon name="lock" size={26} className="mx-auto text-navy" />
            <p className="mt-3 text-[16px] font-extrabold text-navy">{t.sponsors.closed}</p>
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
