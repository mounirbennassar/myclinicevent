"use client";

import Image from "next/image";
import QRCode from "qrcode";

import { QrImage, downloadUrl } from "@/components/qr";
import { useSponsor } from "@/components/sponsor-shell";
import { useToast } from "@/components/toast";
import { Button, Card, PageHeader } from "@/components/ui";
import { copyText } from "@/lib/clipboard";
import { pickText } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export default function SponsorBoothPage() {
  const { me } = useSponsor();
  const { t, locale } = useI18n();
  const toast = useToast();
  const url = me.booth_url;
  const name = pickText(locale, me.sponsor.company_name, me.sponsor.company_name_ar);

  async function downloadPng() {
    const png = await QRCode.toDataURL(url, { width: 1400, margin: 2, errorCorrectionLevel: "M", color: { dark: "#003868", light: "#ffffff" } });
    downloadUrl(png, `${me.sponsor.company_name.replace(/\s+/g, "-").toLowerCase()}-booth-qr.png`);
  }

  return (
    <>
      <style>{`
        #booth-sign { display: none; }
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body * { visibility: hidden !important; }
          #booth-sign, #booth-sign * { visibility: visible !important; }
          #booth-sign { display: flex !important; position: fixed; inset: 0; }
        }
      `}</style>
      <PageHeader title={t.sponsors.portal.boothQrTitle} subtitle={t.sponsors.portal.boothQrIntro} />
      <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="flex flex-col items-center p-6 text-center">
          <div className="w-full max-w-[260px] rounded-2xl border-2 border-navy/10 p-3">
            <QrImage value={url} alt={t.sponsors.portal.boothQrTitle} width={640} className="aspect-square w-full" />
          </div>
          <p className="mt-3 text-[13px] font-bold text-navy">{t.sponsors.portal.scanToConnect}</p>
          <div className="mt-5 grid w-full gap-2">
            <Button icon="download" onClick={downloadPng}>
              {t.sponsors.portal.downloadPng}
            </Button>
            <Button variant="secondary" icon="printer" onClick={() => window.print()}>
              {t.sponsors.portal.printSign}
            </Button>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="text-[15px] font-extrabold">{t.share.link}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <div className="num flex h-11 min-w-0 flex-1 items-center overflow-x-auto rounded-lg border border-ink-200 bg-ink-50 px-3.5 text-[14px] text-navy" dir="ltr">
              {url}
            </div>
            <Button icon="copy" onClick={async () => (await copyText(url)) && toast(t.common.copied)}>
              {t.common.copy}
            </Button>
          </div>
          <ol className="mt-6 grid gap-2 text-[14px] text-ink-700">
            <li>1. {t.sponsors.portal.how1}</li>
            <li>2. {t.sponsors.portal.how2}</li>
          </ol>
        </Card>
      </div>

      <div id="booth-sign" className="flex-col bg-white" style={{ width: "210mm", height: "297mm" }}>
        <div className="flex flex-col items-center bg-navy px-12 pb-12 pt-10 text-center text-white">
          <Image src="/brand/logo-white.png" alt="My Clinic" width={360} height={132} className="h-16 w-auto" />
          <p className="mt-6 text-[16px] font-bold opacity-80">{pickText(locale, me.event.title, me.event.title_ar)}</p>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-12 text-center">
          {me.sponsor.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.sponsor.logo_url} alt="" className="mb-6 max-h-28 max-w-[60%] object-contain" />
          )}
          <h1 className="text-[40px] font-extrabold leading-tight">{name}</h1>
          <p className="mt-1 text-[18px] text-ink-500">
            {t.sponsors.tiers[me.sponsor.tier]}
            {me.sponsor.booth_number && ` · ${t.sponsors.booth} ${me.sponsor.booth_number}`}
          </p>
          <div className="mt-10 w-[100mm]">
            <QrImage value={url} alt="" width={900} className="aspect-square w-full" />
          </div>
          <p className="mt-6 text-[30px] font-extrabold text-navy">{t.sponsors.portal.scanToConnect}</p>
          <p className="mt-2 max-w-md text-[15px] text-ink-500">{t.sponsors.shareIntro(name)}</p>
        </div>
      </div>
    </>
  );
}
