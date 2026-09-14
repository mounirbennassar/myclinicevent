"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAdminUser } from "@/components/admin-shell";
import { EventForm } from "@/components/event-form";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";
import { isAdminRole } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { AdminEvent } from "@/lib/types";

export default function NewEventPage() {
  const { t } = useI18n();
  const user = useAdminUser();
  const router = useRouter();
  const toast = useToast();

  if (!isAdminRole(user)) {
    return (
      <Card>
        <EmptyState icon="lock" title={t.common.forbidden} />
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/events" className="inline-flex items-center gap-1 text-[13px] font-bold text-ink-500 hover:text-navy">
        <Icon name="chevronLeft" size={15} className="rtl:rotate-180" />
        {t.nav.events}
      </Link>
      <div className="mt-2">
        <PageHeader title={t.eventForm.createTitle} />
      </div>
      <EventForm
        submitLabel={t.eventForm.create}
        onSubmit={async (payload) => {
          const event = await api<AdminEvent>("/events", { method: "POST", body: payload });
          toast(t.eventForm.created);
          router.push(`/admin/events/${event.id}/share`);
        }}
      />
    </div>
  );
}
