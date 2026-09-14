"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

import type { Locale } from "@/lib/types";

import { dictionaries, type Dict } from "./dict";

interface I18n {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: Dict;
  setLocale: (locale: Locale) => void;
  /** Pick the Arabic variant of a field when viewing in Arabic and it exists. */
  pick: (en: string | null | undefined, ar: string | null | undefined) => string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const router = useRouter();
  const setLocale = useCallback(
    (next: Locale) => {
      document.cookie = `mce_locale=${next}; path=/; max-age=31536000; samesite=lax`;
      // Re-render server components so <html lang/dir> follows.
      router.refresh();
    },
    [router],
  );
  const value = useMemo<I18n>(
    () => ({
      locale,
      dir: locale === "ar" ? "rtl" : "ltr",
      t: dictionaries[locale],
      setLocale,
      pick: (en, ar) => (locale === "ar" && ar ? ar : en ?? ""),
    }),
    [locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
