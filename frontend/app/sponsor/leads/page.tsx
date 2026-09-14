"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";

import { Icon } from "@/components/icons";
import { LeadCard } from "@/components/lead-card";
import { useSponsor } from "@/components/sponsor-shell";
import { Card, EmptyState, ErrorBox, Input, PageHeader, Pagination, Skeleton, cn } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { SponsorLead } from "@/lib/types";

const FILTERS = ["", "booth_qr", "badge_scan", "with_contact"] as const;
const PAGE_SIZE = 30;

type List = { items: SponsorLead[]; total: number; page: number; page_size: number; counts: Record<string, number> };

export default function SponsorLeadsPage() {
  const { me } = useSponsor();
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState<(typeof FILTERS)[number]>("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const params = new URLSearchParams({ q: query, method, page: String(page), page_size: String(PAGE_SIZE) });
  const { data, error, mutate } = useSWR<List>(`/sponsor/leads?${params}`, fetcher, { refreshInterval: 15000, keepPreviousData: true });
  const labels: Record<string, string> = {
    "": t.sponsors.portal.filterAll,
    booth_qr: t.sponsors.portal.filterBooth,
    badge_scan: t.sponsors.portal.filterBadge,
    with_contact: t.sponsors.portal.filterContact,
  };
  const countKey: Record<string, string> = { "": "all", booth_qr: "booth_qr", badge_scan: "badge_scan", with_contact: "with_contact" };

  return (
    <>
      <PageHeader
        title={t.sponsors.portal.leads}
        actions={
          <a
            href="/api/sponsor/leads/export.xlsx"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 text-[14px] font-bold text-navy hover:bg-tint"
          >
            <Icon name="download" size={17} />
            {t.sponsors.portal.exportLeads}
          </a>
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Icon name="search" size={17} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
          <Input className="ps-10" placeholder={t.sponsors.portal.searchLeads} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => {
                setMethod(f);
                setPage(1);
              }}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors",
                method === f ? "border-navy bg-navy text-white" : "border-ink-200 bg-white text-ink-700 hover:border-navy/40",
              )}
            >
              {labels[f]}
              <span className={cn("num rounded-full px-1.5 text-[11.5px]", method === f ? "bg-white/20" : "bg-ink-100")}>{data?.counts[countKey[f]] ?? "·"}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {error && !data ? (
          <ErrorBox error={error} onRetry={() => mutate()} />
        ) : !data ? (
          <div className="grid gap-3">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : data.items.length === 0 ? (
          <Card>
            <EmptyState icon="users" title={t.sponsors.portal.noLeads} />
          </Card>
        ) : (
          <>
            <ul className="grid gap-3">
              {data.items.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  tz={me.event.timezone}
                  onChange={(updated) => mutate({ ...data, items: data.items.map((l) => (l.id === updated.id ? updated : l)) }, false)}
                />
              ))}
            </ul>
            <Card className="mt-3">
              <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
            </Card>
          </>
        )}
      </div>
    </>
  );
}
