"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";

import { ApiError } from "@/lib/api";
import { ACCENTS, fmtDuration, isoToZonedLocal, zonedLocalToIso } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Accent, AdminEvent, EventStatus, SessionRule } from "@/lib/types";

import { Icon } from "./icons";
import { Button, Card, Field, Input, Select, Switch, Textarea, cn, errorMessage } from "./ui";

const TIMEZONES = ["Asia/Riyadh", "Asia/Dubai", "Asia/Kuwait", "Asia/Qatar", "Asia/Bahrain", "Asia/Muscat", "Africa/Cairo", "Europe/London", "UTC"];

type SessionDraft = { key: number; date: string; start: string; end: string; title: string; title_ar: string };

export type EventPayload = Record<string, unknown>;

function inTwoWeeks(): string {
  const d = new Date(Date.now() + 14 * 86400000);
  return d.toISOString().slice(0, 10);
}

let sessionKey = 1;

export function EventForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: AdminEvent;
  submitLabel: string;
  onSubmit: (payload: EventPayload) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const tzInitial = initial?.timezone ?? "Asia/Riyadh";
  const [v, setV] = useState({
    title: initial?.title ?? "",
    title_ar: initial?.title_ar ?? "",
    slug: initial?.slug ?? "",
    description: initial?.description ?? "",
    description_ar: initial?.description_ar ?? "",
    venue: initial?.venue ?? "",
    venue_ar: initial?.venue_ar ?? "",
    venue_map_url: initial?.venue_map_url ?? "",
    timezone: tzInitial,
    cme_hours: initial?.cme_hours != null ? String(initial.cme_hours) : "",
    accreditation_text: initial?.accreditation_text ?? "",
    accreditation_ar: initial?.accreditation_ar ?? "",
    scfhs_activity_code: initial?.scfhs_activity_code ?? "",
    attendance_threshold: initial?.attendance_threshold ?? 80,
    session_rule: (initial?.session_rule ?? "overall") as SessionRule,
    auto_issue_certificates: initial?.auto_issue_certificates ?? true,
    capacity: initial?.capacity != null ? String(initial.capacity) : "",
    registration_open: initial?.registration_open ?? true,
    registration_closes_at: initial?.registration_closes_at ? isoToZonedLocal(initial.registration_closes_at, tzInitial) : "",
    status: (initial?.status ?? "draft") as EventStatus,
    count_open_until_end: initial?.count_open_until_end ?? true,
    certificates_enabled: initial?.certificates_enabled ?? true,
    accent: (initial?.accent ?? "teal") as Accent,
  });
  const [sessions, setSessions] = useState<SessionDraft[]>(
    initial?.sessions.length
      ? initial.sessions.map((s) => ({
          key: sessionKey++,
          date: s.date,
          start: s.start,
          end: s.end,
          title: s.title ?? "",
          title_ar: s.title_ar ?? "",
        }))
      : [{ key: sessionKey++, date: inTwoWeeks(), start: "08:00", end: "16:00", title: "", title_ar: "" }],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof typeof v>(key: K, value: (typeof v)[K]) => {
    setV((prev) => ({ ...prev, [key]: value }));
    setErrors(({ [key]: _removed, ...rest }) => rest);
  };
  const setSession = (key: number, patch: Partial<SessionDraft>) => {
    setSessions((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
    setErrors(({ sessions: _removed, ...rest }) => rest);
  };
  const err = (key: string) => (errors[key] ? t.fieldErrors[errors[key]] ?? t.fieldErrors.invalid : null);

  const totalMinutes = useMemo(
    () =>
      sessions.reduce((sum, s) => {
        const [sh, sm] = s.start.split(":").map(Number);
        const [eh, em] = s.end.split(":").map(Number);
        return sum + Math.max(0, eh * 60 + em - (sh * 60 + sm));
      }, 0),
    [sessions],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (v.title.trim().length < 3) local.title = "required";
    if (v.venue.trim().length < 2) local.venue = "required";
    if (sessions.some((s) => !s.date || !s.start || !s.end || s.end <= s.start)) local.sessions = "session_order";
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    const text = (s: string) => s.trim() || null;
    const payload: EventPayload = {
      title: v.title.trim(),
      title_ar: text(v.title_ar),
      description: text(v.description),
      description_ar: text(v.description_ar),
      venue: v.venue.trim(),
      venue_ar: text(v.venue_ar),
      venue_map_url: text(v.venue_map_url),
      timezone: v.timezone,
      cme_hours: v.cme_hours ? Number(v.cme_hours) : null,
      accreditation_text: text(v.accreditation_text),
      accreditation_ar: text(v.accreditation_ar),
      scfhs_activity_code: text(v.scfhs_activity_code),
      attendance_threshold: Number(v.attendance_threshold),
      session_rule: v.session_rule,
      auto_issue_certificates: v.auto_issue_certificates,
      capacity: v.capacity ? Number(v.capacity) : null,
      registration_open: v.registration_open,
      registration_closes_at: v.registration_closes_at ? zonedLocalToIso(v.registration_closes_at, v.timezone) : null,
      status: v.status,
      count_open_until_end: v.count_open_until_end,
      certificates_enabled: v.certificates_enabled,
      accent: v.accent,
      sessions: sessions.map((s) => ({
        date: s.date,
        start: s.start,
        end: s.end,
        title: text(s.title),
        title_ar: text(s.title_ar),
      })),
    };
    if (initial && v.slug.trim() && v.slug.trim() !== initial.slug) payload.slug = v.slug.trim();
    setBusy(true);
    setFormError(null);
    try {
      await onSubmit(payload);
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fields).length) {
        setErrors(error.fields);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setFormError(errorMessage(error, t, locale));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-6">
      <Section title={t.eventForm.basics}>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label={t.eventForm.titleEn} error={err("title")} htmlFor="ev-title">
            <Input id="ev-title" value={v.title} onChange={(e) => set("title", e.target.value)} invalid={!!errors.title} />
          </Field>
          <Field label={t.eventForm.titleAr} optional htmlFor="ev-title-ar">
            <Input id="ev-title-ar" dir="rtl" lang="ar" value={v.title_ar} onChange={(e) => set("title_ar", e.target.value)} />
          </Field>
          {initial && (
            <Field label={t.eventForm.slug} hint={t.eventForm.slugHint} error={err("slug")} htmlFor="ev-slug" className="md:col-span-2">
              <div className="flex items-center overflow-hidden rounded-lg border border-ink-200 focus-within:border-action focus-within:ring-3 focus-within:ring-action/20" dir="ltr">
                <span className="num whitespace-nowrap bg-ink-50 px-3 py-2.5 text-[13px] text-ink-500">/e/</span>
                <input
                  id="ev-slug"
                  className="num h-11 min-w-0 flex-1 px-2 text-[15px] outline-none"
                  value={v.slug}
                  onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                />
              </div>
            </Field>
          )}
          <Field label={t.eventForm.descriptionEn} optional htmlFor="ev-desc">
            <Textarea id="ev-desc" value={v.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <Field label={t.eventForm.descriptionAr} optional htmlFor="ev-desc-ar">
            <Textarea id="ev-desc-ar" dir="rtl" lang="ar" value={v.description_ar} onChange={(e) => set("description_ar", e.target.value)} />
          </Field>
          <Field label={t.eventForm.venueEn} error={err("venue")} htmlFor="ev-venue">
            <Input id="ev-venue" value={v.venue} onChange={(e) => set("venue", e.target.value)} invalid={!!errors.venue} />
          </Field>
          <Field label={t.eventForm.venueAr} optional htmlFor="ev-venue-ar">
            <Input id="ev-venue-ar" dir="rtl" lang="ar" value={v.venue_ar} onChange={(e) => set("venue_ar", e.target.value)} />
          </Field>
          <Field label={t.eventForm.mapUrl} optional error={err("venue_map_url")} htmlFor="ev-map" className="md:col-span-2">
            <Input
              id="ev-map"
              type="url"
              dir="ltr"
              placeholder="https://maps.google.com/…"
              value={v.venue_map_url}
              onChange={(e) => set("venue_map_url", e.target.value)}
              invalid={!!errors.venue_map_url}
            />
          </Field>
        </div>
      </Section>

      <Section title={t.eventForm.schedule} subtitle={t.eventForm.scheduleHint}>
        <Field label={t.eventForm.timezone} htmlFor="ev-tz" className="max-w-xs">
          <Select id="ev-tz" value={v.timezone} onChange={(e) => set("timezone", e.target.value)}>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </Field>
        <div className="mt-5 grid gap-3">
          {sessions.map((s, i) => (
            <div key={s.key} className="rounded-xl border border-hairline bg-ink-50/60 p-4">
              <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr_1fr_auto] sm:items-end">
                <Field label={`${t.eventForm.date} ${sessions.length > 1 ? i + 1 : ""}`} htmlFor={`s-date-${s.key}`}>
                  <Input id={`s-date-${s.key}`} type="date" dir="ltr" value={s.date} onChange={(e) => setSession(s.key, { date: e.target.value })} />
                </Field>
                <Field label={t.eventForm.start} htmlFor={`s-start-${s.key}`}>
                  <Input id={`s-start-${s.key}`} type="time" dir="ltr" value={s.start} onChange={(e) => setSession(s.key, { start: e.target.value })} />
                </Field>
                <Field label={t.eventForm.end} htmlFor={`s-end-${s.key}`}>
                  <Input id={`s-end-${s.key}`} type="time" dir="ltr" value={s.end} onChange={(e) => setSession(s.key, { end: e.target.value })} />
                </Field>
                <Button
                  variant="ghost"
                  size="md"
                  icon="trash"
                  aria-label={t.eventForm.removeSession}
                  disabled={sessions.length === 1}
                  onClick={() => setSessions((list) => list.filter((x) => x.key !== s.key))}
                />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input
                  placeholder={t.eventForm.sessionTitleEn}
                  value={s.title}
                  onChange={(e) => setSession(s.key, { title: e.target.value })}
                  aria-label={t.eventForm.sessionTitleEn}
                />
                <Input
                  placeholder={t.eventForm.sessionTitleAr}
                  dir="rtl"
                  lang="ar"
                  value={s.title_ar}
                  onChange={(e) => setSession(s.key, { title_ar: e.target.value })}
                  aria-label={t.eventForm.sessionTitleAr}
                />
              </div>
            </div>
          ))}
        </div>
        {errors.sessions && <p className="mt-3 text-[13px] font-medium text-danger">{err("sessions")}</p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="secondary"
            size="sm"
            icon="plus"
            onClick={() => {
              const last = sessions[sessions.length - 1];
              setSessions((list) => [
                ...list,
                { key: sessionKey++, date: last?.date ?? inTwoWeeks(), start: last?.end ?? "13:00", end: "16:00", title: "", title_ar: "" },
              ]);
            }}
          >
            {t.eventForm.addSession}
          </Button>
          <span className="num text-[13px] font-bold text-navy">{t.eventForm.totalRequired(fmtDuration(totalMinutes, locale))}</span>
        </div>
      </Section>

      <Section title={t.eventForm.cmeSection}>
        <div className="grid gap-5 md:grid-cols-3">
          <Field label={t.eventForm.cmeHours} optional error={err("cme_hours")} htmlFor="ev-cme">
            <Input
              id="ev-cme"
              type="number"
              min={0}
              step={0.5}
              dir="ltr"
              value={v.cme_hours}
              onChange={(e) => set("cme_hours", e.target.value)}
            />
          </Field>
          <Field
            label={`${t.eventForm.threshold}: ${v.attendance_threshold}%`}
            hint={t.eventForm.thresholdHint}
            htmlFor="ev-threshold"
            className="md:col-span-2"
          >
            <input
              id="ev-threshold"
              type="range"
              min={50}
              max={100}
              step={5}
              value={v.attendance_threshold}
              onChange={(e) => set("attendance_threshold", Number(e.target.value))}
              className="h-11 w-full accent-[#004d99]"
            />
          </Field>
          <Field label={t.eventForm.sessionRule} hint={t.eventForm.sessionRuleHint} htmlFor="ev-rule" className="md:col-span-3">
            <Select id="ev-rule" value={v.session_rule} onChange={(e) => set("session_rule", e.target.value as SessionRule)}>
              <option value="overall">{t.eventForm.sessionRuleOverall}</option>
              <option value="each">{t.eventForm.sessionRuleEach}</option>
            </Select>
          </Field>
          <Field label={t.eventForm.activityCode} optional htmlFor="ev-code">
            <Input id="ev-code" dir="ltr" value={v.scfhs_activity_code} onChange={(e) => set("scfhs_activity_code", e.target.value)} />
          </Field>
          <Field label={t.eventForm.accreditationEn} optional htmlFor="ev-acc" className="md:col-span-2">
            <Textarea id="ev-acc" className="min-h-20" value={v.accreditation_text} onChange={(e) => set("accreditation_text", e.target.value)} />
          </Field>
          <Field label={t.eventForm.accreditationAr} optional htmlFor="ev-acc-ar" className="md:col-span-3">
            <Textarea
              id="ev-acc-ar"
              className="min-h-20"
              dir="rtl"
              lang="ar"
              value={v.accreditation_ar}
              onChange={(e) => set("accreditation_ar", e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-6 grid gap-5 border-t border-hairline pt-5">
          <Switch
            checked={v.count_open_until_end}
            onChange={(val) => set("count_open_until_end", val)}
            label={t.eventForm.openCheckout}
            hint={t.eventForm.openCheckoutHint}
          />
          <Switch checked={v.certificates_enabled} onChange={(val) => set("certificates_enabled", val)} label={t.eventForm.certificatesEnabled} />
          <Switch
            checked={v.auto_issue_certificates}
            onChange={(val) => set("auto_issue_certificates", val)}
            label={t.eventForm.autoIssue}
            hint={t.eventForm.autoIssueHint}
            disabled={!v.certificates_enabled}
          />
        </div>
      </Section>

      <Section title={t.eventForm.registrationSection}>
        <div className="grid gap-5 md:grid-cols-3">
          <Field label={t.eventForm.status} hint={t.eventForm.statusHint} htmlFor="ev-status">
            <Select id="ev-status" value={v.status} onChange={(e) => set("status", e.target.value as EventStatus)}>
              {(["draft", "published", "closed", "archived"] as const).map((s) => (
                <option key={s} value={s}>
                  {t.eventStatus[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t.eventForm.capacity} optional hint={t.eventForm.capacityHint} htmlFor="ev-capacity">
            <Input
              id="ev-capacity"
              type="number"
              min={1}
              dir="ltr"
              value={v.capacity}
              onChange={(e) => set("capacity", e.target.value)}
            />
          </Field>
          <Field label={t.eventForm.closesAt} optional htmlFor="ev-closes">
            <Input
              id="ev-closes"
              type="datetime-local"
              dir="ltr"
              value={v.registration_closes_at}
              onChange={(e) => set("registration_closes_at", e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-5">
          <Switch checked={v.registration_open} onChange={(val) => set("registration_open", val)} label={t.eventForm.registrationOpen} />
        </div>
        <div className="mt-6">
          <div className="text-[13px] font-bold text-ink-900">{t.eventForm.accent}</div>
          <div className="mt-2 flex flex-wrap gap-2.5" role="radiogroup">
            {(Object.keys(ACCENTS) as Accent[]).map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={v.accent === a}
                aria-label={a}
                onClick={() => set("accent", a)}
                className={cn(
                  "grid size-10 place-items-center rounded-full ring-offset-2 transition-shadow",
                  v.accent === a ? "ring-2 ring-navy" : "hover:ring-2 hover:ring-ink-200",
                )}
                style={{ background: ACCENTS[a].mid }}
              >
                {v.accent === a && <Icon name="check" size={18} className="text-white" />}
              </button>
            ))}
          </div>
        </div>
      </Section>

      {formError && (
        <p className="flex items-start gap-2 rounded-xl bg-danger-tint p-4 text-[14px] font-medium text-danger" role="alert">
          <Icon name="alert" className="mt-0.5 shrink-0" />
          {formError}
        </p>
      )}
      <div className="sticky bottom-0 -mx-4 flex justify-end border-t border-hairline bg-white/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:shadow-card">
        <Button type="submit" size="lg" loading={busy} className="min-w-44">
          {busy ? t.common.saving : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card className="p-6">
      <h2 className="text-[16px] font-extrabold">{title}</h2>
      {subtitle && <p className="mt-1 max-w-3xl text-[13px] text-ink-500">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </Card>
  );
}
