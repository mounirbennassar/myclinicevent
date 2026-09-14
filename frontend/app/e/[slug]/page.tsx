import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmbedResizer, Petal, PublicFooter, PublicHeader } from "@/components/brand";
import { Icon, type IconName } from "@/components/icons";
import { ACCENTS, fmtLocalDate, pickText } from "@/lib/format";
import { dictionaries } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { serverApi } from "@/lib/server-api";
import type { PublicEvent } from "@/lib/types";

import { RegistrationForm } from "./registration-form";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function loadEvent(slug: string) {
  return serverApi<PublicEvent>(`/public/events/${encodeURIComponent(slug)}`);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await loadEvent((await params).slug);
  if (!event) return { title: "Event not found" };
  const locale = await getLocale();
  const title = pickText(locale, event.title, event.title_ar);
  const description = pickText(locale, event.description, event.description_ar) || pickText(locale, event.venue, event.venue_ar);
  return { title, description, openGraph: { title, description, type: "website" } };
}

function InfoRow({ icon, label, children }: { icon: IconName; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3.5">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-tint text-navy">
        <Icon name={icon} size={19} />
      </div>
      <div className="min-w-0">
        <div className="text-[12px] font-bold text-ink-500">{label}</div>
        <div className="mt-0.5 text-[15px] font-bold text-ink-900">{children}</div>
      </div>
    </div>
  );
}

