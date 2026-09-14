"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { api, fetcher } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { fmtDateTime, fmtDuration, fmtTime, isoToZonedLocal, zonedLocalToIso } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { AttendanceStatus, RegistrationDetail } from "@/lib/types";

import { whatsappUrl } from "@/lib/whatsapp";

import { useEventCtx } from "./event-context";
import { Icon } from "./icons";
import { SessionBreakdown } from "./session-breakdown";
import { useToast } from "./toast";
import { Badge, Button, Drawer, ErrorBox, Input, Ring, Segmented, Select, Skeleton, Textarea, cn, errorMessage, type Tone } from "./ui";

export const ATT_TONES: Record<AttendanceStatus, Tone> = {
  not_arrived: "neutral",
  inside: "teal",
  checked_out: "navy",
  no_checkout: "warning",
};

export function AttendeeDrawer({
  registrationId,
  onClose,
  onChanged,
}: {
  registrationId: number | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { event, isManager } = useEventCtx();
  const { t, locale } = useI18n();
  const toast = useToast();
  const tz = event.timezone;
  const base = `/events/${event.id}/registrations/${registrationId}`;
  const { data: r, error, mutate } = useSWR<RegistrationDetail>(registrationId ? base : null, fetcher);
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [at, setAt] = useState(() => isoToZonedLocal(new Date().toISOString(), tz));
  const [notes, setNotes] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function run(label: string, action: () => Promise<RegistrationDetail | unknown>, success?: string) {
    setBusy(label);
    try {
      const result = await action();
      if (result && typeof result === "object" && "scans" in result) await mutate(result as RegistrationDetail, false);
      else await mutate();
      onChanged();
      if (success) toast(success);
      return result;
    } catch (err) {
      toast(errorMessage(err, t, locale), "error");
    } finally {
      setBusy(null);
    }
  }

  const patch = (body: Record<string, unknown>, success = t.attendees.saved) =>
    run("patch", () => api<RegistrationDetail>(base, { method: "PATCH", body }), success);

  return (
    <Drawer
      open={registrationId != null}
      onClose={onClose}
      title={r?.full_name ?? t.common.loading}
      subtitle={
        r && (
          <span className="flex flex-wrap items-center gap-2">
            <span className="num font-bold text-navy">{r.ticket_code}</span>
            {r.status === "cancelled" ? (
              <Badge tone="danger">{t.attStatus.cancelled}</Badge>
            ) : (
              <Badge tone={ATT_TONES[r.attendance.status]} dot pulse={r.attendance.status === "inside"}>
                {t.attStatus[r.attendance.status]}
              </Badge>
            )}
            {r.source === "walkin" && <Badge tone="info">{t.attendees.walkin}</Badge>}
            {r.source === "import" && <Badge tone="info">{t.attendees.imported}</Badge>}
          </span>
        )
      }
    >
      {error ? (
        <ErrorBox error={error} onRetry={() => mutate()} />
      ) : !r ? (
        <div className="grid gap-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-48" />
        </div>
      ) : (
        <div className="grid gap-6">
          <section className="flex items-center gap-5 rounded-2xl bg-tint p-4">
            <Ring value={r.attendance.percent} threshold={r.attendance.threshold} size={104} stroke={9}>
              <div className="num text-[20px] font-extrabold text-navy">{r.attendance.percent}%</div>
            </Ring>
            <div className="grid flex-1 gap-1.5 text-[13.5px]">
              <div>
                <span className="text-ink-500">{t.pass.attended}: </span>
                <span className="num font-extrabold text-navy">{fmtDuration(r.attendance.attended_minutes, locale)}</span>
                <span className="num text-ink-500"> / {fmtDuration(r.attendance.required_minutes, locale)}</span>
              </div>
              <div>
                {r.attendance.eligible ? (
                  <Badge tone="success">{t.attStatus.eligible}</Badge>
                ) : (
                  <Badge tone="warning">{t.attStatus.not_eligible}</Badge>
                )}
                {r.attendance.override != null && <span className="ms-2 text-[12px] text-ink-500">({t.attendees.eligibility})</span>}
              </div>
              {r.attendance.first_in && (
                <div className="num text-[12.5px] text-ink-500">
                  {t.attendees.firstIn}: {fmtTime(r.attendance.first_in, tz, locale)}
                </div>
              )}
            </div>
          </section>

          {r.attendance.sessions.length > 1 && (
            <section>
              <h3 className="text-[13px] font-extrabold text-ink-900">
                {t.pass.perSession}
                {r.attendance.session_rule === "each" && (
                  <span className="ms-1.5 font-medium text-ink-500">· {t.public.ruleEach}</span>
                )}
              </h3>
              <div className="mt-2">
                <SessionBreakdown sessions={r.attendance.sessions} eventSessions={event.sessions} threshold={r.attendance.threshold} tz={tz} />
              </div>
            </section>
          )}

          <section>
            <h3 className="text-[13px] font-extrabold text-ink-900">{t.attendees.details}</h3>
            <dl className="mt-2 divide-y divide-hairline rounded-xl border border-hairline text-[13.5px]">
              {[
                [t.public.fields.email, r.email],
                [t.public.fields.mobile, r.mobile],
                [t.public.fields.scfhs_number, r.scfhs_number],
                [t.public.fields.national_id, r.national_id],
                [t.public.fields.profession, r.profession ? t.professions[r.profession] : "—"],
                [t.attendees.registeredAt, fmtDateTime(r.created_at, tz, locale)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-ink-500">{label}</dt>
                  <dd className="num text-end font-bold text-ink-900" dir="auto">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            {!isManager && <p className="mt-1.5 text-[12px] text-ink-500">{t.attendees.masked}</p>}
          </section>

          <section>
            <h3 className="text-[13px] font-extrabold text-ink-900">{t.attendees.scanHistory}</h3>
            {r.scans.length === 0 ? (
              <p className="mt-2 text-[13.5px] text-ink-500">{t.dash.noScans}</p>
            ) : (
              <ul className="mt-2 grid gap-1.5">
                {r.scans.map((s) => (
                  <li
                    key={s.id}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border border-hairline px-3.5 py-2.5 text-[13.5px]",
                      s.voided && "opacity-50",
                    )}
                  >
                    <Icon
                      name={s.direction === "in" ? "arrowIn" : "arrowOut"}
                      size={17}
                      className={s.direction === "in" ? "text-brand-teal" : "text-navy"}
                    />
                    <div className="min-w-0 flex-1">
                      <div className={cn("font-bold text-ink-900", s.voided && "line-through")}>
                        {s.direction === "in" ? t.attendees.checkIn : t.attendees.checkOut}
                        <span className="num ms-2 font-medium text-ink-500">{fmtDateTime(s.scanned_at, tz, locale)}</span>
                      </div>
                      <div className="text-[12px] text-ink-500">
                        {t.attendees.method[s.method]}
                        {s.scanned_by && ` · ${t.attendees.by(s.scanned_by)}`}
                        {s.voided && ` · ${t.attendees.voided}`}
                      </div>
                    </div>
                    {isManager && (
                      <button
                        className="text-[12.5px] font-bold text-action hover:underline disabled:opacity-40"
                        disabled={busy != null}
                        onClick={() =>
                          run("void", () =>
                            api<RegistrationDetail>(`/events/${event.id}/scans/${s.id}`, {
                              method: "PATCH",
                              body: { voided: !s.voided },
                            }),
                          )
                        }
                      >
                        {s.voided ? t.attendees.restore : t.attendees.void}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {isManager && (
            <>
              <section className="rounded-2xl border border-hairline p-4">
                <h3 className="text-[13px] font-extrabold text-ink-900">{t.attendees.manualTitle}</h3>
                <p className="mt-0.5 text-[12.5px] text-ink-500">{t.attendees.manualHint}</p>
                <div className="mt-3 grid gap-2.5 sm:grid-cols-[auto_1fr_auto]">
                  <Segmented
                    size="sm"
                    value={direction}
                    onChange={setDirection}
                    options={[
                      { value: "in", label: t.attendees.checkIn },
                      { value: "out", label: t.attendees.checkOut },
                    ]}
                  />
                  <Input type="datetime-local" dir="ltr" className="h-10" value={at} onChange={(e) => setAt(e.target.value)} aria-label={t.attendees.time} />
                  <Button
                    size="sm"
                    className="h-10"
                    loading={busy === "manual"}
                    onClick={() =>
                      run(
                        "manual",
                        () =>
                          api<RegistrationDetail>(`${base}/scans`, {
                            method: "POST",
                            body: { direction, at: zonedLocalToIso(at, tz) },
                          }),
                        t.attendees.saved,
                      )
                    }
                  >
                    {t.attendees.add}
                  </Button>
                </div>
              </section>

              <section className="grid gap-4">
                <div>
                  <label className="text-[13px] font-extrabold text-ink-900" htmlFor="override">
                    {t.attendees.eligibility}
                  </label>
                  <div className="mt-1.5">
                    <Select
                      id="override"
                      value={r.eligibility_override == null ? "auto" : r.eligibility_override ? "yes" : "no"}
                      onChange={(e) =>
                        patch({ eligibility_override: e.target.value === "auto" ? null : e.target.value === "yes" })
                      }
                    >
                      <option value="auto">{t.attendees.overrideAuto}</option>
                      <option value="yes">{t.attendees.overrideYes}</option>
                      <option value="no">{t.attendees.overrideNo}</option>
                    </Select>
                  </div>
                  <p className="mt-1 text-[12px] text-ink-500">{t.attendees.overrideHint}</p>
                </div>
                <div>
                  <label className="text-[13px] font-extrabold text-ink-900" htmlFor="notes">
                    {t.attendees.notes}
                  </label>
                  <Textarea
                    id="notes"
                    className="mt-1.5 min-h-20"
                    value={notes ?? r.notes ?? ""}
                    onChange={(e) => setNotes(e.target.value)}
                    onBlur={() => notes != null && notes !== (r.notes ?? "") && patch({ notes })}
                  />
                </div>
              </section>

              <section className="grid gap-2">
                {r.pass_url && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="link"
                      onClick={async () => (await copyText(r.pass_url!)) && toast(t.common.copied)}
                    >
                      {t.attendees.copyPass}
                    </Button>
                    <a
                      href={whatsappUrl(
                        t.attendees.whatsappText(r.full_name, event.title, r.pass_url),
                        r.mobile.startsWith("+") ? r.mobile : null,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-[13px] font-bold text-[#128c7e] hover:bg-tint"
                    >
                      <Icon name="phone" size={15} />
                      {t.attendees.whatsapp}
                    </a>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="mail"
                      loading={busy === "resend"}
                      onClick={async () => {
                        const res = (await run("resend", () => api<{ email_enabled: boolean }>(`${base}/resend`, { method: "POST" }))) as
                          | { email_enabled: boolean }
                          | undefined;
                        if (res) toast(res.email_enabled ? t.attendees.resent : t.attendees.emailOff, res.email_enabled ? "success" : "info");
                      }}
                    >
                      {t.attendees.resend}
                    </Button>
                  </div>
                )}
                {r.certificate_code ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="flex items-center gap-2 text-[13.5px] text-success">
                      <Icon name="award" size={16} />
                      {t.attendees.certIssued}:
                      <Link href={`/verify/${r.certificate_code}`} target="_blank" className="num font-bold underline">
                        {r.certificate_code}
                      </Link>
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger"
                      loading={busy === "revoke"}
                      title={t.attendees.revokeHint}
                      onClick={() =>
                        run("revoke", () => api<RegistrationDetail>(`${base}/certificate`, { method: "DELETE" }), t.attendees.certRevoked)
                      }
                    >
                      {t.attendees.revokeCert}
                    </Button>
                  </div>
                ) : (
                  r.attendance.eligible &&
                  event.certificates_enabled && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        icon="award"
                        loading={busy === "cert"}
                        onClick={() =>
                          run("cert", () => api<RegistrationDetail>(`${base}/certificate?notify=true`, { method: "POST" }), t.attendees.certIssued)
                        }
                      >
                        {t.attendees.issueCertEmail}
                      </Button>
                    </div>
                  )
                )}
              </section>

              <section className="flex flex-wrap gap-2 border-t border-hairline pt-5">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={r.status === "cancelled" ? "refresh" : "x"}
                  loading={busy === "patch"}
                  onClick={() => patch({ status: r.status === "cancelled" ? "registered" : "cancelled" })}
                >
                  {r.status === "cancelled" ? t.attendees.restoreReg : t.attendees.cancelReg}
                </Button>
                {confirmDelete ? (
                  <div className="flex w-full flex-wrap items-center gap-2 rounded-xl bg-danger-tint p-3 text-[13px] text-danger">
                    <span className="flex-1 font-medium">{t.attendees.deleteRegHint}</span>
                    <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>
                      {t.common.cancel}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={busy === "delete"}
                      onClick={async () => {
                        setBusy("delete");
                        try {
                          await api(base, { method: "DELETE" });
                          onChanged();
                          onClose();
                        } catch (err) {
                          toast(errorMessage(err, t, locale), "error");
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      {t.common.delete}
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" icon="trash" className="text-danger" onClick={() => setConfirmDelete(true)}>
                    {t.attendees.deleteReg}
                  </Button>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </Drawer>
  );
}
