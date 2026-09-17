"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useRef, useState, type FormEvent } from "react";
import { mutate } from "swr";

import { AuthShell } from "@/components/auth-shell";
import { Icon } from "@/components/icons";
import { Button, Checkbox, Field, Input, Select, errorMessage } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { PROFESSIONS } from "@/lib/professions";
import type { MemberMe } from "@/lib/types";

const REQUIRED = ["full_name", "email", "mobile", "scfhs_number", "national_id", "password"] as const;
const FIELD_ORDER = [...REQUIRED, "profession", "consent"];

type Form = {
  full_name: string;
  email: string;
  mobile: string;
  scfhs_number: string;
  national_id: string;
  profession: string;
  password: string;
  consent: boolean;
  sponsor_consent: boolean;
};

const EMPTY: Form = {
  full_name: "",
  email: "",
  mobile: "",
  scfhs_number: "",
  national_id: "",
  profession: "",
  password: "",
  consent: false,
  sponsor_consent: false,
};

/** After sign-up a member may continue to their portal or back to the event page they came from. */
function safeNext(next: string | undefined): string {
  const ok = next && !next.startsWith("//") && (next.startsWith("/member") || next.startsWith("/e/"));
  return ok ? next : "/member";
}

export default function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = use(searchParams);
  const { t, locale } = useI18n();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((current) => {
      const rest = { ...current };
      delete rest[key];
      return rest;
    });
  };
  const err = (key: string) => (errors[key] ? (t.fieldErrors[errors[key]] ?? t.fieldErrors.invalid) : null);

  function localCheck(): Record<string, string> {
    const e: Record<string, string> = {};
    for (const key of REQUIRED) if (!form[key].trim()) e[key] = "required";
    if (!e.full_name && form.full_name.trim().split(/\s+/).length < 3) e.full_name = "name_three_parts";
    if (!e.password && form.password.length < 10) e.password = "password_short";
    if (!form.consent) e.consent = "consent_required";
    return e;
  }

  function focusFirstError(keys: string[]) {
    const first = FIELD_ORDER.find((k) => keys.includes(k));
    if (first) formRef.current?.querySelector<HTMLElement>(`#su-${first}`)?.focus();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const local = localCheck();
    if (Object.keys(local).length) {
      setErrors(local);
      focusFirstError(Object.keys(local));
      return;
    }
    setBusy(true);
    try {
      const me = await api<MemberMe>("/member/signup", {
        method: "POST",
        body: { ...form, profession: form.profession || null },
      });
      // Seed the session caches so the portal doesn't flash the sign-in redirect.
      await mutate("/auth/me", me.user, { revalidate: false });
      await mutate("/member/me", me, { revalidate: false });
      router.replace(safeNext(next));
      router.refresh();
    } catch (error) {
      setBusy(false);
      if (error instanceof ApiError && Object.keys(error.fields).length) {
        setErrors(error.fields);
        focusFirstError(Object.keys(error.fields));
        if (error.code !== "validation") setFormError(errorMessage(error, t, locale));
      } else {
        setFormError(errorMessage(error, t, locale));
      }
    }
  }

  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <AuthShell title={t.member.signupTitle} intro={t.member.signupIntro} aside={t.member.signupAside} wide>
      <form ref={formRef} onSubmit={submit} noValidate className="grid gap-5 sm:grid-cols-2">
        <Field
          label={t.public.fields.full_name}
          hint={t.public.fields.full_name_hint}
          error={err("full_name")}
          htmlFor="su-full_name"
          className="sm:col-span-2"
        >
          <Input
            id="su-full_name"
            autoComplete="name"
            autoFocus
            value={form.full_name}
            onChange={(e) => set("full_name", e.target.value)}
            invalid={!!errors.full_name}
          />
        </Field>
        <Field label={t.public.fields.email} error={err("email")} htmlFor="su-email">
          <Input
            id="su-email"
            type="email"
            inputMode="email"
            autoComplete="username"
            dir="ltr"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            invalid={!!errors.email}
          />
        </Field>
        <Field label={t.public.fields.mobile} hint={t.public.fields.mobile_hint} error={err("mobile")} htmlFor="su-mobile">
          <Input
            id="su-mobile"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            placeholder="05XXXXXXXX"
            value={form.mobile}
            onChange={(e) => set("mobile", e.target.value)}
            invalid={!!errors.mobile}
          />
        </Field>
        <Field label={t.public.fields.scfhs_number} error={err("scfhs_number")} htmlFor="su-scfhs_number">
          <Input
            id="su-scfhs_number"
            dir="ltr"
            autoCapitalize="characters"
            value={form.scfhs_number}
            onChange={(e) => set("scfhs_number", e.target.value)}
            invalid={!!errors.scfhs_number}
          />
        </Field>
        <Field label={t.public.fields.national_id} error={err("national_id")} htmlFor="su-national_id">
          <Input
            id="su-national_id"
            inputMode="numeric"
            dir="ltr"
            maxLength={10}
            value={form.national_id}
            onChange={(e) => set("national_id", e.target.value)}
            invalid={!!errors.national_id}
          />
        </Field>
        <Field label={t.public.fields.profession} optional error={err("profession")} htmlFor="su-profession">
          <Select
            id="su-profession"
            value={form.profession}
            onChange={(e) => set("profession", e.target.value)}
            invalid={!!errors.profession}
          >
            <option value="">{t.public.fields.choose}</option>
            {PROFESSIONS.map((p) => (
              <option key={p} value={p}>
                {t.professions[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.member.password} hint={t.member.passwordHint} error={err("password")} htmlFor="su-password">
          <Input
            id="su-password"
            type="password"
            autoComplete="new-password"
            dir="ltr"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            invalid={!!errors.password}
          />
        </Field>

        <div className="sm:col-span-2">
          <Checkbox
            id="su-consent"
            checked={form.consent}
            onChange={(v) => set("consent", v)}
            label={t.member.consent}
            invalid={!!errors.consent}
          />
          {errors.consent && <p className="ms-8 mt-1.5 text-[12.5px] font-medium text-danger">{err("consent")}</p>}
        </div>
        <div className="sm:col-span-2">
          <Checkbox
            id="su-sponsor-consent"
            checked={form.sponsor_consent}
            onChange={(v) => set("sponsor_consent", v)}
            label={t.member.sponsorConsent}
          />
          <p className="ms-8 mt-1 text-[12px] text-ink-500">{t.member.sponsorConsentHint}</p>
        </div>

        {formError && (
          <p
            className="flex items-start gap-2 rounded-lg bg-danger-tint px-3.5 py-3 text-[13.5px] font-medium text-danger sm:col-span-2"
            role="alert"
          >
            <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
            <span>
              {formError}{" "}
              {errors.email === "account_exists" && (
                <Link href={loginHref} className="font-bold underline">
                  {t.auth.signIn}
                </Link>
              )}
            </span>
          </p>
        )}

        <Button type="submit" size="lg" loading={busy} className="sm:col-span-2">
          {busy ? t.member.creating : t.member.createAccount}
        </Button>
        <p className="text-center text-[14px] text-ink-500 sm:col-span-2">
          {t.member.haveAccount}{" "}
          <Link href={loginHref} className="font-bold text-action hover:underline">
            {t.auth.signIn}
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