export default async function EventPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const embed = (await searchParams).embed === "1";
  const event = await loadEvent(slug);
  if (!event) notFound();

  const locale = await getLocale();
  const t = dictionaries[locale];
  const accent = ACCENTS[event.accent] ?? ACCENTS.teal;
  const days = [...new Set(event.sessions.map((s) => s.date))].sort();
  const accreditation = pickText(locale, event.accreditation_text, event.accreditation_ar);
  const description = pickText(locale, event.description, event.description_ar);

  return (
    <div className={embed ? "bg-white" : "flex min-h-screen flex-col"}>
      {embed && <EmbedResizer />}
      <PublicHeader embed={embed} />
      {event.is_preview && (
        <div className="bg-warning-tint px-4 py-2.5 text-center text-[13px] font-bold text-warning">{t.public.preview}</div>
      )}

      {/* Main title, per the My Clinic brief: "My Clinic Educational". */}
      <section className="relative overflow-hidden bg-navy text-white">
        <Petal className="absolute -top-20 end-[-70px] w-[460px] opacity-[0.07]" />
        <div className={`relative mx-auto max-w-5xl px-4 sm:px-6 ${embed ? "pb-24 pt-8" : "pb-28 pt-12"}`}>
          <p className="text-[13px] font-bold" style={{ color: accent.soft }}>
            {t.public.heroEyebrow}
          </p>
          <h1 className="mt-2 text-[34px] font-extrabold leading-tight text-white sm:text-[46px]">{t.brand.name}</h1>
        </div>
      </section>

      <main className="relative mx-auto -mt-16 w-full max-w-5xl flex-1 px-4 pb-10 sm:px-6">
        {/* Event information, in a smaller section under the title. */}
        <section className="overflow-hidden rounded-2xl border border-hairline/80 bg-white shadow-raised">
          <div className="h-1.5" style={{ background: accent.mid }} />
          <div className="p-6 sm:p-8">
            <p className="text-[12px] font-bold text-ink-500">{t.public.eventInfo}</p>
            <h2 className="mt-1.5 text-[24px] font-extrabold leading-snug sm:text-[28px]">
              {pickText(locale, event.title, event.title_ar)}
            </h2>
            {description && <p className="mt-2 max-w-3xl text-[15px] text-ink-700">{description}</p>}

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <InfoRow icon="calendar" label={t.public.date}>
                {days.map((day) => (
                  <div key={day}>
                    {fmtLocalDate(day, locale)}
                    <span className="num ms-2 font-medium text-ink-500">
                      {event.sessions
                        .filter((s) => s.date === day)
                        .map((s) => `${s.start}–${s.end}`)
                        .join(" · ")}
                    </span>
                  </div>
                ))}
              </InfoRow>
              <InfoRow icon="pin" label={t.public.venue}>
                {pickText(locale, event.venue, event.venue_ar)}
                {event.venue_map_url && (
                  <a
                    href={event.venue_map_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ms-2 inline-flex items-center gap-1 text-[13px] text-action hover:underline"
                  >
                    {t.public.map}
                    <Icon name="external" size={13} />
                  </a>
                )}
              </InfoRow>
              {event.cme_hours ? (
                <InfoRow icon="award" label={t.public.cme}>
                  {t.public.cmeHours(event.cme_hours)}
                </InfoRow>
              ) : null}
              {(accreditation || event.scfhs_activity_code) && (
                <InfoRow icon="shield" label={t.public.accreditation}>
                  <span className="font-medium">{accreditation}</span>
                  {event.scfhs_activity_code && (
                    <span className="mt-1 block text-[13px] font-medium text-ink-500">
                      {t.public.activityCode}: <span className="num font-bold">{event.scfhs_activity_code}</span>
                    </span>
                  )}
                </InfoRow>
              )}
            </div>
          </div>
        </section>

        {/* The attendance rule, stated clearly as requested. */}
        <section
          className="mt-5 flex gap-4 rounded-2xl border p-5 sm:p-6"
          style={{ background: accent.tint, borderColor: `${accent.mid}40` }}
        >
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-white" style={{ color: accent.strong }}>
            <Icon name="clock" size={21} />
          </div>
          <div>
            <h3 className="text-[15px] font-extrabold">{t.public.ruleTitle}</h3>
            <p className="mt-1 text-[15px] font-bold text-ink-900">
              {t.public.rule(event.attendance_threshold)}
              {event.session_rule === "each" && ` ${t.public.ruleEach}`}
            </p>
            <p className="mt-1.5 text-[13.5px] text-ink-700">{t.public.ruleHow}</p>
          </div>
        </section>

        {(event.sponsors?.length ?? 0) > 0 && (
          <section className="mt-6 rounded-2xl border border-hairline/80 bg-white p-6 shadow-card sm:p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h3 className="text-[18px] font-extrabold">{t.sponsors.sectionTitle}</h3>
              {!embed && (
                <Link href={`/e/${event.slug}/sponsor`} className="text-[13px] font-bold text-action hover:underline">
                  {t.sponsors.becomeSponsor}
                </Link>
              )}
            </div>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {event.sponsors!.map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-xl border border-hairline p-3">
                  {s.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.logo_url} alt="" className="size-12 shrink-0 rounded-lg object-contain" />
                  ) : (
                    <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-tint text-[18px] font-extrabold text-navy">
                      {s.company_name.charAt(0)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-bold text-ink-900">
                      {s.website ? (
                        <a href={s.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {pickText(locale, s.company_name, s.company_name_ar)}
                        </a>
                      ) : (
                        pickText(locale, s.company_name, s.company_name_ar)
                      )}
                    </div>
                    <div className="text-[12px] text-ink-500">
                      {t.sponsors.tiers[s.tier]}
                      {s.booth_number && ` · ${t.sponsors.booth} ${s.booth_number}`}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <RegistrationForm event={event} />
          <aside className="h-fit rounded-2xl border border-hairline/80 bg-white p-6 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[15px] font-extrabold">{t.public.programme}</h3>
              <a href={event.calendar_url} className="inline-flex items-center gap-1 text-[12.5px] font-bold text-action hover:underline">
                <Icon name="calendar" size={14} />
                {t.public.addToCalendar}
              </a>
            </div>
            <ol className="mt-4 space-y-4">
              {event.sessions.map((s) => (
                <li key={s.id} className="flex gap-3">
                  <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: accent.mid }} />
                  <div>
                    <div className="num text-[14px] font-extrabold text-navy">
                      {s.start}–{s.end}
                    </div>
                    <div className="text-[13px] text-ink-500">
                      {days.length > 1 && <span>{fmtLocalDate(s.date, locale, { year: undefined })} · </span>}
                      {pickText(locale, s.title, s.title_ar)}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            {!embed && (event.sponsors?.length ?? 0) === 0 && (
              <Link
                href={`/e/${event.slug}/sponsor`}
                className="mt-5 block rounded-xl bg-tint px-4 py-3 text-center text-[13px] font-bold text-navy hover:bg-[#e3edf7]"
              >
                {t.sponsors.becomeSponsor}
              </Link>
            )}
          </aside>
        </div>
      </main>
      {!embed && <PublicFooter />}
    </div>
  );
}
