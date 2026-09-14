"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";

import { ATT_TONES, AttendeeDrawer } from "@/components/attendee-drawer";
import { useEventCtx } from "@/components/event-context";
import { Icon } from "@/components/icons";
import { ImportModal } from "@/components/import-modal";
import { Avatar, Badge, Card, EmptyState, ErrorBox, Input, Pagination, Progress, Select, Skeleton, cn, Button } from "@/components/ui";
import { WalkinModal } from "@/components/walkin-modal";
import { fetcher } from "@/lib/api";
import { fmtDuration, fmtTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { RegistrationList } from "@/lib/types";

const FILTERS = ["all", "inside", "checked_out", "not_arrived", "no_checkout", "eligible", "not_eligible", "cancelled"] as const;
const PAGE_SIZE = 50;

export default function AttendeesPage() {
  const { event, isManager } = useEventCtx();
  const { t, locale } = useI18n();
  const tz = event.timezone;
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("all");
  const [source, setSource] = useState("");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [walkinOpen, setWalkinOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const params = new URLSearchParams({ q: query, status, source, sort, page: String(page), page_size: String(PAGE_SIZE) });
  const { data, error, mutate } = useSWR<RegistrationList>(`/events/${event.id}/registrations?${params}`, fetcher, {
    refreshInterval: 10000,
    keepPreviousData: true,
  });

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Icon name="search" size={17} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
          <Input className="ps-10" placeholder={t.attendees.searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t.common.search} />
        </div>
        <div className="w-44">
          <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label={t.attendees.sort}>
            <option value="recent">{t.attendees.sortRecent}</option>
            <option value="name">{t.attendees.sortName}</option>
            <option value="percent">{t.attendees.sortPercent}</option>
            <option value="arrival">{t.attendees.sortArrival}</option>
          </Select>
        </div>
        <div className="w-40">
          <Select
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setPage(1);
            }}
            aria-label={t.attendees.source}
          >
            <option value="">{t.attendees.allSources}</option>
            <option value="online">{t.attendees.online}</option>
            <option value="walkin">{t.attendees.walkin}</option>
            <option value="import">{t.attendees.imported}</option>
          </Select>
        </div>
        {isManager && (
          <>
            <a
              href={`/api/events/${event.id}/registrations/export.xlsx`}
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 text-[14px] font-bold text-navy hover:bg-tint"
            >
              <Icon name="download" size={17} />
              {t.attendees.export}
            </a>
            <Button variant="secondary" icon="team" onClick={() => setImportOpen(true)}>
              {t.attendees.import}
            </Button>
          </>
        )}
        <Button icon="plus" onClick={() => setWalkinOpen(true)}>
          {t.attendees.addWalkin}
        </Button>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => {
              setStatus(f);
              setPage(1);
            }}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors",
              status === f ? "border-navy bg-navy text-white" : "border-ink-200 bg-white text-ink-700 hover:border-navy/40",
            )}
          >
            {f === "all" ? t.common.all : t.attStatus[f]}
            <span className={cn("num rounded-full px-1.5 text-[11.5px]", status === f ? "bg-white/20" : "bg-ink-100")}>
              {data?.counts[f] ?? "·"}
            </span>
          </button>
        ))}
      </div>

      <Card className="mt-4 overflow-hidden">
        {error && !data ? (
          <div className="p-5">
            <ErrorBox error={error} onRetry={() => mutate()} />
          </div>
        ) : !data ? (
          <div className="grid gap-2 p-5">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState icon="users" title={t.attendees.empty} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-[13.5px]">
                <thead className="bg-ink-50 text-[12px] font-bold text-ink-500">
                  <tr>
                    <th className="px-5 py-3 text-start">{t.attendees.attendee}</th>
                    <th className="px-3 py-3 text-start">{t.attendees.profession}</th>
                    <th className="px-3 py-3 text-start">{t.attendees.firstIn}</th>
                    <th className="px-3 py-3 text-start">{t.attendees.attendance}</th>
                    <th className="px-3 py-3 text-start">{t.attendees.status}</th>
                    <th className="px-5 py-3 text-start">{t.attendees.certificate}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {data.items.map((r) => (
                    <tr key={r.id} onClick={() => setSelected(r.id)} className="cursor-pointer transition-colors hover:bg-tint">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={r.full_name} className="size-9 text-[13px]" />
                          <div className="min-w-0">
                            <div className="truncate font-bold text-ink-900">{r.full_name}</div>
                            <div className="num text-[12px] text-ink-500">
                              {r.ticket_code}
                              {r.source === "walkin" && <span className="ms-2 font-sans font-bold text-info">{t.attendees.walkin}</span>}
                              {r.source === "import" && <span className="ms-2 font-sans font-bold text-ink-500">{t.attendees.imported}</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-ink-700">{r.profession ? t.professions[r.profession] : "—"}</td>
                      <td className="num px-3 py-3 text-ink-700">{r.attendance.first_in ? fmtTime(r.attendance.first_in, tz, locale) : "—"}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-3 whitespace-nowrap">
                          <Progress value={r.attendance.percent} threshold={r.attendance.threshold} className="w-20 shrink-0" />
                          <span className="num w-12 shrink-0 font-extrabold text-navy">{r.attendance.percent}%</span>
                          <span className="num text-[12px] text-ink-500">{fmtDuration(r.attendance.attended_minutes, locale)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {r.status === "cancelled" ? (
                          <Badge tone="danger">{t.attStatus.cancelled}</Badge>
                        ) : (
                          <Badge tone={ATT_TONES[r.attendance.status]} dot pulse={r.attendance.status === "inside"}>
                            {t.attStatus[r.attendance.status]}
                          </Badge>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {r.certificate_code ? (
                          <span className="num inline-flex items-center gap-1.5 text-[12px] font-bold text-success">
                            <Icon name="award" size={15} />
                            {r.certificate_code}
                          </span>
                        ) : r.attendance.eligible ? (
                          <Badge tone="success">{t.attStatus.eligible}</Badge>
                        ) : (
                          <span className="text-ink-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-hairline md:hidden">
              {data.items.map((r) => (
                <li key={r.id}>
                  <button onClick={() => setSelected(r.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-start">
                    <Avatar name={r.full_name} className="size-9 text-[13px]" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-bold text-ink-900">{r.full_name}</div>
                      <div className="mt-1 flex items-center gap-2">
                        <Progress value={r.attendance.percent} threshold={r.attendance.threshold} className="w-20" />
                        <span className="num text-[12px] font-bold text-navy">{r.attendance.percent}%</span>
                      </div>
                    </div>
                    {r.status === "cancelled" ? (
                      <Badge tone="danger">{t.attStatus.cancelled}</Badge>
                    ) : (
                      <Badge tone={ATT_TONES[r.attendance.status]}>{t.attStatus[r.attendance.status]}</Badge>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>

      <AttendeeDrawer
        key={selected ?? "none"}
        registrationId={selected}
        onClose={() => setSelected(null)}
        onChanged={() => mutate()}
      />
      <WalkinModal
        eventId={event.id}
        open={walkinOpen}
        onClose={() => setWalkinOpen(false)}
        onCreated={(reg) => {
          setWalkinOpen(false);
          void mutate();
          setSelected(reg.id);
        }}
      />
      <ImportModal eventId={event.id} open={importOpen} onClose={() => setImportOpen(false)} onImported={() => void mutate()} />
    </>
  );
}
