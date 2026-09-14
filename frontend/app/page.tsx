import Link from "next/link";

import { Petal, PublicFooter, PublicHeader } from "@/components/brand";
import { Icon } from "@/components/icons";
import { ACCENTS, eventDateLabel, pickText, sessionTimesLabel } from "@/lib/format";
import { dictionaries } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { serverApi } from "@/lib/server-api";
import type { PublicEvent } from "@/lib/types";

export default async function Home() {
  const locale = await getLocale();
  const t = dictionaries[locale];
  let events: PublicEvent[] = [];
  let failed = false;
  try {
    events = (await serverApi<PublicEvent[]>("/public/events")) ?? [];
  } catch {
    failed = true;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <section className="relative overflow-hidden bg-navy text-white">
        <Petal className="absolute -top-16 end-[-60px] w-[440px] opacity-[0.07]" />
        <div className="relative mx-auto max-w-6xl px-4 pb-28 pt-14 sm:px-6">
          <p className="text-[13px] font-bold text-brand-teal-soft">{t.public.heroEyebrow}</p>
          <h1 className="mt-2 text-[34px] font-extrabold leading-tight text-white sm:text-[46px]">{t.brand.name}</h1>
          <p className="mt-3 max-w-xl text-[16px] text-white/75">{t.public.hubIntro}</p>
        </div>
      </section>

      <main className="relative mx-auto -mt-16 w-full max-w-6xl flex-1 px-4 sm:px-6">
        <h2 className="mb-4 text-[15px] font-bold text-white">{t.public.upcoming}</h2>
        {failed ? (
          <div className="rounded-2xl bg-white p-8 text-center text-ink-500 shadow-card">{t.common.network}</div>
        ) : events.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center text-ink-500 shadow-card">{t.public.noEvents}</div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {events.map((event) => {
              const accent = ACCENTS[event.accent] ?? ACCENTS.teal;
              const state = event.registration_state ?? "open";
              return (
                <Link
                  key={event.id}
                  href={`/e/${event.slug}`}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-hairline/80 bg-white shadow-card transition-shadow duration-200 hover:shadow-raised"
                >
                  <div className="h-1.5" style={{ background: accent.mid }} />
                  <div className="flex flex-1 flex-col p-6">
                    <div className="flex flex-wrap items-center gap-2">
                      {event.cme_hours ? (
                        <span
                          className="rounded-full px-2.5 py-[3px] text-[12px] font-bold"
                          style={{ background: accent.tint, color: accent.strong }}
                        >
                          {t.public.cmeHours(event.cme_hours)}
                        </span>
                      ) : null}
                      <span
                        className={
                          state === "open"
                            ? "rounded-full bg-success-tint px-2.5 py-[3px] text-[12px] font-bold text-success"
                            : "rounded-full bg-ink-100 px-2.5 py-[3px] text-[12px] font-bold text-ink-500"
                        }
                      >
                        {state === "open" ? t.public.states.open : t.public.states[state]}
                      </span>
                    </div>
                    <h3 className="mt-3 text-[20px] font-extrabold leading-snug">
                      {pickText(locale, event.title, event.title_ar)}
                    </h3>
                    <div className="mt-4 space-y-2 text-[14px] text-ink-700">
                      <p className="flex items-center gap-2.5">
                        <Icon name="calendar" size={16} className="shrink-0 text-ink-500" />
                        <span>
                          {eventDateLabel(event.sessions, locale)}
                          <span className="num ms-2 text-ink-500">{sessionTimesLabel(event.sessions)}</span>
                        </span>
                      </p>
                      <p className="flex items-center gap-2.5">
                        <Icon name="pin" size={16} className="shrink-0 text-ink-500" />
                        {pickText(locale, event.venue, event.venue_ar)}
                      </p>
                    </div>
                    <div className="mt-auto flex items-center justify-between pt-6">
                      {event.seats_left != null && state === "open" ? (
                        <span className="text-[13px] font-bold text-ink-500">{t.public.seatsLeft(event.seats_left)}</span>
                      ) : (
                        <span />
                      )}
                      <span className="inline-flex items-center gap-1.5 text-[14px] font-bold text-action group-hover:underline">
                        {t.public.register}
                        <Icon name="chevronRight" size={16} className="rtl:rotate-180" />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
