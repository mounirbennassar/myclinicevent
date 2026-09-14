"use client";

import { useState, type FormEvent } from "react";

import { useSponsor } from "@/components/sponsor-shell";
import { useToast } from "@/components/toast";
import { Button, Card, Field, Input, PageHeader, Textarea, errorMessage } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function SponsorProfilePage() {
  const { me, refresh } = useSponsor();
  const { t, locale } = useI18n();
  const toast = useToast();
  const s = me.sponsor;
  const [v, setV] = useState({
    company_name_ar: s.company_name_ar ?? "",
    website: s.website ?? "",
    logo_url: s.logo_url ?? "",
    description: s.description ?? "",
    description_ar: s.description_ar ?? "",
    contact_mobile: s.contact_mobile,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const err = (key: string) => (errors[key] ? t.fieldErrors[errors[key]] ?? t.fieldErrors.invalid : null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      await api("/sponsor/profile", { method: "PATCH", body: v });
      refresh();
      toast(t.sponsors.portal.saved);
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fields).length) setErrors(error.fields);
      else toast(errorMessage(error, t, locale), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t.sponsors.portal.profileTitle} subtitle={t.sponsors.portal.profileIntro} />
      <Card className="p-6">
        <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
          <Field label={t.sponsors.company} className="sm:col-span-2">
            <Input value={s.company_name} disabled />
          </Field>
          <Field label={t.sponsors.companyAr} optional htmlFor="p-ar">
            <Input id="p-ar" dir="rtl" lang="ar" value={v.company_name_ar} onChange={(e) => setV({ ...v, company_name_ar: e.target.value })} />
          </Field>
          <Field label={t.sponsors.contactMobile} error={err("contact_mobile")} htmlFor="p-mobile">
            <Input id="p-mobile" type="tel" dir="ltr" value={v.contact_mobile} onChange={(e) => setV({ ...v, contact_mobile: e.target.value })} />
          </Field>
          <Field label={t.sponsors.website} optional error={err("website")} htmlFor="p-web">
            <Input id="p-web" type="url" dir="ltr" placeholder="https://" value={v.website} onChange={(e) => setV({ ...v, website: e.target.value })} />
          </Field>
          <Field label={t.sponsors.portal.logoUrl} optional hint={t.sponsors.portal.logoHint} error={err("logo_url")} htmlFor="p-logo">
            <div className="flex items-center gap-3">
              <Input id="p-logo" type="url" dir="ltr" placeholder="https://" value={v.logo_url} onChange={(e) => setV({ ...v, logo_url: e.target.value })} />
              {v.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.logo_url} alt="" className="size-11 shrink-0 rounded-lg border border-hairline object-contain" />
              )}
            </div>
          </Field>
          <Field label={t.sponsors.description} optional hint={t.sponsors.descriptionHint} htmlFor="p-desc">
            <Textarea id="p-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
          </Field>
          <Field label={`${t.sponsors.description} (${t.common.language === "English" ? "عربي" : "Arabic"})`} optional htmlFor="p-desc-ar">
            <Textarea id="p-desc-ar" dir="rtl" lang="ar" value={v.description_ar} onChange={(e) => setV({ ...v, description_ar: e.target.value })} />
          </Field>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" loading={busy}>
              {t.common.save}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
