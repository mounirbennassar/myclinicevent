import type { Metadata } from "next";

import { PublicFooter, PublicHeader } from "@/components/brand";
import { Icon } from "@/components/icons";
import { fmtDate, pickText } from "@/lib/format";
import { dictionaries } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";
import { serverApi } from "@/lib/server-api";
import type { VerifyResult } from "@/lib/types";

export const metadata: Metadata = { title: "Certificate verification", robots: { index: false } };

export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const locale = await getLocale();
  const t = dictionaries[locale];
  const result = await serverApi<VerifyResult>(`/public/verify/${encodeURIComponent(code)}`);

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
        <h1 className="mb-5 text-[24px] font-extrabold">{t.verify.title}</h1>
        {!result ? (
          <div className="flex items-center gap-4 rounded-2xl border border-danger/20 bg-danger-tint p-6 text-danger">
            <Icon name="x" size={26} className="shrink-0" />
            <div>
              <p className="font-extrabold">{t.verify.invalid}</p>
              <p className="num mt-1 text-[14px]">{decodeURIComponent(code)}</p>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-hairline bg-white shadow-card">
            <div className="flex items-center gap-3 bg-success-tint px-6 py-4 text-success">
              <Icon name="check" size={24} />
              <p className="text-[16px] font-extrabold">{t.verify.valid}</p>
            </div>
            <dl className="divide-y divide-hairline px-6">
              {[
                [t.verify.issuedTo, result.full_name],
                [t.verify.event, pickText(locale, result.event.title, result.event.title_ar)],
                [t.verify.date, fmtDate(result.event.starts_at, result.event.timezone, locale)],
                [t.verify.cme, result.event.cme_hours ? String(result.event.cme_hours) : "—"],
                [t.verify.issued, fmtDate(result.issued_at, result.event.timezone, locale)],
                [t.verify.code, result.certificate_code],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-6 py-3.5 text-[14px]">
                  <dt className="text-ink-500">{label}</dt>
                  <dd className="text-end font-bold text-ink-900">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
