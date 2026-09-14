"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { useI18n } from "@/lib/i18n";
import type { PublicEvent } from "@/lib/types";
import { landingCopy } from "./copy";
import { editorialCopy } from "./editorial-copy";
import { EventCollection } from "./event-collection";
import { Reveal } from "./motion";
import { SiteShell } from "./shell";
import s from "./landing.module.css";
import h from "./home.module.css";

export function EventsPage({
  events,
  failed,
}: {
  events: PublicEvent[];
  failed: boolean;
}) {
  const { locale } = useI18n();
  const c = landingCopy[locale];
  const e = editorialCopy[locale];
  return (
    <SiteShell listing>
      <section className={h.directory} aria-labelledby="catalogue-title">
        <div className={h.frame}>
          <nav className={h.directoryTop} aria-label={c.menu}>
            <Link href="/">{c.home}</Link>
            <Icon name="chevronRight" size={13} />
            <span>{c.events}</span>
          </nav>
          <Reveal className={h.directoryHeading}>
            <div>
              <h1 id="catalogue-title">{e.directory}</h1>
              <p>{e.directoryIntro}</p>
            </div>
            {!failed && (
              <div className={h.directoryCount}>
                <strong>{String(events.length).padStart(2, "0")}</strong>
                <span>{e.published}</span>
              </div>
            )}
          </Reveal>
        </div>
      </section>
      <section
        className={`${s.section} ${s.catalogueSection}`}
        aria-label={c.events}
      >
        <div className={s.container}>
          <h2 className="sr-only">{c.events}</h2>
          <EventCollection events={events} failed={failed} listing />
        </div>
      </section>
    </SiteShell>
  );
}
