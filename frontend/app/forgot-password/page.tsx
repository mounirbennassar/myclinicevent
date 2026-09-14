"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { AuthShell } from "@/components/auth-shell";
import { Icon } from "@/components/icons";
import { Button, Field, Input, errorMessage } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function ForgotPasswordPage() {
  const { t, locale } = useI18n();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("/auth/forgot-password", { method: "POST", body: { email } });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err, t, locale));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t.auth.forgotTitle} intro={sent ? undefined : t.auth.forgotIntro}>
      {sent ? (
        <div className="flex gap-3 rounded-xl bg-success-tint p-4 text-[14px] text-success">
          <Icon name="mail" className="shrink-0" />
          <p className="font-medium">{t.auth.linkSent}</p>
        </div>
      ) : (
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
          {error && <p className="text-[13.5px] font-medium text-danger">{error}</p>}
          <Button type="submit" size="lg" loading={busy}>
            {t.auth.sendLink}
          </Button>
        </form>
      )}
      <Link href="/login" className="mt-6 block text-center text-[14px] font-bold text-action hover:underline">
        {t.auth.backToLogin}
      </Link>
    </AuthShell>
  );
}
