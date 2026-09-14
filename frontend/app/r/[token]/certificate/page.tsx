"use client";

import Image from "next/image";
import { use } from "react";
import useSWR from "swr";

import { LangToggle, Petal } from "@/components/brand";
import { QrImage } from "@/components/qr";
import { Button, ErrorBox, LinkButton, Skeleton } from "@/components/ui";
import { fetcher } from "@/lib/api";
import { eventDateLabel, fmtDate, pickText } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Certificate } from "@/lib/types";

export default function CertificatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { t, locale } = useI18n();
  const { data, error, mutate } = useSWR<Certificate>(`/public/passes/${token}/certificate`, fetcher, {
    revalidateOnFocus: false,
  });

  return (
    <div className="min-h-screen bg-ink-100 px-4 py-6 print:bg-white print:p-0">
      <style>{`@page { size: A4 landscape; margin: 0 } @media print { .cert-sheet { width: 297mm !important; max-width: none !important; box-shadow: none !important; border-radius: 0 !important } }`}</style>
      <div className="mx-auto mb-5 flex max-w-[297mm] flex-wrap items-center justify-between gap-3" data-noprint>
        <LinkButton href={`/r/${token}`} variant="secondary" size="sm" icon="chevronLeft">
          {t.cert.backToPass}
        </LinkButton>
        <div className="flex items-center gap-2">
          <LangToggle />
          <Button size="sm" icon="printer" onClick={() => window.print()} disabled={!data}>
            {t.cert.print}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mx-auto max-w-xl">
          <ErrorBox error={error} onRetry={() => mutate()} />
        </div>
      ) : !data ? (
        <Skeleton className="mx-auto aspect-[297/210] w-full max-w-[297mm]" />
      ) : (
        <>
          <article className="cert-sheet @container relative mx-auto aspect-[297/210] w-full max-w-[297mm] overflow-hidden rounded-lg bg-white shadow-raised">
            {/* Navy frame with a thin accent rule, following the brand's print pieces. */}
            <div className="absolute inset-[2.2cqw] border-[0.55cqw] border-navy" />
            <div className="absolute inset-[3.4cqw] border-[0.15cqw] border-brand-teal-mid/60" />
            <div className="absolute -bottom-[9cqw] -end-[7cqw] w-[36cqw] opacity-[0.05] invert">
              <Petal className="w-full" />
            </div>

            <div className="relative flex h-full flex-col items-center px-[9cqw] pb-[6cqw] pt-[6.2cqw] text-center">
              <Image src="/brand/logo-frame.png" alt="My Clinic" width={1749} height={640} className="h-auto w-[15cqw]" priority />
              <p className="mt-[1.4cqw] text-[1.3cqw] font-bold tracking-[0.2em] text-ink-500">{t.brand.name.toUpperCase()}</p>
              <h1 className="mt-[1.8cqw] text-[3.9cqw] font-extrabold leading-none text-navy">{t.cert.title}</h1>

              <p className="mt-[2.6cqw] text-[1.6cqw] text-ink-700">{t.cert.certify}</p>
              <p className="mt-[0.9cqw] text-[3.5cqw] font-extrabold leading-tight text-navy">{data.full_name}</p>
              <p className="mt-[0.5cqw] text-[1.25cqw] text-ink-500">
                {t.cert.scfhs} <span className="num font-bold">{data.scfhs_number}</span>
              </p>

              <p className="mt-[2cqw] text-[1.6cqw] text-ink-700">{t.cert.attended}</p>
              <p className="mt-[0.6cqw] max-w-[80%] text-[2.2cqw] font-extrabold leading-snug text-navy">
                {pickText(locale, data.event.title, data.event.title_ar)}
              </p>
              <p className="mt-[0.6cqw] text-[1.45cqw] text-ink-700">
                {t.cert.heldAt(
                  pickText(locale, data.event.venue, data.event.venue_ar),
                  eventDateLabel(data.event.sessions, locale),
                )}
              </p>
              {data.event.cme_hours ? (
                <p className="mt-[0.9cqw] text-[1.6cqw] font-bold text-brand-teal">{t.cert.awarded(data.event.cme_hours)}</p>
              ) : null}
              <p className="mt-[0.5cqw] text-[1.2cqw] text-ink-500">{t.cert.attendance(data.percent)}</p>

              <div className="mt-auto flex w-full items-end justify-between gap-[3cqw] text-start">
                <div className="text-[1.1cqw] leading-relaxed text-ink-500">
                  <div>
                    {t.cert.code}: <span className="num font-bold text-navy">{data.certificate_code}</span>
                  </div>
                  <div>
                    {t.cert.issued}: <span className="num">{fmtDate(data.issued_at, data.event.timezone, locale)}</span>
                  </div>
                  {data.event.scfhs_activity_code && (
                    <div>
                      {t.cert.activity}: <span className="num">{data.event.scfhs_activity_code}</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-center">
                  <div className="h-px w-[20cqw] bg-ink-300" />
                  <p className="mt-[0.6cqw] text-[1.15cqw] font-bold text-navy">{t.brand.name}</p>
                </div>
                <div className="flex items-end gap-[1cqw]">
                  <div className="text-end text-[1cqw] leading-snug text-ink-500">
                    {t.cert.verifyAt}
                    <br />
                    <span className="num break-all">{data.verify_url.replace(/^https?:\/\//, "")}</span>
                  </div>
                  <QrImage value={data.verify_url} alt={t.cert.verifyAt} width={320} className="w-[8cqw]" />
                </div>
              </div>
            </div>
          </article>
          <p className="mx-auto mt-4 max-w-[297mm] text-center text-[13px] text-ink-500" data-noprint>
            {t.cert.printHint}
          </p>
        </>
      )}
    </div>
  );
}
