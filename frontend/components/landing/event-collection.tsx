"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { eventDateLabel, pickText, sessionTimesLabel } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { PublicEvent } from "@/lib/types";
import { landingCopy } from "./copy";
import { Reveal } from "./motion";
import { Arrow } from "./shell";
import s from "./landing.module.css";

export function EventCollection({
  events,
  failed,
  listing = false,
}: {
  events: PublicEvent[];
  failed: boolean;
  listing?: boolean;
}) {
  const { locale, t } = useI18n();
  const c = landingCopy[locale];
  const [filter, setFilter] = useState<"all" | "open" | "past">("all");
  const [search, setSearch] = useState("");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const normalize = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[\u064b-\u065f\u0670]/g, "")
      .toLocaleLowerCase()
      .trim();
  const matchesFilter = (event: PublicEvent, value: typeof filter) =>
    value === "all" ||
    (value === "open"
      ? (event.registration_state ?? "open") === "open"
      : event.registration_state === "ended");
  const filtered = events.filter(
    (event) =>
      matchesFilter(event, filter) &&
      normalize(
        [event.title, event.title_ar, event.venue, event.venue_ar]
          .filter(Boolean)
          .join(" "),
      ).includes(normalize(search)),
  );
  const visible = listing ? filtered : events.slice(0, 2);
  const filters = [
    { value: "all", label: c.all },
    { value: "open", label: c.open },
    { value: "past", label: c.past },
  ] as const;
  const statusLabel = (event: PublicEvent) =>
    ({
      open: c.open,
      ended: c.ended,
      closed: c.closed,
      full: c.full,
      not_published: c.notPublished,
    })[event.registration_state ?? "open"];
  return (
    <>
      {listing && !failed && (
        <div className={s.catalogueControls}>
          <div className={s.searchBox}>
            <Icon name="search" size={21} />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label={c.searchLabel}
              placeholder={c.search}
            />
          </div>
          <div className={s.filterRow}>
            <div className={s.filters} role="group" aria-label={c.events}>
              {filters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={filter === item.value}
                  onClick={() => setFilter(item.value)}
                >
                  {item.label}
                  <span>
                    {
                      events.filter((event) => matchesFilter(event, item.value))
                        .length
                    }
                  </span>
                </button>
              ))}
            </div>
            <p className={s.resultCount} role="status">
              {c.results}: <strong>{filtered.length}</strong>
            </p>
          </div>
        </div>
      )}
      <div aria-live="polite" aria-busy={pending}>
        {failed || visible.length === 0 ? (
          <div className={s.emptyState}>
            <span>
              <Icon
                name={
                  failed
                    ? "wifiOff"
                    : search || filter !== "all"
                      ? "search"
                      : "calendar"
                }
                size={28}
              />
            </span>
            <h3>
              {failed ? c.error : events.length ? c.noResults : c.noEvents}
            </h3>
            <p>
              {failed
                ? c.errorBody
                : events.length
                  ? c.noResultsBody
                  : c.noEventsBody}
            </p>
            {failed ? (
              <button
                className={s.primaryButton}
                disabled={pending}
                onClick={() => startTransition(() => router.refresh())}
              >
                <Icon name="refresh" size={17} />
                {pending ? t.common.loading : c.retry}
              </button>
            ) : events.length > 0 ? (
              <button
                className={s.primaryButton}
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                }}
              >
                {c.reset}
                <Arrow />
              </button>
            ) : null}
          </div>
        ) : (
          <div className={s.eventGrid}>
            {visible.map((event, index) => {
              const state = event.registration_state ?? "open";
              const title = pickText(locale, event.title, event.title_ar);
              const image =
                state === "ended"
                  ? "/images/myclinic/riyadh.webp"
                  : "/images/myclinic/nurse-station.webp";
              const date = new Date(event.starts_at);
              const validDate = Number.isFinite(date.getTime());
              return (
                <Reveal key={event.id} delay={Math.min(index * 0.08, 0.2)}>
                  <article className={s.eventCard}>
                    <Link
                      className={s.eventImage}
                      href={`/e/${event.slug}`}
                      aria-label={`${c.eventDetails}: ${title}`}
                      tabIndex={-1}
                    >
                      <Image
                        src={image}
                        alt={c.photoCaption}
                        fill
                        sizes="(max-width:760px) 100vw, 50vw"
                        className={s.cover}
                      />
                      <span className={s.photoLabel}>{c.photoCaption}</span>
                      {validDate && (
                        <span className={s.dateBadge}>
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
                              locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB",
                              {
                                month: "short",
                                year: "numeric",
                                timeZone: event.timezone,
                              },
                            ).format(date)}
                          </span>
                        </span>
                      )}
                    </Link>
                    <div className={s.eventBody}>
                      <div className={s.eventTags}>
                        <span
                          className={`${s.eventStatus} ${state === "open" ? s.isOpen : s.isPast}`}
                        >
                          <span />
                          {statusLabel(event)}
                        </span>
                        {!!event.cme_hours && (
                          <span className={s.cme}>
                            <Icon name="award" size={16} />
                            {t.public.cmeHours(event.cme_hours)}
                          </span>
                        )}
                        {event.is_preview && (
                          <span className={s.cme}>{c.preview}</span>
                        )}
                      </div>
                      <h3>
                        <Link href={`/e/${event.slug}`}>{title}</Link>
                      </h3>
                      <p className={s.eventDescription}>
                        {pickText(
                          locale,
                          event.description,
                          event.description_ar,
                        ) || c.viewProgramme}
                      </p>
                      <div className={s.eventMeta}>
                        <p>
                          <Icon name="calendar" size={16} />
                          {event.sessions.length
                            ? eventDateLabel(event.sessions, locale)
                            : c.dateTba}
                        </p>
                        <p>
                          <Icon name="pin" size={16} />
                          {pickText(locale, event.venue, event.venue_ar) ||
                            c.venueTba}
                        </p>
                        {event.sessions.length > 0 && (
                          <p>
                            <Icon name="clock" size={16} />
                            <bdi>{sessionTimesLabel(event.sessions)}</bdi>
                          </p>
                        )}
                      </div>
                      <div className={s.eventBottom}>
                        <Link
                          href={`/e/${event.slug}`}
                          className={
                            state === "open" ? s.cardButton : s.cardSecondary
                          }
                        >
                          {state === "open" ? c.register : c.pastDetails}
                          <Arrow />
                        </Link>
                        {state === "open" && event.seats_left != null && (
                          <span>
                            {event.seats_left} {c.seats}
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                </Reveal>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
