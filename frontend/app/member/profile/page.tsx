"use client";

import { useState, type FormEvent } from "react";
import { mutate as mutateGlobal } from "swr";

import { useMember } from "@/components/member-shell";
import { useToast } from "@/components/toast";
import { Button, Card, Checkbox, Field, Input, PageHeader, Select, errorMessage } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { PROFESSIONS } from "@/lib/professions";
import type { MemberMe } from "@/lib/types";

export default function MemberProfilePage() {
  const { profile, refresh } = useMember();
  const { t, locale } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState({
    full_name: profile.full_name,
    mobile: profile.mobile,
    scfhs_number: profile.scfhs_number,
    national_id: profile.national_id,
    profession: profile.profession ?? "",
    sponsor_consent: profile.sponsor_consent,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((current) => {
      const rest = { ...current };
      delete rest[key];
      return rest;
    });
  };
  const err = (key: string) => (errors[key] ? (t.fieldErrors[errors[key]] ?? t.fieldErrors.invalid) : null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const me = await api<MemberMe>("/member/profile", {
        method: "PATCH",
        body: { ...form, profession: form.profession || null },
      });
      await mutateGlobal("/auth/me", me.user, { revalidate: false });
      refresh();
      toast(t.member.saved);
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fields).length) setErrors(error.fields);
      else toast(errorMessage(error, t, locale), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t.member.profileTitle} subtitle={t.member.profileIntro} />
      <Card className="p-5 sm:p-6">
        <form onSubmit={save} noValidate className="grid gap-5 sm:grid-cols-2">
          <Field
            label={t.public.fields.full_name}
            hint={t.public.fields.full_name_hint}
            error={err("full_name")}
            htmlFor="mp-full_name"
            className="sm:col-span-2"
          >
            <Input
              id="mp-full_name"
              autoComplete="name"
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
              invalid={!!errors.full_name}
            />
          </Field>
          <Field label={t.public.fields.email} hint={t.member.emailLocked} htmlFor="mp-email" className="sm:col-span-2">
            <Input id="mp-email" type="email" dir="ltr" value={profile.email} disabled readOnly />
          </Field>
          <Field label={t.public.fields.mobile} hint={t.public.fields.mobile_hint} error={err("mobile")} htmlFor="mp-mobile">
            <Input
              id="mp-mobile"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              value={form.mobile}
              onChange={(e) => set("mobile", e.target.value)}
              invalid={!!errors.mobile}
            />
          </Field>
          <Field label={t.public.fields.scfhs_number} error={err("scfhs_number")} htmlFor="mp-scfhs_number">
            <Input
              id="mp-scfhs_number"
              dir="ltr"
              value={form.scfhs_number}
              onChange={(e) => set("scfhs_number", e.target.value)}
              invalid={!!errors.scfhs_number}
            />
          </Field>
          <Field label={t.public.fields.national_id} error={err("national_id")} htmlFor="mp-national_id">
            <Input
              id="mp-national_id"
              inputMode="numeric"
              dir="ltr"
              maxLength={10}
              value={form.national_id}
              onChange={(e) => set("national_id", e.target.value)}
              invalid={!!errors.national_id}
            />
          </Field>
          <Field label={t.public.fields.profession} optional error={err("profession")} htmlFor="mp-profession">
            <Select
              id="mp-profession"
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
          <div className="sm:col-span-2">
            <Checkbox
              id="mp-sponsor-consent"
              checked={form.sponsor_consent}
              onChange={(v) => set("sponsor_consent", v)}
              label={t.member.sponsorConsent}
            />
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" loading={busy}>
              {busy ? t.common.saving : t.common.save}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
