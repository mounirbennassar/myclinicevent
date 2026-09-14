"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState, type FormEvent } from "react";

import { AuthShell } from "@/components/auth-shell";
import { Button, Field, Input, errorMessage } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = use(searchParams);
  const { t, locale } = useI18n();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 10) return setError(t.auth.minLength);
    if (password !== confirm) return setError(t.auth.mismatch);
    setError(null);
    setBusy(true);
    try {
      await api("/auth/reset-password", { method: "POST", body: { token: token ?? "", new_password: password } });
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      setBusy(false);
      setError(err instanceof ApiError && err.code === "reset_link_invalid" ? t.auth.invalidLink : errorMessage(err, t, locale));
    }
  }

  return (
    <AuthShell title={t.auth.resetTitle}>
      {!token ? (
        <p className="rounded-xl bg-danger-tint p-4 text-[14px] font-medium text-danger">{t.auth.invalidLink}</p>
      ) : (
        <form onSubmit={submit} className="grid gap-5">
          <Field label={t.auth.newPassword} hint={t.auth.minLength} htmlFor="new">
            <Input
              id="new"
              type="password"
              autoComplete="new-password"
              dir="ltr"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label={t.auth.confirmPassword} htmlFor="confirm">
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              dir="ltr"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          {error && <p className="text-[13.5px] font-medium text-danger">{error}</p>}
          <Button type="submit" size="lg" loading={busy}>
            {t.auth.setPassword}
          </Button>
        </form>
      )}
      <Link href="/forgot-password" className="mt-6 block text-center text-[14px] font-bold text-action hover:underline">
        {t.auth.forgotTitle}
      </Link>
    </AuthShell>
  );
}
