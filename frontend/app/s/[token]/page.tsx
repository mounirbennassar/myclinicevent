"use client";

import Link from "next/link";
import { use, useReducer, useState, useSyncExternalStore, type FormEvent } from "react";
import useSWR from "swr";

import { PublicFooter, PublicHeader } from "@/components/brand";
import { Icon } from "@/components/icons";
import { Button, Card, ErrorBox, Field, Input, Skeleton, errorMessage } from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { eventDateLabel, pickText } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { BoothInfo, BoothVisitResult } from "@/lib/types";

function readPassCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)mce_pass=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// The cookie is browser-only state; reading it through useSyncExternalStore keeps hydration clean
// (the server snapshot is null) without a setState-in-effect.
const noSubscribe = () => () => {};
const serverNull = () => null;
const serverFalse = () => false;
const clientTrue = () => true;

/** What an attendee sees after scanning a sponsor's booth QR code with their phone. */
export default function BoothPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { t, locale } = useI18n();
  const { data, error, mutate } = useSWR<BoothInfo>(`/public/booths/${token}`, fetcher, { revalidateOnFocus: false });
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const passToken = useSyncExternalStore(noSubscribe, readPassCookie, serverNull);
  const ready = useSyncExternalStore(noSubscribe, clientTrue, serverFalse);
  const [result, setResult] = useState<BoothVisitResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [identify, setIdentify] = useState({ ticket_code: "", mobile: "" });
  const [identifyError, setIdentifyError] = useState<string | null>(null);

  async function share(tokenToUse: string) {
    setBusy(true);
    setShareError(null);
    try {
      const res = await api<BoothVisitResult>(`/public/booths/${token}/visit`, { method: "POST", body: { pass_token: tokenToUse } });
      setResult(res);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        document.cookie = "mce_pass=; path=/; max-age=0"; // stale cookie from a cancelled or foreign registration
        bump();
      } else {
        setShareError(errorMessage(err, t, locale));
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitIdentify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setIdentifyError(null);
    try {
      const res = await api<{ pass_token: string }>(`/public/booths/${token}/identify`, { method: "POST", body: identify });
      document.cookie = `mce_pass=${encodeURIComponent(res.pass_token)}; path=/; max-age=1209600; samesite=lax`;
      bump();
      await share(res.pass_token);
    } catch (err) {
      setIdentifyError(err instanceof ApiError && err.status === 404 ? t.sponsors.identifyNotFound : errorMessage(err, t, locale));
      setBusy(false);
    }
  }

  function forget() {
    document.cookie = "mce_pass=; path=/; max-age=0";
    bump();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8 sm:px-6">
        {error ? (
          <ErrorBox error={error} onRetry={() => mutate()} />
        ) : !data || !ready ? (
          <Skeleton className="h-80 rounded-2xl" />
        ) : (
          <Card className="overflow-hidden">
            <div className="bg-navy px-6 py-5 text-white">
              <p className="text-[12px] font-bold text-brand-teal-soft">{pickText(locale, data.event.title, data.event.title_ar)}</p>
              <p className="mt-0.5 text-[12px] text-white/70">{eventDateLabel(data.event.sessions, locale)}</p>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-4">
                {data.sponsor.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.sponsor.logo_url} alt="" className="size-16 shrink-0 rounded-xl object-contain" />
                ) : (
                  <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-tint text-[24px] font-extrabold text-navy">
                    {data.sponsor.company_name.charAt(0)}
                  </span>
                )}
                <div className="min-w-0">
                  <h1 className="text-[22px] font-extrabold leading-tight">{pickText(locale, data.sponsor.company_name, data.sponsor.company_name_ar)}</h1>
                  <p className="text-[13px] text-ink-500">
                    {t.sponsors.tiers[data.sponsor.tier]}
                    {data.sponsor.booth_number && ` · ${t.sponsors.booth} ${data.sponsor.booth_number}`}
                  </p>
                </div>
              </div>
              {(data.sponsor.description || data.sponsor.description_ar) && (
                <p className="mt-4 text-[14px] text-ink-700">{pickText(locale, data.sponsor.description, data.sponsor.description_ar)}</p>
              )}
              {data.sponsor.website && (
                <a href={data.sponsor.website} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[13px] font-bold text-action hover:underline">
                  {data.sponsor.website.replace(/^https?:\/\//, "")}
                  <Icon name="external" size={13} />
                </a>
              )}

              <div className="mt-6 border-t border-hairline pt-6">
                {result ? (
                  <div className="text-center">
                    <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-success-tint text-success">
                      <Icon name="check" size={26} />
                    </div>
                    <h2 className="mt-3 text-[20px] font-extrabold">{t.sponsors.sharedTitle}</h2>
                    <p className="mt-1 text-[14px] text-ink-700">
                      {result.first_visit ? t.sponsors.sharedBody(result.sponsor.company_name) : t.sponsors.alreadyShared}
                    </p>
                    <p className="num mt-3 inline-block rounded-full bg-tint px-3 py-1 text-[13px] font-bold text-navy">
                      {t.sponsors.boothsVisited(result.booths_visited, result.booths_total)}
                    </p>
                    {passToken && (
                      <div className="mt-5">
                        <Link href={`/r/${passToken}`} className="text-[14px] font-bold text-action hover:underline">
                          {t.sponsors.backToPass}
                        </Link>
                      </div>
                    )}
                  </div>
                ) : passToken ? (
                  <div className="text-center">
                    <h2 className="text-[17px] font-extrabold">{t.sponsors.boothTitle}</h2>
                    <p className="mt-1 text-[14px] text-ink-700">{t.sponsors.shareIntro(data.sponsor.company_name)}</p>
                    {shareError && <p className="mt-3 text-[13px] font-medium text-danger">{shareError}</p>}
                    <Button size="lg" className="mt-5 w-full" loading={busy} icon="check" onClick={() => share(passToken)}>
                      {busy ? t.sponsors.sharing : t.sponsors.shareButton}
                    </Button>
                    <button onClick={forget} className="mt-3 text-[12.5px] font-bold text-ink-500 hover:text-navy">
                      {t.sponsors.notYou}
                    </button>
                  </div>
                ) : (
                  <form onSubmit={submitIdentify} className="grid gap-4">
                    <h2 className="text-[17px] font-extrabold">{t.sponsors.boothTitle}</h2>
                    <p className="text-[14px] text-ink-700">{t.sponsors.identifyIntro}</p>
                    <Field label={t.sponsors.ticketCode} htmlFor="b-ticket">
                      <Input id="b-ticket" dir="ltr" placeholder="MC-XXXXXX" required value={identify.ticket_code} onChange={(e) => setIdentify((s) => ({ ...s, ticket_code: e.target.value }))} />
                    </Field>
                    <Field label={t.public.fields.mobile} htmlFor="b-mobile">
                      <Input id="b-mobile" type="tel" dir="ltr" required value={identify.mobile} onChange={(e) => setIdentify((s) => ({ ...s, mobile: e.target.value }))} />
                    </Field>
                    {identifyError && <p className="text-[13px] font-medium text-danger">{identifyError}</p>}
                    <Button type="submit" size="lg" loading={busy}>
                      {t.sponsors.shareButton}
                    </Button>
                  </form>
                )}
              </div>
            </div>
          </Card>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
