"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { eventPhase, useEventCtx } from "@/components/event-context";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { Button, Card, Checkbox, EmptyState, ErrorBox, Skeleton, StatCard, errorMessage } from "@/components/ui";
import { api, fetcher } from "@/lib/api";
import { fmtDuration } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { RegistrationList } from "@/lib/types";

export default function CertificatesPage() {
  const { event } = useEventCtx();
  const { t, locale } = useI18n();
  const toast = useToast();
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState<number | "all" | null>(null);
  const { data, error, mutate } = useSWR<RegistrationList>(
    `/events/${event.id}/registrations?status=eligible&sort=name&page_size=500`,
    fetcher,
  );

  const issued = data?.items.filter((r) => r.certificate_code).length ?? 0;
  const pending = (data?.items.length ?? 0) - issued;

  async function issueAll() {
    setBusy("all");
    try {
      const res = await api<{ issued: number; email_enabled: boolean }>(
        `/events/${event.id}/certificates/issue-all?notify=${notify}`,
        { method: "POST" },
      );
      toast(t.certs.issuedToast(res.issued));
      await mutate();
    } catch (err) {
      toast(errorMessage(err, t, locale), "error");
    } finally {
      setBusy(null);
    }
  }

  async function issueOne(id: number) {
    setBusy(id);
    try {
      await api(`/events/${event.id}/registrations/${id}/certificate?notify=${notify}`, { method: "POST" });
      toast(t.attendees.certIssued);
      await mutate();
    } catch (err) {
      toast(errorMessage(err, t, locale), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-5">
      <p className="max-w-3xl text-[14px] text-ink-500">{t.certs.intro(event.attendance_threshold)}</p>
      {!event.certificates_enabled && (
        <div className="flex items-start gap-3 rounded-xl bg-warning-tint p-4 text-[14px] font-medium text-warning">
          <Icon name="alert" className="mt-0.5 shrink-0" />
          {t.certs.disabled}
        </div>
      )}
      {event.certificates_enabled && (
        <div className="flex items-start gap-3 rounded-xl bg-info-tint p-4 text-[14px] font-medium text-info">
          <Icon name={event.auto_issue_certificates ? "sparkle" : "info"} className="mt-0.5 shrink-0" />
          <span>
            {event.auto_issue_certificates ? t.certs.autoOn : t.certs.autoOff}
            {eventPhase(event) !== "past" && ` ${t.certs.notEnded}`}
          </span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t.certs.eligible} value={data?.items.length ?? "–"} icon="check" tone="success" />
        <StatCard label={t.certs.issued} value={issued} icon="award" tone="fuchsia" />
        <StatCard label={t.certs.pending} value={pending} icon="clock" tone="warning" />
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <Checkbox checked={notify} onChange={setNotify} label={t.certs.notify} />
        <Button icon="award" onClick={issueAll} loading={busy === "all"} disabled={!event.certificates_enabled || pending === 0}>
          {t.certs.issueAll(pending)}
        </Button>
      </Card>

      <Card className="overflow-hidden">
        {error ? (
          <div className="p-5">
            <ErrorBox error={error} onRetry={() => mutate()} />
          </div>
        ) : !data ? (
          <div className="grid gap-2 p-5">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState icon="award" title={t.certs.noneEligible} />
        ) : (
          <ul className="divide-y divide-hairline">
            {data.items.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-bold text-ink-900">{r.full_name}</div>
                  <div className="num text-[12px] text-ink-500">
                    {r.ticket_code} · {r.attendance.percent}% · {fmtDuration(r.attendance.attended_minutes, locale)}
                  </div>
                </div>
                {r.certificate_code ? (
                  <Link
                    href={`/verify/${r.certificate_code}`}
                    target="_blank"
                    className="num inline-flex items-center gap-1.5 text-[13px] font-bold text-success hover:underline"
                  >
                    <Icon name="award" size={15} />
                    {r.certificate_code}
                  </Link>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busy === r.id}
                    disabled={!event.certificates_enabled}
                    onClick={() => issueOne(r.id)}
                  >
                    {t.attendees.issueCert}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
