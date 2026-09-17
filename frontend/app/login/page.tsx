"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState, type FormEvent } from "react";

import { AuthShell } from "@/components/auth-shell";
import { Icon } from "@/components/icons";
import { Button, Field, Input, errorMessage } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { User } from "@/lib/types";

/** Only follow same-site paths after sign-in. */
function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
}

/** Members may return to their portal or to a public event page, never to a team screen. */
function memberNext(next: string | undefined): string {
  const ok = next && !next.startsWith("//") && (next.startsWith("/member") || next.startsWith("/e/"));
  return ok ? next : "/member";
}

export default function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = use(searchParams);
  const { t, locale } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = await api<User>("/auth/login", { method: "POST", body: { email, password } });
      if (user.role === "member") {
        router.replace(memberNext(next));
      } else if (user.role === "sponsor") {
        router.replace(user.must_change_password ? "/sponsor/account?required=1" : "/sponsor");
      } else {
        router.replace(user.must_change_password ? "/admin/account?required=1" : safeNext(next));
      }
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, t, locale));
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t.auth.signIn} intro={t.auth.signInIntro} aside={t.auth.signInIntro}>
      <form onSubmit={submit} className="grid gap-5">
        <Field label={t.auth.email} htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="username"
            dir="ltr"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label={t.auth.password} htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            dir="ltr"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && (
          <p className="flex items-start gap-2 rounded-lg bg-danger-tint px-3.5 py-3 text-[13.5px] font-medium text-danger" role="alert">
            <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}
        <Button type="submit" size="lg" loading={busy}>
          {busy ? t.auth.signingIn : t.auth.signIn}
        </Button>
        <Link href="/forgot-password" className="text-center text-[14px] font-bold text-action hover:underline">
          {t.auth.forgot}
        </Link>
        <p className="border-t border-hairline pt-5 text-center text-[14px] text-ink-500">
          {t.auth.noAccount}{" "}
          <Link
            href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
            className="font-bold text-action hover:underline"
          >
            {t.auth.becomeMember}
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
