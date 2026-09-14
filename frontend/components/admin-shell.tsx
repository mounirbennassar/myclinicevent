"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { User } from "@/lib/types";

import { LangToggle, LogoWhite, Petal } from "./brand";
import { Icon, type IconName } from "./icons";
import { ErrorBox, Spinner, cn } from "./ui";

const AdminContext = createContext<User | null>(null);

export function useAdminUser(): User {
  const user = useContext(AdminContext);
  if (!user) throw new Error("useAdminUser must be used inside AdminShell");
  return user;
}

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: user, error, mutate } = useMe();
  const [menuOpen, setMenuOpen] = useState(false);
  const unauthorized = error instanceof ApiError && error.status === 401;

  useEffect(() => {
    if (unauthorized) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [unauthorized, pathname, router]);
  useEffect(() => {
    // Sponsor accounts have their own portal; nothing here is theirs.
    if (user?.role === "sponsor") router.replace("/sponsor");
  }, [user, router]);
  useEffect(() => {
    if (user?.must_change_password && pathname !== "/admin/account") router.replace("/admin/account?required=1");
  }, [user, pathname, router]);

  async function signOut() {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    await mutate(undefined, { revalidate: false });
    router.replace("/login");
  }

  if (!user || user.role === "sponsor") {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        {error && !unauthorized ? <ErrorBox error={error} onRetry={() => mutate()} /> : <Spinner className="size-8 text-navy" />}
      </div>
    );
  }

  const sidebar = <Sidebar user={user} pathname={pathname} onSignOut={signOut} onNavigate={() => setMenuOpen(false)} />;

  return (
    <AdminContext.Provider value={user}>
      <div className="min-h-screen">
        <aside className="fixed inset-y-0 start-0 z-30 hidden w-[248px] lg:block">{sidebar}</aside>

        <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-navy px-3 text-white lg:hidden">
          <button onClick={() => setMenuOpen(true)} className="rounded-lg p-2 hover:bg-white/10" aria-label="Menu">
            <Icon name="menu" size={22} />
          </button>
          <Link href="/admin">
            <LogoWhite className="h-8" />
          </Link>
          <span className="w-10" />
        </header>
        {menuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-midnight/50" onClick={() => setMenuOpen(false)} />
            <aside className="absolute inset-y-0 start-0 w-[280px] animate-fade-up">{sidebar}</aside>
          </div>
        )}

        <main className="lg:ps-[248px]">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-8 sm:py-8">{children}</div>
        </main>
      </div>
    </AdminContext.Provider>
  );
}

function Sidebar({
  user,
  pathname,
  onSignOut,
  onNavigate,
}: {
  user: User;
  pathname: string;
  onSignOut: () => void;
  onNavigate: () => void;
}) {
  const { t } = useI18n();
  const items: { href: string; label: string; icon: IconName; show: boolean; exact?: boolean }[] = [
    { href: "/admin", label: t.nav.overview, icon: "grid", show: true, exact: true },
    { href: "/admin/events", label: t.nav.events, icon: "calendar", show: true },
    { href: "/admin/users", label: t.nav.users, icon: "team", show: user.role === "super_admin" },
    { href: "/admin/audit", label: t.nav.audit, icon: "shield", show: user.role === "super_admin" },
  ];
  return (
    <div className="relative flex h-full flex-col overflow-y-auto bg-navy text-white">
      <Petal className="absolute -bottom-12 -start-20 w-[300px] opacity-[0.05]" />
      <div className="px-6 pb-2 pt-6">
        <Link href="/admin">
          <LogoWhite className="h-12" />
        </Link>
      </div>
      <p className="px-6 pb-5 text-[11px] font-bold tracking-[0.14em] text-white/50">{t.brand.platform}</p>
      <nav className="relative flex flex-col gap-1 px-3">
        {items
          .filter((i) => i.show)
          .map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14px] font-bold transition-colors duration-150",
                  active ? "bg-white/[0.13] text-white" : "text-white/70 hover:bg-white/[0.07] hover:text-white",
                )}
              >
                {active && <span className="absolute inset-y-2 end-0 w-[3px] rounded-full bg-brand-teal-soft" />}
                <Icon name={item.icon} size={18} />
                {item.label}
              </Link>
            );
          })}
      </nav>
      <div className="relative mt-auto space-y-3 p-4">
        <LangToggle light className="w-full justify-center" />
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5">
          <Link href="/admin/account" onClick={onNavigate} className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/15 text-[14px] font-extrabold">
              {user.full_name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13.5px] font-bold">{user.full_name}</span>
              <span className="block text-[11.5px] text-white/60">{t.roles[user.role]}</span>
            </span>
          </Link>
          <button
            onClick={onSignOut}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-white/10 py-2 text-[12.5px] font-bold transition-colors hover:bg-white/15"
          >
            <Icon name="logout" size={15} />
            {t.common.signOut}
          </button>
        </div>
      </div>
    </div>
  );
}
