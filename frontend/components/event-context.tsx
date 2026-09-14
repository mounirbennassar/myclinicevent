"use client";

import { createContext, useContext, type ReactNode } from "react";

import { useI18n } from "@/lib/i18n";
import type { AdminEvent, EventStatus } from "@/lib/types";

import { Badge, type Tone } from "./ui";

interface EventCtx {
  event: AdminEvent;
  refresh: () => void;
  /** Event manager (admins always are). */
  isManager: boolean;
  /** Admin or super admin: can assign teams and create events. */
  isAdmin: boolean;
}

const EventContext = createContext<EventCtx | null>(null);

export function EventProvider({ value, children }: { value: EventCtx; children: ReactNode }) {
  return <EventContext.Provider value={value}>{children}</EventContext.Provider>;
}

export function useEventCtx(): EventCtx {
  const ctx = useContext(EventContext);
  if (!ctx) throw new Error("useEventCtx must be used inside an event page");
  return ctx;
}

export function eventPhase(event: { starts_at: string; ends_at: string }, now = Date.now()): "live" | "upcoming" | "past" {
  const start = new Date(event.starts_at).getTime();
  const end = new Date(event.ends_at).getTime();
  return now < start ? "upcoming" : now < end ? "live" : "past";
}

const STATUS_TONES: Record<EventStatus, Tone> = {
  draft: "neutral",
  published: "success",
  closed: "navy",
  archived: "neutral",
};

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const { t } = useI18n();
  return <Badge tone={STATUS_TONES[status]}>{t.eventStatus[status]}</Badge>;
}

export function PhaseBadge({ event }: { event: { starts_at: string; ends_at: string } }) {
  const { t } = useI18n();
  const phase = eventPhase(event);
  if (phase === "live")
    return (
      <Badge tone="teal" dot pulse>
        {t.phase.live}
      </Badge>
    );
  return <Badge tone={phase === "upcoming" ? "info" : "neutral"}>{t.phase[phase]}</Badge>;
}
