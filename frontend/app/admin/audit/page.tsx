"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { useAdminUser } from "@/components/admin-shell";
import { Card, EmptyState, ErrorBox, PageHeader, Pagination, Select, Skeleton } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { AuditItem, Paged } from "@/lib/types";

const GROUPS = ["auth", "event", "registration", "scan", "certificate", "user", "team"];
const PAGE_SIZE = 50;
const TZ = "Asia/Riyadh";

function summarize(details: Record<string, unknown>): string {
  return Object.entries(details)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export default function AuditPage() {
  const me = useAdminUser();
  const { t, locale } = useI18n();
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, mutate } = useSWR<Paged<AuditItem>>(
    me.role === "super_admin" ? `/audit?page=${page}&page_size=${PAGE_SIZE}${action ? `&action=${action}` : ""}` : null,
    fetcher,
    { keepPreviousData: true },
  );

  if (me.role !== "super_admin") {
    return (
      <Card>
        <EmptyState icon="lock" title={t.common.forbidden} />
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title={t.audit.title}
        subtitle={t.audit.intro}
        actions={
          <div className="w-52">
            <Select
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
              aria-label={t.audit.filter}
            >
              <option value="">{t.audit.filter}</option>
              {GROUPS.map((g) => (
                <option key={g} value={g}>
                  {t.audit.groups[g]}
                </option>
              ))}
            </Select>
          </div>
        }
      />
      <Card className="overflow-hidden">
        {error && !data ? (
          <div className="p-5">
            <ErrorBox error={error} onRetry={() => mutate()} />
          </div>
        ) : !data ? (
          <div className="grid gap-2 p-5">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState icon="shield" title={t.audit.empty} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-ink-50 text-[12px] font-bold text-ink-500">
                  <tr>
                    <th className="px-5 py-3 text-start">{t.audit.when}</th>
                    <th className="px-3 py-3 text-start">{t.audit.who}</th>
                    <th className="px-3 py-3 text-start">{t.audit.action}</th>
                    <th className="px-3 py-3 text-start">{t.audit.target}</th>
                    <th className="px-5 py-3 text-start">{t.audit.details}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {data.items.map((item) => (
                    <tr key={item.id} className="align-top">
                      <td className="num whitespace-nowrap px-5 py-3 text-ink-700">{fmtDateTime(item.created_at, TZ, locale)}</td>
                      <td className="px-3 py-3">
                        {item.actor ? (
                          <>
                            <div className="font-bold text-ink-900">{item.actor.full_name}</div>
                            <div className="text-[11.5px] text-ink-500">{item.actor.email}</div>
                          </>
                        ) : (
                          <span className="text-ink-500">{t.audit.system}</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <code className="num rounded bg-ink-100 px-1.5 py-0.5 text-[12px] font-bold text-navy">{item.action}</code>
                      </td>
                      <td className="num whitespace-nowrap px-3 py-3 text-ink-700">
                        {item.entity_type}
                        {item.entity_id && ` #${item.entity_id}`}
                        {item.event_id && (
                          <Link href={`/admin/events/${item.event_id}`} className="ms-2 text-action hover:underline">
                            ↗
                          </Link>
                        )}
                      </td>
                      <td className="num max-w-md break-words px-5 py-3 text-[12px] text-ink-500">
                        {summarize(item.details)}
                        {item.ip && <span className="block text-ink-300">{item.ip}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
