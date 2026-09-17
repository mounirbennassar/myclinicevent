"use client";

import { useState } from "react";
import useSWR from "swr";

import { Icon } from "@/components/icons";
import { useMember } from "@/components/member-shell";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, EmptyState, ErrorBox, LinkButton, PageHeader, Skeleton, errorMessage } from "@/components/ui";
import { api, fetcher } from "@/lib/api";
import { eventDateLabel, pickText } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { MemberEventRow, MemberRegistration } from "@/lib/types";

type ApplyResult = { registration: MemberRegistration; already_registered: boolean };

function EventRow({ row, onChanged }: { row: MemberEventRow; onChanged: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const { event, registration } = row;
  const state = event.registration_state ?? "open";
  const title = pickText(locale, event.title, event.title_ar);
  const venue = pickText(locale, event.venue, event.venue_ar);

  async function apply() {
    setBusy(true);
    try {
      const res = await api<ApplyResult>(`/member/events/${event.slug}/apply`, { method: "POST", body: {} });
      toast(res.already_registered ? t.member.alreadyApplied : t.member.applied);
      onChanged();
    } catch (error) {
      toast(errorMessage(error, t, locale), "error");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {registration ? (
            <Badge tone="success" dot>
              {t.member.registered}
            </Badge>
          ) : (
            <Badge tone={state === "open" ? "teal" : "neutral"}>{t.public.states[state]}</Badge>
          )}
          {event.cme_hours ? <Badge tone="navy">{t.public.cmeHours(event.cme_hours)}</Badge> : null}
          {!registration && state === "open" && event.seats_left != null && (
            <span className="text-[12.5px] font-bold text-ink-500">{t.public.seatsLeft(event.seats_left)}</span>
          )}
        </div>
        <h3 className="mt-2 text-[17px] font-extrabold leading-snug text-navy">{title}</h3>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="calendar" size={14} />
            {eventDateLabel(event.sessions, locale)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="pin" size={14} />
            {venue}
          </span>
          {registration && (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="qr" size={14} />
              {t.member.ticket} <span dir="ltr" className="font-bold text-ink-900">{registration.ticket_code}</span>
            </span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <LinkButton href={`/e/${event.slug}`} variant="ghost" size="sm">
          {t.member.viewEvent}
        </LinkButton>
        {registration ? (
          <>
            {registration.certificate_issued && (
              <LinkButton href={`/r/${registration.access_token}/certificate`} variant="secondary" size="sm" icon="award">
                {t.member.certificate}
              </LinkButton>
            )}
            <LinkButton href={`/r/${registration.access_token}`} variant="navy" size="sm" icon="qr">
              {t.member.viewPass}
            </LinkButton>
          </>
        ) : state === "open" ? (
          <Button onClick={apply} loading={busy} icon="check">
            {busy ? t.member.applying : t.member.apply}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-[15px] font-extrabold text-navy">{title}</h2>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

export default function MemberEventsPage() {
  const { user } = useMember();
  const { t } = useI18n();
  const { data, error, mutate } = useSWR<MemberEventRow[]>("/member/events", fetcher, { revalidateOnFocus: true });

  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;

  const rows = data ?? [];
  const mine = rows.filter((r) => r.registration);
  const open = rows.filter((r) => !r.registration && r.event.registration_state === "open");
  const other = rows.filter((r) => !r.registration && !["open", "ended"].includes(r.event.registration_state ?? "open"));
  const past = rows.filter((r) => !r.registration && r.event.registration_state === "ended");
  const refresh = () => void mutate();

  return (
    <div>
      <PageHeader title={t.member.welcome(user.full_name)} subtitle={t.member.eventsIntro} />
      {!data ? (
        <div className="grid gap-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : (
        <>
          <Section title={t.member.openEvents}>
            {open.length ? (
              open.map((row) => <EventRow key={row.event.id} row={row} onChanged={refresh} />)
            ) : (
              <Card>
                <EmptyState icon="calendar" title={t.member.openEmpty} />
              </Card>
            )}
          </Section>
          <Section title={t.member.myEvents}>
            {mine.length ? (
              mine.map((row) => <EventRow key={row.event.id} row={row} onChanged={refresh} />)
            ) : (
              <Card className="p-5 text-[14px] text-ink-500">{t.member.myEventsEmpty}</Card>
            )}
          </Section>
          {other.length > 0 && (
            <Section title={t.member.otherEvents}>
              {other.map((row) => (
                <EventRow key={row.event.id} row={row} onChanged={refresh} />
              ))}
            </Section>
          )}
          {past.length > 0 && (
            <Section title={t.member.pastEvents}>
              {past.map((row) => (
                <EventRow key={row.event.id} row={row} onChanged={refresh} />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}
