"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAdminUser } from "@/components/admin-shell";
import { useEventCtx } from "@/components/event-context";
import { EventForm } from "@/components/event-form";
import { useToast } from "@/components/toast";
import { Button, Card, Field, Input, errorMessage } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { AdminEvent } from "@/lib/types";

export default function EventSettingsPage() {
  const { event, refresh, isAdmin } = useEventCtx();
  const user = useAdminUser();
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [copyTitle, setCopyTitle] = useState(`${event.title} (copy)`);
  const [shiftDays, setShiftDays] = useState("0");
  const [confirmSlug, setConfirmSlug] = useState("");
  const [busy, setBusy] = useState<"copy" | "delete" | null>(null);

  async function duplicate() {
    setBusy("copy");
    try {
      const copy = await api<AdminEvent>(`/events/${event.id}/duplicate`, {
        method: "POST",
        body: { title: copyTitle.trim() || undefined, shift_days: Number(shiftDays) || 0 },
      });
      toast(t.eventForm.duplicated);
      router.push(`/admin/events/${copy.id}/settings`);
    } catch (err) {
      toast(errorMessage(err, t, locale), "error");
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      await api(`/events/${event.id}`, { method: "DELETE" });
      toast(t.eventForm.deleted);
      router.push("/admin/events");
    } catch (err) {
      toast(errorMessage(err, t, locale), "error");
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <EventForm
        key={event.updated_at}
        initial={event}
        submitLabel={t.common.save}
        onSubmit={async (payload) => {
          await api<AdminEvent>(`/events/${event.id}`, { method: "PATCH", body: payload });
          refresh();
          toast(t.eventForm.saved);
        }}
      />

      {isAdmin && (
        <Card className="p-6">
          <h2 className="text-[16px] font-extrabold">{t.eventForm.dangerZone}</h2>
          <div className="mt-5 grid gap-4 rounded-xl border border-hairline p-4">
            <div>
              <h3 className="text-[14px] font-extrabold">{t.eventForm.duplicate}</h3>
              <p className="mt-0.5 text-[13px] text-ink-500">{t.eventForm.duplicateHint}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
              <Field label={t.eventForm.titleEn} htmlFor="copy-title">
                <Input id="copy-title" value={copyTitle} onChange={(e) => setCopyTitle(e.target.value)} />
              </Field>
              <Field label={t.eventForm.shiftDays} htmlFor="copy-shift">
                <Input id="copy-shift" type="number" dir="ltr" value={shiftDays} onChange={(e) => setShiftDays(e.target.value)} />
              </Field>
              <Button variant="secondary" icon="copy" loading={busy === "copy"} onClick={duplicate}>
                {t.eventForm.duplicate}
              </Button>
            </div>
          </div>

          {user.role === "super_admin" && (
            <div className="mt-4 grid gap-3 rounded-xl border border-danger/25 bg-danger-tint/40 p-4">
              <div>
                <h3 className="text-[14px] font-extrabold text-danger">{t.eventForm.deleteEvent}</h3>
                <p className="mt-0.5 text-[13px] text-ink-700">
                  {t.eventForm.deleteHint} {t.common.cantUndo}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <Field label={t.eventForm.deleteConfirm(event.slug)} htmlFor="confirm-slug">
                  <Input id="confirm-slug" dir="ltr" value={confirmSlug} onChange={(e) => setConfirmSlug(e.target.value)} />
                </Field>
                <Button variant="danger" icon="trash" disabled={confirmSlug !== event.slug} loading={busy === "delete"} onClick={remove}>
                  {t.eventForm.deleteEvent}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
