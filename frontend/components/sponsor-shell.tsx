"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import useSWR from "swr";

import { ApiError, api, fetcher } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { SponsorMe, User } from "@/lib/types";

import { LangToggle, LogoWhite } from "./brand";
import { Icon, type IconName } from "./icons";
import { Card, EmptyState, ErrorBox, Spinner, cn } from "./ui";

interface SponsorCtx {
  user: User;
  me: SponsorMe;
  refresh: () => void;
}

const SponsorContext = createContext<SponsorCtx | null>(null);

export function useSponsor(): SponsorCtx {
  const ctx = useContext(SponsorContext);
  if (!ctx) throw new Error("useSponsor must be used inside SponsorShell");
  return ctx;
}

export function SponsorShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const { data: user, error: userError, mutate: mutateUser } = useMe();
  const unauthorized = userError instanceof ApiError && userError.status === 401;
  const isSponsor = user?.role === "sponsor";
  const { data: me, error: meError, mutate } = useSWR<SponsorMe>(isSponsor ? "/sponsor/me" : null, fetcher, {
    refreshInterval: 20000,
  });

  useEffect(() => {
    if (unauthorized) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [unauthorized, pathname, router]);
  useEffect(() => {
    if (user && !isSponsor) router.replace(user.role === "member" ? "/member" : "/admin");
  }, [user, isSponsor, router]);
  useEffect(() => {
    if (user?.must_change_password && pathname !== "/sponsor/account") router.replace("/sponsor/account?required=1");
  }, [user, pathname, router]);

  async function signOut() {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    await mutateUser(undefined, { revalidate: false });
    router.replace("/login");
  }

  const notApproved = meError instanceof ApiError && meError.status === 403;
  const items: { href: string; label: string; icon: IconName; exact?: boolean }[] = [
    { href: "/sponsor", label: t.sponsors.portal.overview, icon: "grid", exact: true },
    { href: "/sponsor/leads", label: t.sponsors.portal.leads, icon: "users" },
    { href: "/sponsor/scan", label: t.sponsors.portal.scan, icon: "scan" },
    { href: "/sponsor/team", label: t.sponsors.portal.team, icon: "team" },
    { href: "/sponsor/booth", label: t.sponsors.portal.booth, icon: "qr" },
    { href: "/sponsor/profile", label: t.sponsors.portal.profile, icon: "settings" },
  ];

  return (
    <div className="min-h-screen">
      <header className="bg-navy text-white" data-noprint>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/sponsor" className="flex items-center gap-3">
            <LogoWhite className="h-9" />
            <span className="hidden h-7 w-px bg-white/25 sm:block" />
            <span className="hidden text-[13px] font-bold sm:block">{t.sponsors.portal.title}</span>
          </Link>
          <div className="flex items-center gap-2">
            {user && (
              <Link href="/sponsor/account" className="hidden items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[12.5px] font-bold hover:bg-white/15 sm:inline-flex">
                <Icon name="user" size={14} />
                {user.full_name}
              </Link>
            )}
            <LangToggle light />
            <button onClick={signOut} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[12.5px] font-bold hover:bg-white/15" aria-label={t.common.signOut}>
              <Icon name="logout" size={14} />
              <span className="hidden sm:inline">{t.common.signOut}</span>
            </button>
          </div>
        </div>
        {me && (
          <nav className="mx-auto max-w-6xl overflow-x-auto px-4 sm:px-6" data-noprint>
            <div className="flex min-w-max gap-1">
              {items.map((item) => {
                const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 border-b-2 px-3 py-2.5 text-[13px] font-bold transition-colors",
                      active ? "border-brand-teal-soft text-white" : "border-transparent text-white/65 hover:text-white",
                    )}
                  >
                    <Icon name={item.icon} size={15} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {!user || !isSponsor ? (
          <div className="grid min-h-[50vh] place-items-center">
            {userError && !unauthorized ? <ErrorBox error={userError} onRetry={() => mutateUser()} /> : <Spinner className="size-8 text-navy" />}
          </div>
        ) : pathname === "/sponsor/account" && !me ? (
          // Account page must work even before approval (forced password change).
          <SponsorContext.Provider value={{ user, me: me as unknown as SponsorMe, refresh: () => mutate() }}>{children}</SponsorContext.Provider>
        ) : notApproved ? (
          <Card>
            <EmptyState icon="clock" title={t.sponsors.portal.notApproved} />
          </Card>
        ) : meError ? (
          <ErrorBox error={meError} onRetry={() => mutate()} />
        ) : !me ? (
          <div className="grid min-h-[50vh] place-items-center">
            <Spinner className="size-8 text-navy" />
          </div>
        ) : (
          <SponsorContext.Provider value={{ user, me, refresh: () => mutate() }}>{children}</SponsorContext.Provider>
        )}
      </main>
    </div>
  );
}
