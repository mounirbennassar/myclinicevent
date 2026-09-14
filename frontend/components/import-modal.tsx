"use client";

import { useRef, useState, type FormEvent } from "react";

import { useI18n } from "@/lib/i18n";
import type { ImportResult } from "@/lib/types";

import { Icon } from "./icons";
import { Button, Checkbox, Modal, errorMessage } from "./ui";

/** Bulk pre-registration from an Excel/CSV file. Uses fetch directly because it's multipart, not JSON. */
export function ImportModal({
  eventId,
  open,
  onClose,
  onImported,
}: {
  eventId: number;
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const { t, locale } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/events/${eventId}/registrations/import?notify=${notify}`, {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const code = data?.detail?.code as string | undefined;
        setError((code && t.attendees.importReasons[code]) || errorMessage(new Error(), t, locale));
        return;
      }
      setResult(data as ImportResult);
      if ((data as ImportResult).created > 0) onImported();
    } catch {
      setError(t.common.network);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setResult(null);
    setError(null);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t.attendees.importTitle}
      size="lg"
      footer={
        result ? (
          <Button onClick={close}>{t.common.close}</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              {t.common.cancel}
            </Button>
            <Button type="submit" form="import-form" loading={busy} icon="download">
              {t.attendees.importRun}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="grid gap-4">
          <div className="flex items-center gap-3 rounded-xl bg-success-tint p-4 text-success">
            <Icon name="check" size={22} className="shrink-0" />
            <p className="font-extrabold">{t.attendees.importDone(result.created, result.total_rows)}</p>
          </div>
          {result.skipped.length > 0 && (
            <div>
              <h3 className="text-[13px] font-extrabold text-ink-900">{t.attendees.importSkipped}</h3>
              <ul className="mt-2 max-h-72 divide-y divide-hairline overflow-y-auto rounded-xl border border-hairline text-[13px]">
                {result.skipped.map((s) => (
                  <li key={s.row} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3.5 py-2.5">
                    <span className="num font-bold text-navy">{t.attendees.importRow(s.row)}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-700">{s.name || "—"}</span>
                    <span className="text-danger">
                      {t.attendees.importReasons[s.code] ?? s.code}
                      {Object.keys(s.fields).length > 0 &&
                        `: ${Object.entries(s.fields)
                          .map(([f, code]) => t.fieldErrors[code] ?? f)
                          .join(" · ")}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <form id="import-form" onSubmit={submit} className="grid gap-4">
          <p className="text-[13.5px] text-ink-500">{t.attendees.importIntro}</p>
          <label className="text-[13px] font-bold text-ink-900">
            {t.attendees.importFile}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              required
              className="mt-1.5 block w-full rounded-lg border border-ink-200 bg-white p-2 text-[14px] file:me-3 file:rounded-md file:border-0 file:bg-tint file:px-3 file:py-1.5 file:font-bold file:text-navy"
            />
          </label>
          <Checkbox checked={notify} onChange={setNotify} label={t.attendees.importNotify} />
          {error && <p className="text-[13.5px] font-medium text-danger">{error}</p>}
        </form>
      )}
    </Modal>
  );
}
