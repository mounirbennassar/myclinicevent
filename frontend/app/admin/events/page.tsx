"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { useAdminUser } from "@/components/admin-shell";
import { EventStatusBadge, PhaseBadge } from "@/components/event-context";
import { Icon } from "@/components/icons";
import { Badge, Card, EmptyState, ErrorBox, LinkButton, PageHeader, Progress, Segmented, Skeleton } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { eventDateLabel, pickText, sessionTimesLabel } from "@/lib/format";
import { isAdminRole } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { AdminEvent } from "@/lib/types";

type Filter = "" | "published" | "draft" | "closed" | "archived";

export default function EventsPage() {
  const { t, locale } = useI18n();
  const user = useAdminUser();
  const [filter, setFilter] = useState<Filter>("");
  const { data, error, mutate } = useSWR<AdminEvent[]>(`/events${filter ? `?status=${filter}` : ""}`, fetcher);

  return (
    <>
      <PageHeader
        title={t.events.title}
        actions={
          isAdminRole(user) && (
            <LinkButton href="/admin/events/new" icon="plus">
              {t.events.new}
            </LinkButton>
          )
        }
      />
      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        size="sm"
        className="mb-5 max-w-full overflow-x-auto"
        options={[
          { value: "", label: t.events.filterAll },
          { value: "published", label: t.eventStatus.published },
          { value: "draft", label: t.eventStatus.draft },
          { value: "closed", label: t.eventStatus.closed },
          { value: "archived", label: t.events.showArchived },
        ]}
      />

      {error ? (
        <ErrorBox error={error} onRetry={() => mutate()} />
      ) : !data ? (
        <div className="grid gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <Card>
          <EmptyState icon="calendar" title={t.events.empty} />
        </Card>
      ) : (
        <div className="grid gap-3">
          {data.map((e) => (
            <Card key={e.id} className="transition-shadow duration-200 hover:shadow-raised">
              <Link href={`/admin/events/${e.id}`} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[16px] font-extrabold">{pickText(locale, e.title, e.title_ar)}</h2>
                    <EventStatusBadge status={e.status} />
                    <PhaseBadge event={e} />
                    {e.my_access && user.role === "staff" && <Badge tone="info">{t.roles[e.my_access]}</Badge>}
                  </div>
                  <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-500">
                    <span className="inline-flex items-center gap-1.5">
                      <Icon name="calendar" size={14} />
                      {eventDateLabel(e.sessions, locale)}
                      <span className="num">{sessionTimesLabel(e.sessions)}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Icon name="pin" size={14} />
                      {pickText(locale, e.venue, e.venue_ar)}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-5 sm:w-56">
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between text-[12px] font-bold text-ink-500">
                      <span>{t.events.registered}</span>
                      <span className="num text-[15px] text-navy">
                        {e.registered}
                        {e.capacity ? <span className="text-ink-500"> / {e.capacity}</span> : null}
                      </span>
                    </div>
                    {e.capacity ? <Progress value={(e.registered / e.capacity) * 100} className="mt-2" /> : null}
                  </div>
                  <Icon name="chevronRight" size={18} className="text-ink-300 rtl:rotate-180" />
                </div>
              </Link>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
