"use client";

import QRCode from "qrcode";
import Image from "next/image";

import { useEventCtx } from "@/components/event-context";
import { Icon } from "@/components/icons";
import { QrImage, downloadUrl, qrSvg } from "@/components/qr";
import { useToast } from "@/components/toast";
import { Button, Card, CardHeader, LinkButton } from "@/components/ui";
import { copyText } from "@/lib/clipboard";
import { eventDateLabel, pickText, sessionTimesLabel } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

function CodeBlock({ code, onCopy, label }: { code: string; onCopy: () => void; label: string }) {
  return (
    <div className="relative min-w-0">
      <pre
        className="num whitespace-pre-wrap [overflow-wrap:anywhere] rounded-xl bg-midnight p-4 pe-24 text-[12.5px] leading-relaxed text-white/90"
        dir="ltr"
      >
        {code}
      </pre>
      <Button size="sm" variant="secondary" icon="copy" className="absolute end-2.5 top-2.5" onClick={onCopy}>
        {label}
      </Button>
    </div>
  );
}

export default function SharePage() {
  const { event } = useEventCtx();
  const { t, locale } = useI18n();
  const toast = useToast();
  const url = event.registration_url;
  const origin = new URL(url).origin;
  const title = pickText(locale, event.title, event.title_ar);

  const copy = async (text: string) => {
    if (await copyText(text)) toast(t.common.copied);
  };

  const embed = `<iframe id="mce-register" src="${url}?embed=1" title="${event.title.replace(/"/g, "&quot;")}" style="width:100%;height:1400px;border:0" loading="lazy"></iframe>
<script>
  window.addEventListener("message", function (e) {
    if (e.origin !== "${origin}" || !e.data || e.data.type !== "mce:height") return;
    document.getElementById("mce-register").style.height = e.data.height + "px";
  });
</script>`;
  const button = `<a href="${url}" style="display:inline-block;background:#004d99;color:#fff;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none">Register now · سجّل الآن</a>`;

  async function downloadPng() {
    const png = await QRCode.toDataURL(url, {
      width: 1400,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#003868", light: "#ffffff" },
    });
    downloadUrl(png, `${event.slug}-registration-qr.png`);
  }

  async function downloadSvg() {
    const blob = new Blob([await qrSvg(url)], { type: "image/svg+xml" });
    const href = URL.createObjectURL(blob);
    downloadUrl(href, `${event.slug}-registration-qr.svg`);
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  return (
    <div className="grid gap-5">
      <style>{`
        #mce-poster { display: none; }
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body * { visibility: hidden !important; }
          #mce-poster, #mce-poster * { visibility: visible !important; }
          #mce-poster { display: flex !important; position: fixed; inset: 0; }
        }
      `}</style>

      {event.status !== "published" && (
        <div className="flex items-start gap-3 rounded-xl bg-warning-tint p-4 text-[14px] font-medium text-warning">
          <Icon name="alert" className="mt-0.5 shrink-0" />
          {t.share.statusWarning}
        </div>
      )}
      <p className="max-w-3xl text-[14px] text-ink-500">{t.share.intro}</p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-5">
          <Card className="p-5">
            <h3 className="text-[15px] font-extrabold">{t.share.link}</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <div className="num flex h-11 min-w-0 flex-1 items-center overflow-x-auto rounded-lg border border-ink-200 bg-ink-50 px-3.5 text-[14px] text-navy" dir="ltr">
                {url}
              </div>
              <Button icon="copy" onClick={() => copy(url)}>
                {t.common.copy}
              </Button>
              <LinkButton href={`/e/${event.slug}`} target="_blank" variant="secondary" icon="external">
                {t.share.preview}
              </LinkButton>
            </div>
          </Card>

          <Card>
            <CardHeader title={t.share.embed} subtitle={t.share.embedHint} />
            <div className="grid gap-4 p-5">
              <CodeBlock code={embed} onCopy={() => copy(embed)} label={t.common.copy} />
              <p className="text-[13px] font-bold text-ink-700">{t.share.button}</p>
              <CodeBlock code={button} onCopy={() => copy(button)} label={t.common.copy} />
            </div>
          </Card>
        </div>

        <Card className="flex h-fit flex-col items-center p-6 text-center">
          <h3 className="text-[15px] font-extrabold">{t.share.qr}</h3>
          <div className="mt-4 w-full max-w-[260px] rounded-2xl border-2 border-navy/10 p-3">
            <QrImage value={url} alt={t.share.qr} width={640} className="aspect-square w-full" />
          </div>
          <p className="mt-3 text-[13px] font-bold text-navy">{t.share.posterScan}</p>
          <div className="mt-5 grid w-full gap-2">
            <Button icon="download" onClick={downloadPng}>
              {t.share.downloadPng}
            </Button>
            <Button variant="secondary" icon="download" onClick={downloadSvg}>
              {t.share.downloadSvg}
            </Button>
            <Button variant="secondary" icon="printer" onClick={() => window.print()}>
              {t.share.poster}
            </Button>
          </div>
        </Card>
      </div>

      {/* A4 poster, only visible when printing. */}
      <div id="mce-poster" className="flex-col bg-white" style={{ width: "210mm", height: "297mm" }}>
        <div className="flex flex-col items-center bg-navy px-12 pb-14 pt-12 text-center text-white">
          <Image src="/brand/logo-white.png" alt="My Clinic" width={360} height={132} className="h-20 w-auto" />
          <p className="mt-8 text-[20px] font-bold opacity-80">{t.brand.name}</p>
          <h1 className="mt-3 text-[40px] font-extrabold leading-tight text-white">{title}</h1>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-12 text-center">
          <p className="text-[20px] font-bold text-ink-700">
            {eventDateLabel(event.sessions, locale)} · <span className="num">{sessionTimesLabel(event.sessions)}</span>
          </p>
          <p className="mt-2 text-[18px] text-ink-500">{pickText(locale, event.venue, event.venue_ar)}</p>
          <div className="mt-10 w-[95mm]">
            <QrImage value={url} alt="" width={900} className="aspect-square w-full" />
          </div>
          <p className="mt-6 text-[30px] font-extrabold text-navy">{t.share.posterScan}</p>
          <p className="num mt-2 text-[15px] text-ink-500" dir="ltr">
            {url.replace(/^https?:\/\//, "")}
          </p>
          {event.cme_hours ? <p className="mt-8 text-[18px] font-bold text-brand-teal">{t.public.cmeHours(event.cme_hours)}</p> : null}
        </div>
      </div>
    </div>
  );
}
