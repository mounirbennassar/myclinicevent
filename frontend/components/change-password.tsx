"use client";

import { useState, type FormEvent } from "react";
import { mutate } from "swr";

import { ApiError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { User } from "@/lib/types";

import { useToast } from "./toast";
import { Button, Card, Field, Input, errorMessage } from "./ui";

/** Change-password form shared by the admin and sponsor account pages. */
export function ChangePasswordForm({ onChanged }: { onChanged?: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next.length < 10) return setError(t.auth.minLength);
    if (next !== confirm) return setError(t.auth.mismatch);
    setError(null);
    setBusy(true);
    try {
      const updated = await api<User>("/auth/change-password", { method: "POST", body: { current_password: current, new_password: next } });
      await mutate("/auth/me", updated, { revalidate: false });
      toast(t.account.changed);
      setCurrent("");
      setNext("");
      setConfirm("");
      onChanged?.();
    } catch (err) {
      setError(
        err instanceof ApiError && err.fields.current_password
          ? t.fieldErrors.wrong_password
          : err instanceof ApiError && err.fields.new_password
            ? t.fieldErrors[err.fields.new_password] ?? t.auth.minLength
            : errorMessage(err, t, locale),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="text-[16px] font-extrabold">{t.account.changePassword}</h2>
      <form onSubmit={submit} className="mt-5 grid gap-4">
        <Field label={t.account.current} htmlFor="cur">
          <Input id="cur" type="password" dir="ltr" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label={t.auth.newPassword} hint={t.auth.minLength} htmlFor="new">
          <Input id="new" type="password" dir="ltr" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label={t.auth.confirmPassword} htmlFor="confirm">
          <Input id="confirm" type="password" dir="ltr" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {error && <p className="text-[13.5px] font-medium text-danger">{error}</p>}
        <div>
          <Button type="submit" loading={busy}>
            {t.auth.setPassword}
          </Button>
        </div>
      </form>
    </Card>
  );
}
