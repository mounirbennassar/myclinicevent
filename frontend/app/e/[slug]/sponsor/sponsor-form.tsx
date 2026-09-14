"use client";

import { useState, type FormEvent } from "react";

import { Icon } from "@/components/icons";
import { Button, Checkbox, Field, Input, Select, Textarea, errorMessage } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { SponsorTier } from "@/lib/types";

const TIERS: SponsorTier[] = ["platinum", "gold", "silver", "bronze", "exhibitor", "partner"];

export function SponsorForm({ slug }: { slug: string }) {
  const { t, locale } = useI18n();
  const [v, setV] = useState({
    company_name: "", company_name_ar: "", website: "", description: "", tier: "exhibitor" as SponsorTier,
    contact_name: "", contact_email: "", contact_mobile: "", consent: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const set = <K extends keyof typeof v>(key: K, value: (typeof v)[K]) => {
    setV((f) => ({ ...f, [key]: value }));
    setErrors(({ [key]: _removed, ...rest }) => rest);
  };
  const err = (key: string) => (errors[key] ? t.fieldErrors[errors[key]] ?? t.fieldErrors.invalid : null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (v.company_name.trim().length < 2) local.company_name = "required";
    if (v.contact_name.trim().length < 2) local.contact_name = "required";
    if (!v.contact_email.trim()) local.contact_email = "required";
    if (!v.contact_mobile.trim()) local.contact_mobile = "required";
    if (!v.consent) local.consent = "consent_required";
    if (Object.keys(local).length) return setErrors(local);
    setBusy(true);
    setFormError(null);
    try {
      const res = await api<{ company_name: string }>(`/public/events/${slug}/sponsors/apply`, {
        method: "POST",
        body: { ...v, website: v.website.trim() || null, description: v.description.trim() || null, company_name_ar: v.company_name_ar.trim() || null },
      });
      setDone(res.company_name);
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fields).length) setErrors(error.fields);
      else if (error instanceof ApiError && error.code === "sponsorship_closed") setFormError(t.sponsors.closed);
      else setFormError(errorMessage(error, t, locale));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-hairline/80 bg-white p-10 text-center shadow-raised">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-success-tint text-success">
          <Icon name="check" size={26} />
        </div>
        <h2 className="mt-4 text-[22px] font-extrabold">{t.sponsors.applied}</h2>
        <p className="mx-auto mt-2 max-w-md text-[14.5px] text-ink-700">{t.sponsors.appliedBody(done)}</p>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-hairline/80 bg-white p-6 shadow-raised sm:p-8">
      <p className="max-w-3xl text-[14px] text-ink-500">{t.sponsors.applyIntro}</p>
      <form onSubmit={submit} noValidate className="mt-6 grid gap-5 sm:grid-cols-2">
        <Field label={t.sponsors.company} error={err("company_name")} htmlFor="sp-company">
          <Input id="sp-company" value={v.company_name} onChange={(e) => set("company_name", e.target.value)} invalid={!!errors.company_name} />
        </Field>
        <Field label={t.sponsors.companyAr} optional htmlFor="sp-company-ar">
          <Input id="sp-company-ar" dir="rtl" lang="ar" value={v.company_name_ar} onChange={(e) => set("company_name_ar", e.target.value)} />
        </Field>
        <Field label={t.sponsors.tierInterest} htmlFor="sp-tier">
          <Select id="sp-tier" value={v.tier} onChange={(e) => set("tier", e.target.value as SponsorTier)}>
            {TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {t.sponsors.tiers[tier]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.sponsors.website} optional error={err("website")} htmlFor="sp-web">
          <Input id="sp-web" type="url" dir="ltr" placeholder="https://" value={v.website} onChange={(e) => set("website", e.target.value)} invalid={!!errors.website} />
        </Field>
        <Field label={t.sponsors.description} optional hint={t.sponsors.descriptionHint} htmlFor="sp-desc" className="sm:col-span-2">
          <Textarea id="sp-desc" value={v.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <Field label={t.sponsors.contactName} error={err("contact_name")} htmlFor="sp-name">
          <Input id="sp-name" autoComplete="name" value={v.contact_name} onChange={(e) => set("contact_name", e.target.value)} invalid={!!errors.contact_name} />
        </Field>
        <Field label={t.sponsors.contactEmail} hint={t.sponsors.contactEmailHint} error={err("contact_email")} htmlFor="sp-email">
          <Input id="sp-email" type="email" dir="ltr" autoComplete="email" value={v.contact_email} onChange={(e) => set("contact_email", e.target.value)} invalid={!!errors.contact_email} />
        </Field>
        <Field label={t.sponsors.contactMobile} hint={t.public.fields.mobile_hint} error={err("contact_mobile")} htmlFor="sp-mobile">
          <Input id="sp-mobile" type="tel" dir="ltr" placeholder="05XXXXXXXX" value={v.contact_mobile} onChange={(e) => set("contact_mobile", e.target.value)} invalid={!!errors.contact_mobile} />
        </Field>
        <div className="sm:col-span-2">
          <Checkbox id="sp-consent" checked={v.consent} onChange={(val) => set("consent", val)} label={t.sponsors.consent} invalid={!!errors.consent} />
          {errors.consent && <p className="ms-8 mt-1.5 text-[12.5px] font-medium text-danger">{err("consent")}</p>}
        </div>
        {formError && (
          <p className="flex items-start gap-2 rounded-xl bg-danger-tint p-4 text-[14px] font-medium text-danger sm:col-span-2">
            <Icon name="alert" className="mt-0.5 shrink-0" />
            {formError}
          </p>
        )}
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" size="lg" loading={busy} className="sm:min-w-56">
            {busy ? t.sponsors.submitting : t.sponsors.submit}
          </Button>
        </div>
      </form>
    </section>
  );
}
