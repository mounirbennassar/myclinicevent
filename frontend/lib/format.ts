import type { Accent, EventSession, Locale } from "./types";

// Arabic UI uses the Gregorian calendar with Latin digits, like the rest of the My Clinic material.
const intl = (locale: Locale) => (locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB");

export function fmtDate(iso: string, tz: string, locale: Locale, opts?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(intl(locale), {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...opts,
  }).format(new Date(iso));
}

/** Format a local calendar date ("2026-11-12") without any timezone shift. */
export function fmtLocalDate(date: string, locale: Locale, opts?: Intl.DateTimeFormatOptions): string {
  return fmtDate(`${date}T12:00:00Z`, "UTC", locale, opts);
}

export function fmtTime(iso: string, tz: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intl(locale), {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function fmtDateTime(iso: string, tz: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intl(locale), {
    timeZone: tz,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function fmtNumber(n: number, locale: Locale): string {
  return new Intl.NumberFormat(intl(locale)).format(n);
}

export function fmtDuration(minutes: number, locale: Locale): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (locale === "ar") return h ? `${h} س ${m} د` : `${m} د`;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export function fmtRelative(iso: string, locale: Locale, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(intl(locale), { numeric: "auto" });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(seconds, "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  return rtf.format(Math.round(seconds / 86400), "day");
}

/** "Thu, 12 November 2026" or "12–13 November 2026" for multi-day events. */
export function eventDateLabel(sessions: EventSession[], locale: Locale): string {
  const dates = [...new Set(sessions.map((s) => s.date))].sort();
  if (dates.length === 0) return "";
  if (dates.length === 1) return fmtLocalDate(dates[0], locale);
  const first = fmtLocalDate(dates[0], locale, { weekday: undefined });
  const last = fmtLocalDate(dates[dates.length - 1], locale, { weekday: undefined });
  return `${first} – ${last}`;
}

/** "08:00–12:00 · 13:00–16:00" for one day's sessions. */
export function sessionTimesLabel(sessions: EventSession[], date?: string): string {
  return sessions
    .filter((s) => !date || s.date === date)
    .map((s) => `${s.start}–${s.end}`)
    .join(" · ");
}

export const ACCENTS: Record<Accent, { strong: string; mid: string; soft: string; tint: string }> = {
  teal: { strong: "#007d79", mid: "#05b8b5", soft: "#56dbdb", tint: "#d2fbfb" },
  turquoise: { strong: "#018786", mid: "#02aead", soft: "#6ed4d3", tint: "#dff5f5" },
  purple: { strong: "#53326f", mid: "#68408f", soft: "#b79fd1", tint: "#f0eaf6" },
  fuchsia: { strong: "#9f1853", mid: "#d02670", soft: "#faa6c9", tint: "#fcecf4" },
  navy: { strong: "#003868", mid: "#004d99", soft: "#8fb3d9", tint: "#e3edf7" },
  apple: { strong: "#5b771d", mid: "#759526", soft: "#aecd72", tint: "#e2edd1" },
  orange: { strong: "#b72900", mid: "#db3907", soft: "#f1ad71", tint: "#fbeacf" },
};

function tzOffsetMinutes(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** "2026-11-12T08:30" as wall-clock time in `tz` → ISO instant. */
export function zonedLocalToIso(local: string, tz: string): string {
  const naive = new Date(`${local.length === 16 ? `${local}:00` : local}Z`);
  return new Date(naive.getTime() - tzOffsetMinutes(naive, tz) * 60000).toISOString();
}

/** ISO instant → "2026-11-12T08:30" wall-clock time in `tz` (for datetime-local inputs). */
export function isoToZonedLocal(iso: string, tz: string): string {
  const d = new Date(iso);
  const local = new Date(d.getTime() + tzOffsetMinutes(d, tz) * 60000);
  return local.toISOString().slice(0, 16);
}

/** The Arabic variant of a field when viewing in Arabic and it exists, else English. */
export function pickText(locale: Locale, en: string | null | undefined, ar: string | null | undefined): string {
  return locale === "ar" && ar ? ar : en ?? "";
}

export function initials(name: string): string {
  const parts = name.replace(/^(dr\.?|د\.?)\s+/i, "").trim().split(/\s+/);
  return (parts[0]?.[0] ?? "").toUpperCase();
}
