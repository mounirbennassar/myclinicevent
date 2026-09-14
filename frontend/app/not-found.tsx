import Link from "next/link";

import { PublicFooter, PublicHeader } from "@/components/brand";
import { dictionaries } from "@/lib/i18n/dict";
import { getLocale } from "@/lib/i18n/server";

export default async function NotFound() {
  const t = dictionaries[await getLocale()];
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <p className="num text-[64px] font-extrabold leading-none text-navy/15">404</p>
        <h1 className="mt-4 text-[24px] font-extrabold">{t.common.notFound}</h1>
        <Link href="/" className="mt-6 text-[14px] font-bold text-action hover:underline">
          {t.brand.name}
        </Link>
      </main>
      <PublicFooter />
    </div>
  );
}
