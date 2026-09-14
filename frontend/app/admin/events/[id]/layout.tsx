"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { use, type ReactNode } from "react";
import useSWR from "swr";

import { useAdminUser } from "@/components/admin-shell";
import { EventProvider, EventStatusBadge, PhaseBadge } from "@/components/event-context";
import { Icon, type IconName } from "@/components/icons";
import { ErrorBox, LinkButton, Skeleton, cn } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { eventDateLabel, pickText, sessionTimesLabel } from "@/lib/format";
import { isAdminRole } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { AdminEvent } from "@/lib/types";

export default function EventLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, locale } = useI18n();
  const user = useAdminUser();
  const pathname = usePathname();
  const { data: event, error, mutate } = useSWR<AdminEvent>(`/events/${id}`, fetcher);

  if (error && !event) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!event) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-5 w-96" />
        <Skeleton className="mt-4 h-72 rounded-2xl" />
      </div>
    );
  }

  const isManager = event.my_access === "manager";
  const base = `/admin/events/${event.id}`;
  const tabs: { href: string; label: string; icon: IconName; show: boolean }[] = [
    { href: base, label: t.nav.dashboard, icon: "grid", show: true },
    { href: `${base}/attendees`, label: t.nav.attendees, icon: "users", show: true },
    { href: `${base}/scanner`, label: t.nav.scanner, icon: "scan", show: true },
    { href: `${base}/share`, label: t.nav.share, icon: "qr", show: isManager },
    { href: `${base}/certificates`, label: t.nav.certificates, icon: "award", show: isManager },
    { href: `${base}/team`, label: t.nav.team, icon: "team", show: isManager },
    { href: `${base}/sponsors`, label: t.nav.sponsors, icon: "sparkle", show: isManager },
    { href: `${base}/settings`, label: t.nav.settings, icon: "settings", show: isManager },
  ];

  return (
    <EventProvider value={{ event, refresh: () => mutate(), isManager, isAdmin: isAdminRole(user) }}>
      <div className="mb-6">
        <Link href="/admin/events" className="inline-flex items-center gap-1 text-[13px] font-bold text-ink-500 hover:text-navy">
          <Icon name="chevronLeft" size={15} className="rtl:rotate-180" />
          {t.nav.events}
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[22px] font-extrabold leading-tight sm:text-[26px]">
                {pickText(locale, event.title, event.title_ar)}
              </h1>
              <EventStatusBadge status={event.status} />
              <PhaseBadge event={event} />
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px] text-ink-500">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="calendar" size={15} />
                {eventDateLabel(event.sessions, locale)}
                <span className="num">{sessionTimesLabel(event.sessions)}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="pin" size={15} />
                {pickText(locale, event.venue, event.venue_ar)}
              </span>
            </p>
          </div>
          <LinkButton href={`/e/${event.slug}`} target="_blank" variant="secondary" size="sm" icon="external">
            {t.nav.publicPage}
          </LinkButton>
        </div>
        <nav className="-mx-4 mt-5 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label={t.nav.events}>
          <div className="flex min-w-max gap-1 border-b border-hairline">
            {tabs
              .filter((tab) => tab.show)
              .map((tab) => {
                const active = tab.href === base ? pathname === base : pathname.startsWith(tab.href);
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={cn(
                      "-mb-px flex items-center gap-2 border-b-2 px-3.5 py-3 text-[13.5px] font-bold transition-colors duration-150",
                      active ? "border-action text-navy" : "border-transparent text-ink-500 hover:text-navy",
                    )}
                  >
                    <Icon name={tab.icon} size={16} />
                    {tab.label}
                  </Link>
                );
              })}
          </div>
        </nav>
      </div>
      {children}
    </EventProvider>
  );
}
