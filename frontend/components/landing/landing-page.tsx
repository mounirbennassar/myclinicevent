"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Petal } from "@/components/brand";
import { Icon } from "@/components/icons";
import { pickText } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { PublicEvent } from "@/lib/types";
import { landingCopy } from "./copy";
import { editorialCopy } from "./editorial-copy";
import { Reveal } from "./motion";
import { Arrow, SiteShell } from "./shell";
import h from "./home.module.css";

export function LandingPage({
  events,
  failed,
}: {
  events: PublicEvent[];
  failed: boolean;
}) {
  const { locale, t } = useI18n();
  const c = landingCopy[locale];
  const e = editorialCopy[locale];
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <SiteShell className={h.experience} hideTopbar>
      <section className={h.hero} aria-labelledby="hero-title">
        <Image
          src="/images/myclinic/riyadh.webp"
          alt={e.galleryAlt}
          fill
          preload
          sizes="100vw"
          className={h.heroBackdrop}
        />
        <div className={h.heroShade} />
        <div className={`${h.frame} ${h.heroInner}`}>
          <div className={h.heroTopline}>
            <span>{e.edition}</span>
            <span>
              <Icon name="pin" size={14} />
              {c.country}
            </span>
          </div>
          <Reveal className={h.heroStatement}>
            <p className={h.kicker}>{c.medicalEducation}</p>
            <h1 id="hero-title">
              {e.title}
              <br />
              <span>{e.titleSecond}</span>
            </h1>
            <p className={h.heroIntro}>{e.intro}</p>
            <Link className={h.whiteButton} href="/events">
              {c.browse}
              <Arrow />
            </Link>
          </Reveal>
          <a className={h.scrollLink} href="#events">
            {e.scroll}
            <Icon name="chevronDown" size={17} />
          </a>
        </div>
      </section>

      <section
        id="events"
        className={h.agendaSection}
        aria-labelledby="events-title"
      >
        <div className={h.frame}>
          <Reveal className={h.agenda}>
            <div className={h.agendaHeader}>
              <div>
                <span className={h.index}>01 / {c.events}</span>
                <h2 id="events-title">{e.agenda}</h2>
                <p>{e.agendaNote}</p>
              </div>
              <Link className={h.textLink} href="/events">
                {c.allEvents}
                <Arrow />
              </Link>
            </div>
            {failed || events.length === 0 ? (
              <div className={h.empty} aria-live="polite" aria-busy={pending}>
                <Icon name={failed ? "wifiOff" : "calendar"} size={27} />
                <h3>{failed ? c.error : c.noEvents}</h3>
                <p>{failed ? c.errorBody : c.noEventsBody}</p>
                {failed && (
                  <button
                    className={h.blueButton}
                    onClick={() => startTransition(() => router.refresh())}
                    disabled={pending}
                  >
                    {pending ? t.common.loading : c.retry}
                    <Icon name="refresh" size={16} />
                  </button>
                )}
              </div>
            ) : (
              <div className={h.schedule}>
                {events.slice(0, 4).map((event) => {
                  const state = event.registration_state ?? "open";
                  const open = state === "open";
                  const date = new Date(event.starts_at);
                  const validDate = Number.isFinite(date.getTime());
                  const status = {
                    open: c.open,
                    ended: c.ended,
                    closed: c.closed,
                    full: c.full,
                    not_published: c.notPublished,
                  }[state];
                  return (
                    <Link
                      href={`/e/${event.slug}`}
                      className={h.scheduleRow}
                      key={event.id}
                    >
                      <div className={h.scheduleDate}>
                        {validDate ? (
                          <>
                            <strong>
                              {new Intl.DateTimeFormat(
                                locale === "ar"
                                  ? "ar-SA-u-ca-gregory-nu-latn"
                                  : "en-GB",
                                { day: "2-digit", timeZone: event.timezone },
                              ).format(date)}
                            </strong>
                            <span>
                              {new Intl.DateTimeFormat(
                                locale === "ar"
                                  ? "ar-SA-u-ca-gregory"
                                  : "en-GB",
                                {
                                  month: "long",
                                  year: "numeric",
                                  timeZone: event.timezone,
                                },
                              ).format(date)}
                            </span>
                          </>
                        ) : (
                          <Icon name="calendar" size={32} />
                        )}
                      </div>
                      <div className={h.scheduleTitle}>
                        <span className={open ? h.openStatus : h.pastStatus}>
                          <i />
                          {status}
                        </span>
                        <h3>{pickText(locale, event.title, event.title_ar)}</h3>
                        <p>
                          <Icon name="pin" size={14} />
                          {pickText(locale, event.venue, event.venue_ar) ||
                            c.venueTba}
                        </p>
                      </div>
                      <div className={h.scheduleMeta}>
                        {!!event.cme_hours && (
                          <span>
                            <Icon name="award" size={17} />
                            {t.public.cmeHours(event.cme_hours)}
                          </span>
                        )}
                        <span className={h.rowAction}>
                          {open ? c.register : c.pastDetails}
                        </span>
                      </div>
                      <span className={h.rowArrow}>
                        <Arrow diagonal />
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
            <div className={h.agendaFooter}>
              <Icon name="calendar" size={15} />
              <span>{c.digitalExperience}</span>
              <span>{c.country}</span>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="about" className={h.story} aria-labelledby="about-title">
        <div className={h.frame}>
          <Reveal className={h.storyHeading}>
            <p className={h.index}>02 / {c.about}</p>
            <div>
              <p className={h.kicker}>{e.storyLabel}</p>
              <h2 id="about-title">{e.storyTitle}</h2>
            </div>
          </Reveal>
          <div className={h.principles}>
            {e.storyWords.map((word, index) => (
              <Reveal key={word} className={h.principle} delay={index * 0.08}>
                <span className={h.principleIndex}>0{index + 1}</span>
                <h3>{word}</h3>
                <p>{c.aboutChecks[index]}</p>
              </Reveal>
            ))}
          </div>
          <Reveal className={h.photoRail}>
            <div className={h.photoTall}>
              <Image
                src="/images/myclinic/reception.webp"
                alt={c.heroAlt}
                fill
                sizes="(max-width:760px) 58vw, 46vw"
              />
            </div>
            <div className={h.photoWide}>
              <Image
                src="/images/myclinic/nurse-station.webp"
                alt={c.aboutAlt}
                fill
                sizes="(max-width:760px) 35vw, 32vw"
              />
            </div>
            <div className={h.photoSmall}>
              <Image
                src="/images/myclinic/riyadh.webp"
                alt={e.galleryAlt}
                fill
                sizes="22vw"
              />
            </div>
          </Reveal>
          <div className={h.railCaption}>
            <span>{e.galleryNote}</span>
            <a
              href="https://myclinic.com.sa/"
              target="_blank"
              rel="noopener noreferrer"
            >
              {c.aboutLink}
              <Arrow diagonal />
            </a>
          </div>
        </div>
      </section>

      <section id="journey" className={h.guide} aria-labelledby="journey-title">
        <div className={`${h.frame} ${h.guideGrid}`}>
          <div>
            <Reveal>
              <p className={h.index}>03 / {e.journeyLabel}</p>
              <h2 id="journey-title">{e.journeyTitle}</h2>
            </Reveal>
            <ol className={h.journeyList}>
              {c.steps.map((step, index) => (
                <li key={step.title}>
                  <span>0{index + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div id="faq" className={h.faqPanel}>
            <Reveal>
              <p className={h.index}>{e.faqLabel}</p>
              <h2>{e.faqTitle}</h2>
            </Reveal>
            <div className={h.faqList}>
              {c.faqs.map((faq) => (
                <details key={faq.question}>
                  <summary>
                    {faq.question}
                    <Icon name="plus" size={18} />
                  </summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={h.closing} aria-labelledby="closing-title">
        <Petal className={h.closingPetal} />
        <Reveal className={h.closingContent}>
          <p className={h.kicker}>{e.closingLabel}</p>
          <h2 id="closing-title">{e.closingTitle}</h2>
          <Link href="/events" className={h.whiteButton}>
            {c.browse}
            <Arrow />
          </Link>
          <a href="#top" className={h.closingTop}>
            {c.backTop}
            <Icon name="chevronDown" size={16} />
          </a>
        </Reveal>
      </section>
    </SiteShell>
  );
}
