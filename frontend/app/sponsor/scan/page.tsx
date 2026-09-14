"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";

import { CameraView } from "@/components/camera-view";
import { Icon } from "@/components/icons";
import { LeadCard } from "@/components/lead-card";
import { useSponsor } from "@/components/sponsor-shell";
import { useToast } from "@/components/toast";
import { Button, Card, Input, PageHeader, cn, errorMessage } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { SponsorLead } from "@/lib/types";

type Outcome = { result: "captured" | "already" | "invalid" | "wrong_event"; lead: SponsorLead | null };

export default function SponsorScanPage() {
  const { me, refresh } = useSponsor();
  const { t, locale } = useI18n();
  const toast = useToast();
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [recent, setRecent] = useState<SponsorLead[]>([]);
  const busyRef = useRef(false);
  const lastRef = useRef<{ code: string; at: number } | null>(null);

  const submit = useCallback(
    async (code: string) => {
      if (busyRef.current || !code.trim()) return;
      busyRef.current = true;
      setBusy(true);
      try {
        const res = await api<Outcome>("/sponsor/leads/scan", { method: "POST", body: { code: code.trim() } });
        setOutcome(res);
        if (res.lead && res.result === "captured") {
          setRecent((list) => [res.lead!, ...list.filter((l) => l.id !== res.lead!.id)].slice(0, 10));
          refresh();
        }
        navigator.vibrate?.(res.result === "captured" ? 80 : [70, 60, 70]);
      } catch (err) {
        toast(errorMessage(err, t, locale), "error");
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [refresh, toast, t, locale],
  );

  const onCode = useCallback(
    (code: string) => {
      const now = Date.now();
      if (lastRef.current && lastRef.current.code === code && now - lastRef.current.at < 4000) return;
      lastRef.current = { code, at: now };
      void submit(code);
    },
    [submit],
  );

  const labels: Record<Outcome["result"], string> = {
    captured: t.sponsors.portal.scanCaptured,
    already: t.sponsors.portal.scanAlready,
    invalid: t.sponsors.portal.scanInvalid,
    wrong_event: t.sponsors.portal.scanWrongEvent,
  };

  return (
    <>
      <PageHeader title={t.sponsors.portal.scanTitle} subtitle={t.sponsors.portal.scanIntro} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="p-4 sm:p-5">
          <CameraView onCode={onCode} />
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void submit(manual);
              setManual("");
            }}
            className="mt-5 flex gap-2"
          >
            <Input dir="ltr" autoComplete="off" placeholder={t.scanner.manualPlaceholder} value={manual} onChange={(e) => setManual(e.target.value)} aria-label={t.scanner.manual} />
            <Button type="submit" loading={busy} disabled={!manual.trim()}>
              {t.scanner.submit}
            </Button>
          </form>
        </Card>

        <div className="grid content-start gap-4">
          {outcome && (
            <div
              className={cn(
                "flex animate-pop items-center gap-3 rounded-2xl p-4 text-white",
                outcome.result === "captured" ? "bg-success" : outcome.result === "already" ? "bg-navy" : "bg-danger",
              )}
            >
              <Icon name={outcome.result === "captured" ? "check" : outcome.result === "already" ? "info" : "x"} size={22} />
              <div>
                <div className="text-[16px] font-extrabold">{labels[outcome.result]}</div>
                {outcome.lead && <div className="text-[13px] opacity-90">{outcome.lead.attendee.full_name}</div>}
              </div>
            </div>
          )}
          {outcome?.lead && (
            <ul className="grid gap-3">
              <LeadCard lead={outcome.lead} tz={me.event.timezone} onChange={(l) => setOutcome({ ...outcome, lead: l })} />
            </ul>
          )}
          {recent.length > 1 && (
            <Card className="p-4">
              <p className="text-[12px] font-bold text-ink-500">{t.scanner.recent}</p>
              <ul className="mt-2 divide-y divide-hairline">
                {recent.slice(1).map((l) => (
                  <li key={l.id} className="flex items-center justify-between py-2 text-[13.5px]">
                    <span className="font-bold text-ink-900">{l.attendee.full_name}</span>
                    <span className="text-[12px] text-ink-500">{l.attendee.profession ? t.professions[l.attendee.profession] : ""}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
