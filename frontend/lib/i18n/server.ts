import "server-only";

import { cookies } from "next/headers";

import type { Locale } from "@/lib/types";

export const LOCALE_COOKIE = "mce_locale";

/** Saudi Arabic is the default; an explicit language choice always takes precedence. */
export async function getLocale(): Promise<Locale> {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (saved === "ar" || saved === "en") return saved;
  return "ar";
}
