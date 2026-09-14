"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useI18n } from "@/lib/i18n";

import { LangToggle, LogoWhite, Petal } from "./brand";

/** Split layout for sign-in pages: navy brand panel + form. */
export function AuthShell({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-navy p-12 text-white lg:flex lg:flex-col">
        <Petal className="absolute -bottom-24 end-[-90px] w-[520px] opacity-[0.08]" />
        <Link href="/">
          <LogoWhite className="h-14" />
        </Link>
        <div className="relative mt-auto">
          <p className="text-[13px] font-bold text-brand-teal-soft">{t.brand.platform}</p>
          <h2 className="mt-2 text-[40px] font-extrabold leading-tight text-white">{t.brand.name}</h2>
          <p className="mt-3 max-w-sm text-white/70">{t.auth.teamOnly}</p>
        </div>
      </aside>
      <main className="flex flex-col bg-white">
        <div className="flex items-center justify-between p-5 lg:justify-end">
          <Link href="/" className="rounded-lg bg-navy px-3 py-2 lg:hidden">
            <LogoWhite className="h-8" />
          </Link>
          <LangToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 pb-16">
          <h1 className="text-[28px] font-extrabold">{title}</h1>
          {intro && <p className="mt-2 text-[14px] text-ink-500">{intro}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
