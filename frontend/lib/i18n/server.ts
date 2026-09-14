import "server-only";

import { cookies, headers } from "next/headers";

import type { Locale } from "@/lib/types";

export const LOCALE_COOKIE = "mce_locale";

/** The visitor's language: their saved choice, else Arabic for Arabic browsers, else English. */
export async function getLocale(): Promise<Locale> {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (saved === "ar" || saved === "en") return saved;
  const accept = (await headers()).get("accept-language") ?? "";
  return accept.toLowerCase().startsWith("ar") ? "ar" : "en";
}
