"use client";

import { useState } from "react";

import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { SponsorLead } from "@/lib/types";

import { Icon } from "./icons";
import { useToast } from "./toast";
import { Avatar, Badge, Button, Textarea, cn, errorMessage } from "./ui";

export function Stars({ value, onChange }: { value: number | null; onChange?: (n: number | null) => void }) {
  return (
    <span className="inline-flex gap-0.5" dir="ltr">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(value === n ? null : n)}
          className={cn("text-[18px] leading-none transition-transform", onChange && "hover:scale-110", (value ?? 0) >= n ? "text-warning-strong" : "text-ink-200")}
          aria-label={`${n}`}
        >
          ★
        </button>
      ))}
    </span>
  );
}

/** One lead with inline rating and note editing. */
export function LeadCard({ lead, tz, onChange }: { lead: SponsorLead; tz: string; onChange: (lead: SponsorLead) => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [note, setNote] = useState(lead.note ?? "");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(body: { rating?: number | null; note?: string }) {
    setBusy(true);
    try {
      onChange(await api<SponsorLead>(`/sponsor/leads/${lead.id}`, { method: "PATCH", body }));
    } catch (err) {
      toast(errorMessage(err, t, locale), "error");
    } finally {
      setBusy(false);
    }
  }

  const a = lead.attendee;
  return (
    <li className="rounded-2xl border border-hairline bg-white p-4">
      <div className="flex items-start gap-3">
        <Avatar name={a.full_name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-extrabold text-ink-900">{a.full_name}</span>
            <Badge tone={lead.method === "booth_qr" ? "teal" : "navy"}>{t.sponsors.portal.methods[lead.method]}</Badge>
          </div>
          <div className="text-[12.5px] text-ink-500">
            {a.profession ? t.professions[a.profession] : ""}
            {a.profession && " · "}
            <span className="num">{fmtDateTime(lead.captured_at, tz, locale)}</span>
            {lead.captured_by && ` · ${t.sponsors.portal.capturedBy(lead.captured_by)}`}
          </div>
          {lead.consent ? (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px]">
              {a.email && (
                <a href={`mailto:${a.email}`} className="inline-flex items-center gap-1.5 text-action hover:underline">
                  <Icon name="mail" size={14} />
                  <span dir="ltr">{a.email}</span>
                </a>
              )}
              {a.mobile && (
                <a href={`tel:${a.mobile}`} className="num inline-flex items-center gap-1.5 text-action hover:underline">
                  <Icon name="phone" size={14} />
                  <span dir="ltr">{a.mobile}</span>
                </a>
              )}
            </div>
          ) : (
            <p className="mt-2 inline-flex items-start gap-1.5 rounded-lg bg-warning-tint px-2.5 py-1.5 text-[12.5px] font-medium text-warning" title={t.sponsors.portal.contactHiddenHint}>
              <Icon name="lock" size={13} className="mt-0.5 shrink-0" />
              {t.sponsors.portal.contactHidden}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Stars value={lead.rating} onChange={(n) => save({ rating: n })} />
          <button onClick={() => setOpen((o) => !o)} className="text-[12.5px] font-bold text-action hover:underline">
            {t.sponsors.portal.note}
            {lead.note && !open && " ✓"}
          </button>
        </div>
      </div>
      {(open || (lead.note && !open)) && (
        <div className="mt-3 border-t border-hairline pt-3">
          {open ? (
            <div className="grid gap-2">
              <Textarea className="min-h-20" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.sponsors.portal.note} />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
                  {t.common.cancel}
                </Button>
                <Button size="sm" loading={busy} onClick={async () => { await save({ note }); setOpen(false); }}>
                  {t.common.save}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-[13.5px] text-ink-700">{lead.note}</p>
          )}
        </div>
      )}
    </li>
  );
}
