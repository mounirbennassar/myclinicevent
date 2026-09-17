"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import useSWR from "swr";

import { ApiError, api, fetcher } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { MemberMe, MemberProfile, User } from "@/lib/types";

import { LangToggle, LogoWhite } from "./brand";
import { Icon, type IconName } from "./icons";
import { ErrorBox, Spinner, cn } from "./ui";

interface MemberCtx {
  user: User;
  profile: MemberProfile;
  refresh: () => void;
}

const MemberContext = createContext<MemberCtx | null>(null);

export function useMember(): MemberCtx {
  const ctx = useContext(MemberContext);
  if (!ctx) throw new Error("useMember must be used inside MemberShell");
  return ctx;
}

export function MemberShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const { data: user, error: userError, mutate: mutateUser } = useMe();
  const unauthorized = userError instanceof ApiError && userError.status === 401;
  const isMember = user?.role === "member";
  const { data: me, error: meError, mutate } = useSWR<MemberMe>(isMember ? "/member/me" : null, fetcher, {
    revalidateOnFocus: false,
  });

  useEffect(() => {
    if (unauthorized) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [unauthorized, pathname, router]);
  useEffect(() => {
    // Team and sponsor accounts have their own areas.
    if (user && !isMember) router.replace(user.role === "sponsor" ? "/sponsor" : "/admin");
  }, [user, isMember, router]);

  async function signOut() {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    await mutateUser(undefined, { revalidate: false });
    router.replace("/");
  }

  const items: { href: string; label: string; icon: IconName; exact?: boolean }[] = [
    { href: "/member", label: t.member.navEvents, icon: "calendar", exact: true },
    { href: "/member/profile", label: t.member.navProfile, icon: "id" },
    { href: "/member/account", label: t.member.navAccount, icon: "lock" },
  ];

  return (
    <div className="min-h-screen">
      <header className="bg-navy text-white" data-noprint>
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/member" className="flex items-center gap-3">
            <LogoWhite className="h-9" />
            <span className="hidden h-7 w-px bg-white/25 sm:block" />
            <span className="hidden text-[13px] font-bold sm:block">{t.member.portalTitle}</span>
          </Link>
          <div className="flex items-center gap-2">
            {user && isMember && (
              <Link
                href="/member/profile"
                className="hidden items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[12.5px] font-bold hover:bg-white/15 sm:inline-flex"
              >
                <Icon name="user" size={14} />
                {user.full_name}
              </Link>
            )}
            <LangToggle light />
            <button
              onClick={signOut}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[12.5px] font-bold hover:bg-white/15"
              aria-label={t.common.signOut}
            >
              <Icon name="logout" size={14} />
              <span className="hidden sm:inline">{t.common.signOut}</span>
            </button>
          </div>
        </div>
        <nav className="mx-auto max-w-5xl overflow-x-auto px-4 sm:px-6" aria-label={t.member.portalTitle}>
          <div className="flex min-w-max gap-1">
            {items.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
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
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {!user || !isMember ? (
          <div className="grid min-h-[50vh] place-items-center">
            {userError && !unauthorized ? (
              <ErrorBox error={userError} onRetry={() => mutateUser()} />
            ) : (
              <Spinner className="size-8 text-navy" />
            )}
          </div>
        ) : meError ? (
          <ErrorBox error={meError} onRetry={() => mutate()} />
        ) : !me ? (
          <div className="grid min-h-[50vh] place-items-center">
            <Spinner className="size-8 text-navy" />
          </div>
        ) : (
          <MemberContext.Provider value={{ user: me.user, profile: me.profile, refresh: () => mutate() }}>
            {children}
          </MemberContext.Provider>
        )}
      </main>
    </div>
  );
}
