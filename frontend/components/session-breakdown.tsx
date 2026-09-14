"use client";

import { fmtDuration, fmtLocalDate, fmtTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { EventSession, SessionAttendance } from "@/lib/types";

import { Progress, cn } from "./ui";

/** Per-session attendance bars. Highlights whether each session's threshold was met. */
export function SessionBreakdown({
  sessions,
  eventSessions,
  threshold,
  tz,
  compact,
}: {
  sessions: SessionAttendance[];
  eventSessions: EventSession[];
  threshold: number;
  tz: string;
  compact?: boolean;
}) {
  const { t, locale, pick } = useI18n();
  const days = new Set(eventSessions.map((s) => s.date));
  return (
    <ul className={cn("grid", compact ? "gap-2" : "gap-3")}>
      {sessions.map((s) => {
        const meta = eventSessions[s.index];
        const label = meta && (pick(meta.title, meta.title_ar) || t.dash.sessionN(s.index + 1));
        return (
          <li key={s.index}>
            <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="min-w-0 truncate font-bold text-ink-900">
                {label ?? t.dash.sessionN(s.index + 1)}
                <span className="num ms-2 font-medium text-ink-500">
                  {meta && days.size > 1 && `${fmtLocalDate(meta.date, locale, { year: undefined, month: "short" })} · `}
                  {fmtTime(s.start, tz, locale)}–{fmtTime(s.end, tz, locale)}
                </span>
              </span>
              <span className={cn("num shrink-0 font-extrabold", s.met ? "text-success" : "text-ink-700")}>
                {s.percent}%
                {!compact && (
                  <span className="ms-1.5 font-medium text-ink-500">{fmtDuration(s.attended_minutes, locale)}</span>
                )}
              </span>
            </div>
            <Progress value={s.percent} threshold={threshold} className="mt-1.5" />
          </li>
        );
      })}
    </ul>
  );
}
