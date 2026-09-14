"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { useEventCtx } from "@/components/event-context";
import { useToast } from "@/components/toast";
import { Avatar, Button, Card, CardHeader, EmptyState, ErrorBox, Select, Skeleton, errorMessage } from "@/components/ui";
import { api, fetcher } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { TeamMember, TeamRole, User } from "@/lib/types";

export default function TeamPage() {
  const { event, isAdmin } = useEventCtx();
  const { t, locale } = useI18n();
  const toast = useToast();
  const { data: team, error, mutate } = useSWR<TeamMember[]>(`/events/${event.id}/team`, fetcher);
  const { data: users } = useSWR<User[]>(isAdmin ? "/users" : null, fetcher);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<TeamRole>("scanner");
  const [busy, setBusy] = useState(false);

  const assigned = new Set(team?.map((m) => m.user.id));
  const available = (users ?? []).filter((u) => u.role === "staff" && u.is_active && !assigned.has(u.id));

  async function assign(id: number, newRole: TeamRole) {
    setBusy(true);
    try {
      await api(`/events/${event.id}/team/${id}`, { method: "PUT", body: { role: newRole } });
      toast(t.team.saved);
      setUserId("");
      await mutate();
    } catch (err) {
      toast(errorMessage(err, t, locale), "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    try {
      await api(`/events/${event.id}/team/${id}`, { method: "DELETE" });
      toast(t.team.removed);
      await mutate();
    } catch (err) {
      toast(errorMessage(err, t, locale), "error");
    }
  }

  return (
    <div className="grid gap-5">
      <p className="max-w-3xl text-[14px] text-ink-500">{t.team.intro}</p>

      {isAdmin && (
        <Card className="p-5">
          <h3 className="text-[15px] font-extrabold">{t.team.add}</h3>
          {users && available.length === 0 ? (
            <p className="mt-2 text-[13.5px] text-ink-500">
              {t.team.noStaff}{" "}
              <Link href="/admin/users" className="font-bold text-action hover:underline">
                {t.team.manageUsers}
              </Link>
            </p>
          ) : (
            <div className="mt-3 grid gap-2.5 sm:grid-cols-[1fr_200px_auto]">
              <Select value={userId} onChange={(e) => setUserId(e.target.value)} aria-label={t.team.member}>
                <option value="">{t.team.choose}</option>
                {available.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} · {u.email}
                  </option>
                ))}
              </Select>
              <Select value={role} onChange={(e) => setRole(e.target.value as TeamRole)} aria-label={t.team.role}>
                <option value="scanner">{t.roles.scanner}</option>
                <option value="manager">{t.roles.manager}</option>
              </Select>
              <Button icon="plus" loading={busy} disabled={!userId} onClick={() => assign(Number(userId), role)}>
                {t.team.add}
              </Button>
            </div>
          )}
          <p className="mt-2.5 text-[12.5px] text-ink-500">
            <strong>{t.roles.scanner}:</strong> {t.roleHelp.scanner} <strong className="ms-2">{t.roles.manager}:</strong>{" "}
            {t.roleHelp.manager}
          </p>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader title={t.team.title} />
        {error ? (
          <div className="p-5">
            <ErrorBox error={error} onRetry={() => mutate()} />
          </div>
        ) : !team ? (
          <div className="grid gap-2 p-5">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : team.length === 0 ? (
          <EmptyState icon="team" title={t.team.empty} />
        ) : (
          <ul className="mt-3 divide-y divide-hairline">
            {team.map((m) => (
              <li key={m.user.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5">
                <Avatar name={m.user.full_name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-bold text-ink-900">{m.user.full_name}</div>
                  <div className="text-[12.5px] text-ink-500">
                    {m.user.email} · {t.team.added} {fmtDate(m.added_at, event.timezone, locale, { weekday: undefined })}
                  </div>
                </div>
                {isAdmin ? (
                  <>
                    <div className="w-44">
                      <Select value={m.role} onChange={(e) => assign(m.user.id, e.target.value as TeamRole)} aria-label={t.team.role}>
                        <option value="scanner">{t.roles.scanner}</option>
                        <option value="manager">{t.roles.manager}</option>
                      </Select>
                    </div>
                    <Button variant="ghost" size="sm" icon="trash" className="text-danger" onClick={() => remove(m.user.id)}>
                      {t.common.remove}
                    </Button>
                  </>
                ) : (
                  <span className="text-[13px] font-bold text-navy">{t.roles[m.role]}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
