"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import useSWR from "swr";

import { CameraView } from "@/components/camera-view";
import { useEventCtx } from "@/components/event-context";
import { Icon, type IconName } from "@/components/icons";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Segmented, cn, errorMessage } from "@/components/ui";
import { WalkinModal } from "@/components/walkin-modal";
import { ApiError, api, fetcher } from "@/lib/api";
import { fmtDuration, fmtTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { EventStats, RecentScan, ScanResult } from "@/lib/types";

type Mode = "auto" | "in" | "out";
type Shown = ScanResult | { result: "offline" };
type Queued = { id: string; code: string; mode: Mode; client_ts: string };
type Kind = "in" | "out" | "warn" | "bad" | "badge";

const WARN = new Set(["duplicate", "already_in", "not_in", "offline"]);

function kindOf(result: string): Kind {
  if (result === "checked_in") return "in";
  if (result === "checked_out") return "out";
  if (result === "sponsor_badge") return "badge";
  return WARN.has(result) ? "warn" : "bad";
}

function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readQueue(key: string): Queued[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Queued[]) : [];
  } catch {
    return [];
  }
}

export default function ScannerPage() {
  const { event } = useEventCtx();
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const tz = event.timezone;

  const [mode, setMode] = useState<Mode>("auto");
  const [shown, setShown] = useState<Shown | null>(null);
  const [busy, setBusy] = useState(false);
  const [sound, setSound] = useState(true);
  const [manual, setManual] = useState("");
  // Scans that couldn't reach the server are kept on the device and retried.
  const storageKey = `mce_scan_queue_${event.id}`;
  const [queue, setQueue] = useState<Queued[]>(() => readQueue(storageKey));
  const [online, setOnline] = useState(true);
  const [cameraRunning, setCameraRunning] = useState(false);
  const [walkinOpen, setWalkinOpen] = useState(false);

  const modeRef = useRef(mode);
  const soundRef = useRef(sound);
  const busyRef = useRef(false);
  const queueRef = useRef<Queued[]>(queue);
  const lastRef = useRef<{ code: string; at: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const audioRef = useRef<AudioContext | null>(null);
  const flushing = useRef(false);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  const { data: stats, mutate: refreshStats } = useSWR<EventStats>(`/events/${event.id}/stats`, fetcher, {
    refreshInterval: 10000,
  });
  const { data: recent, mutate: refreshRecent } = useSWR<RecentScan[]>(
    `/events/${event.id}/scans/recent?limit=15`,
    fetcher,
    { refreshInterval: 8000 },
  );

  const saveQueue = useCallback(
    (items: Queued[]) => {
      queueRef.current = items;
      setQueue(items);
      try {
        localStorage.setItem(storageKey, JSON.stringify(items));
      } catch {
        // storage full or blocked; the queue still lives in memory
      }
    },
    [storageKey],
  );
  const feedback = useCallback((kind: Kind) => {
    navigator.vibrate?.(kind === "in" || kind === "out" || kind === "badge" ? 80 : [70, 60, 70]);
    const ctx = audioRef.current;
    if (!soundRef.current || !ctx) return;
    const tones = kind === "in" || kind === "badge" ? [880, 1320] : kind === "out" ? [1100, 740] : kind === "warn" ? [520, 520] : [240, 180];
    tones.forEach((freq, i) => {
      const start = ctx.currentTime + i * 0.13;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === "bad" ? "square" : "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.12);
    });
  }, []);

  const show = useCallback(
    (s: Shown) => {
      setShown(s);
      const kind = kindOf(s.result);
      feedback(kind);
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setShown(null), kind === "in" || kind === "out" || kind === "badge" ? 3000 : 4500);
    },
    [feedback],
  );

  const post = useCallback(
    (item: Queued) =>
      api<ScanResult>(`/events/${event.id}/scan`, {
        method: "POST",
        body: { code: item.code, mode: item.mode, client_ts: item.client_ts, device: navigator.userAgent.slice(0, 150) },
      }),
    [event.id],
  );

  const submit = useCallback(
    async (code: string, modeOverride?: Mode) => {
      if (busyRef.current || !code.trim()) return;
      busyRef.current = true;
      setBusy(true);
      const item: Queued = { id: uid(), code: code.trim(), mode: modeOverride ?? modeRef.current, client_ts: new Date().toISOString() };
      try {
        show(await post(item));
        void refreshRecent();
        void refreshStats();
      } catch (err) {
        if (err instanceof ApiError && err.code === "network") {
          saveQueue([...queueRef.current, item]);
          setOnline(false);
          show({ result: "offline" });
        } else if (err instanceof ApiError && err.status === 401) {
          router.replace(`/login?next=/admin/events/${event.id}/scanner`);
        } else {
          toast(errorMessage(err, t, locale), "error");
        }
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [post, show, refreshRecent, refreshStats, saveQueue, router, event.id, toast, t, locale],
  );

  const onCode = useCallback(
    (code: string) => {
      // The camera reads the same code many times a second; ignore repeats for a few seconds.
      const now = Date.now();
      const last = lastRef.current;
      if (last && last.code === code && now - last.at < 4000) return;
      lastRef.current = { code, at: now };
      void submit(code);
    },
    [submit],
  );

  const flush = useCallback(async () => {
    if (flushing.current || queueRef.current.length === 0) return;
    flushing.current = true;
    const pending = [...queueRef.current];
    const keep: Queued[] = [];
    let synced = 0;
    for (let i = 0; i < pending.length; i++) {
      try {
        await post(pending[i]);
        synced++;
      } catch (err) {
        if (err instanceof ApiError && err.code === "network") {
          keep.push(...pending.slice(i));
          break;
        }
        // Rejected by the server (e.g. signed out or invalid): drop it rather than retry forever.
      }
    }
    saveQueue(keep);
    setOnline(keep.length === 0);
    flushing.current = false;
    if (synced) {
      toast(t.scanner.synced(synced));
      void refreshRecent();
      void refreshStats();
    }
  }, [post, saveQueue, toast, t, refreshRecent, refreshStats]);

  useEffect(() => {
    const up = () => {
      setOnline(true);
      void flush();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const timer = setInterval(() => void flush(), 5000);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      clearInterval(timer);
    };
  }, [flush]);

  function unlockAudio() {
    // Browsers only allow sound after a tap, so create the audio context from the Start button.
    if (!audioRef.current) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) audioRef.current = new Ctx();
    }
    void audioRef.current?.resume();
  }

  function submitManual(e: FormEvent) {
    e.preventDefault();
    unlockAudio();
    void submit(manual);
    setManual("");
  }

  const resultCard = shown && <ResultCard shown={shown} tz={tz} onDismiss={() => setShown(null)} />;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid content-start gap-4">
        <Card className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented
              value={mode}
              onChange={setMode}
              className="w-full sm:w-auto"
              options={[
                { value: "auto", label: t.scanner.auto },
                { value: "in", label: t.scanner.in },
                { value: "out", label: t.scanner.out },
              ]}
            />
            <div className="flex items-center gap-2">
              {!online && (
                <Badge tone="warning">
                  <Icon name="wifiOff" size={13} />
                  {t.scanner.offline}
                </Badge>
              )}
              {queue.length > 0 && <Badge tone="warning">{t.scanner.pending(queue.length)}</Badge>}
              <Button
                variant="ghost"
                size="sm"
                icon={sound ? "volume" : "mute"}
                onClick={() => setSound((s) => !s)}
                aria-pressed={sound}
                aria-label={t.scanner.sound}
              />
            </div>
          </div>
          <p className="mt-2 text-[12.5px] text-ink-500">{t.scanner.modeHelp}</p>

          <div className="mt-4">
            <CameraView onCode={onCode} onRunningChange={setCameraRunning} onBeforeStart={unlockAudio} overlay={cameraRunning ? resultCard : null} />
          </div>

          {!cameraRunning && resultCard && <div className="mt-4">{resultCard}</div>}

          <form onSubmit={submitManual} className="mt-5">
            <label htmlFor="manual-code" className="text-[13px] font-bold text-ink-900">
              {t.scanner.manual}
            </label>
            <div className="mt-1.5 flex gap-2">
              <Input
                id="manual-code"
                dir="ltr"
                autoComplete="off"
                autoCapitalize="characters"
                placeholder={t.scanner.manualPlaceholder}
                value={manual}
                onChange={(e) => setManual(e.target.value)}
              />
              <Button type="submit" loading={busy} disabled={!manual.trim()}>
                {t.scanner.submit}
              </Button>
            </div>
          </form>
        </Card>
      </div>

      <div className="grid content-start gap-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            [t.scanner.insideNow, stats?.totals.inside, "text-brand-teal"],
            [t.scanner.arrived, stats?.totals.arrived, "text-navy"],
            [t.scanner.registered, stats?.totals.registered, "text-ink-700"],
          ].map(([label, value, color]) => (
            <Card key={String(label)} className="px-3 py-3.5 text-center">
              <div className={cn("num text-[24px] font-extrabold leading-none", String(color))}>{value ?? "–"}</div>
              <div className="mt-1.5 text-[11.5px] font-bold text-ink-500">{label}</div>
            </Card>
          ))}
        </div>
        <Button variant="secondary" icon="plus" onClick={() => setWalkinOpen(true)}>
          {t.attendees.addWalkin}
        </Button>
        <Card className="overflow-hidden">
          <CardHeader title={t.scanner.recent} />
          {!recent || recent.length === 0 ? (
            <EmptyState icon="scan" title={t.dash.noScans} />
          ) : (
            <ul className="mt-3 max-h-[520px] divide-y divide-hairline overflow-y-auto">
              {recent.map((s) => (
                <li key={s.id} className={cn("flex items-center gap-3 px-5 py-2.5", s.voided && "opacity-40")}>
                  <Icon
                    name={s.direction === "in" ? "arrowIn" : "arrowOut"}
                    size={17}
                    className={s.direction === "in" ? "text-brand-teal" : "text-navy"}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-bold text-ink-900">{s.registration.full_name}</div>
                    <div className="num text-[11.5px] text-ink-500">{s.registration.ticket_code}</div>
                  </div>
                  <span className="num text-[12px] font-bold text-ink-500">{fmtTime(s.scanned_at, tz, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <WalkinModal
        eventId={event.id}
        open={walkinOpen}
        onClose={() => setWalkinOpen(false)}
        onCreated={(reg) => {
          setWalkinOpen(false);
          unlockAudio();
          void submit(reg.ticket_code, "in");
        }}
      />
    </div>
  );
}

function ResultCard({ shown, tz, onDismiss }: { shown: Shown; tz: string; onDismiss: () => void }) {
  const { t, locale } = useI18n();
  const kind = kindOf(shown.result);
  const s = shown.result === "offline" ? null : (shown as ScanResult);
  const styles: Record<Kind, string> = {
    in: "bg-success text-white",
    out: "bg-navy text-white",
    warn: "bg-warning-strong text-midnight",
    bad: "bg-danger text-white",
    badge: "bg-[#53326f] text-white",
  };
  const icons: Record<Kind, IconName> = {
    in: "arrowIn",
    out: "arrowOut",
    warn: shown.result === "offline" ? "wifiOff" : "alert",
    bad: "x",
    badge: "team",
  };
  return (
    <button
      type="button"
      onClick={onDismiss}
      className={cn("flex w-full animate-pop flex-col items-center justify-center gap-2 rounded-2xl p-6 text-center shadow-overlay", styles[kind])}
    >
      <span className="grid size-14 place-items-center rounded-full bg-white/20">
        <Icon name={icons[kind]} size={30} />
      </span>
      <span className="text-[22px] font-extrabold leading-tight">
        {shown.result === "offline" ? t.scanner.savedOffline : t.scanner.results[shown.result]}
      </span>
      {s?.registration && <span className="text-[18px] font-bold">{s.registration.full_name}</span>}
      {s?.sponsor && (
        <>
          <span className="text-[18px] font-bold">{s.sponsor.member_name}</span>
          <span className="text-[13px] opacity-90">
            {t.sponsors.badgeResult(s.sponsor.company_name)} · {t.sponsors.tiers[s.sponsor.tier]}
            {s.sponsor.booth_number && ` · ${t.sponsors.booth} ${s.sponsor.booth_number}`}
          </span>
        </>
      )}
      {s?.registration && (
        <span className="num text-[13px] opacity-80">
          {s.registration.ticket_code}
          {s.scan && ` · ${fmtTime(s.scan.scanned_at, tz, locale)}`}
        </span>
      )}
      {s?.attendance && s.attendance.status !== "not_arrived" && (
        <span className="mt-1 rounded-full bg-white/20 px-3 py-1 text-[13px] font-bold">
          {t.scanner.attended(fmtDuration(s.attendance.attended_minutes, locale), s.attendance.percent)}
          {s.attendance.eligible && ` · ${t.scanner.eligibleNow}`}
        </span>
      )}
      {s?.certificate_issued && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[13px] font-extrabold text-success">
          <Icon name="award" size={15} />
          {s.certificate_emailed ? t.scanner.certEmailed : t.scanner.certIssued}
        </span>
      )}
      {s?.result === "wrong_event" && s.other_event && <span className="text-[14px]">{t.scanner.wrongEvent(s.other_event)}</span>}
      {s && t.scanner.resultHelp[s.result] && <span className="max-w-xs text-[13px] opacity-90">{t.scanner.resultHelp[s.result]}</span>}
      <span className="mt-1 text-[11px] font-bold opacity-70">{t.scanner.tapToDismiss}</span>
    </button>
  );
}
