"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";

import { useI18n } from "@/lib/i18n";

import { Icon } from "./icons";
import { cn } from "./ui";

/** White lockup; always shown on navy, as the brand guideline requires. */
export function LogoWhite({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/logo-white.png"
      alt="My Clinic عيادتي"
      width={360}
      height={132}
      priority
      className={cn("h-11 w-auto", className)}
    />
  );
}

/** The five-petal mark, used large and faint as a watermark. */
export function Petal({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/flower-white.png" alt="" aria-hidden="true" className={cn("pointer-events-none select-none", className)} />
  );
}

export function LangToggle({ className, light }: { className?: string; light?: boolean }) {
  const { t, locale, setLocale } = useI18n();
  return (
    <button
      type="button"
      onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
      lang={locale === "ar" ? "en" : "ar"}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-bold transition-colors duration-150",
        light ? "bg-white/10 text-white hover:bg-white/20" : "bg-ink-100 text-navy hover:bg-ink-200",
        className,
      )}
      data-noprint
    >
      <Icon name="globe" size={16} />
      {t.common.language}
    </button>
  );
}

export function PublicHeader({ embed = false }: { embed?: boolean }) {
  const { t } = useI18n();
  if (embed) {
    return (
      <div className="flex justify-end px-4 pt-3" data-noprint>
        <LangToggle />
      </div>
    );
  }
  return (
    <header className="bg-navy text-white" data-noprint>
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3.5">
          <LogoWhite className="h-10" />
          <span className="hidden h-8 w-px bg-white/25 sm:block" />
          <span className="hidden text-[14px] font-bold leading-tight sm:block">{t.brand.name}</span>
        </Link>
        <LangToggle light />
      </div>
    </header>
  );
}

export function PublicFooter() {
  const { t } = useI18n();
  return (
    <footer className="mt-16 border-t border-hairline bg-white" data-noprint>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-[13px] text-ink-500 sm:px-6">
        <span>{t.public.poweredBy}</span>
        <Link href="/login" className="font-bold text-action hover:underline">
          {t.public.staffLogin}
        </Link>
      </div>
    </footer>
  );
}

/** In embed mode, tell the host page our height so its iframe can grow to fit (see the Share page snippet). */
export function EmbedResizer() {
  useEffect(() => {
    if (window.parent === window) return;
    const post = () =>
      window.parent.postMessage({ type: "mce:height", height: document.documentElement.scrollHeight }, "*");
    const observer = new ResizeObserver(post);
    observer.observe(document.body);
    post();
    return () => observer.disconnect();
  }, []);
  return null;
}
