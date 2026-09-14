"use client";

import { useState, type FormEvent } from "react";

import { ApiError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { RegistrationDetail } from "@/lib/types";

import { useToast } from "./toast";
import { Button, Checkbox, Field, Input, Modal, Select, errorMessage } from "./ui";

const PROFESSIONS = ["consultant", "specialist", "resident", "gp", "nurse", "pharmacist", "dentist", "allied_health", "student", "other"];
const EMPTY = { full_name: "", email: "", mobile: "", scfhs_number: "", national_id: "", profession: "", consent: false };

/** Registration at the desk for someone who didn't sign up online. */
export function WalkinModal({
  eventId,
  open,
  onClose,
  onCreated,
}: {
  eventId: number;
  open: boolean;
  onClose: () => void;
  onCreated: (registration: RegistrationDetail) => void;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors(({ [key]: _removed, ...rest }) => rest);
  };
  const err = (key: string) => (errors[key] ? t.fieldErrors[errors[key]] ?? t.fieldErrors.invalid : null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      const reg = await api<RegistrationDetail>(`/events/${eventId}/registrations`, {
        method: "POST",
        body: { ...form, profession: form.profession || null },
      });
      toast(t.attendees.walkinCreated);
      setForm(EMPTY);
      onCreated(reg);
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fields).length) setErrors(error.fields);
      else setFormError(errorMessage(error, t, locale));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.attendees.walkinTitle}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button type="submit" form="walkin-form" loading={busy} icon="plus">
            {t.attendees.addWalkin}
          </Button>
        </>
      }
    >
      <form id="walkin-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <p className="text-[13.5px] text-ink-500 sm:col-span-2">{t.attendees.walkinIntro}</p>
        <Field label={t.public.fields.full_name} error={err("full_name")} htmlFor="w-name" className="sm:col-span-2">
          <Input id="w-name" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} invalid={!!errors.full_name} autoFocus />
        </Field>
        <Field label={t.public.fields.email} error={err("email")} htmlFor="w-email">
          <Input id="w-email" type="email" dir="ltr" value={form.email} onChange={(e) => set("email", e.target.value)} invalid={!!errors.email} />
        </Field>
        <Field label={t.public.fields.mobile} error={err("mobile")} htmlFor="w-mobile">
          <Input id="w-mobile" type="tel" dir="ltr" placeholder="05XXXXXXXX" value={form.mobile} onChange={(e) => set("mobile", e.target.value)} invalid={!!errors.mobile} />
        </Field>
        <Field label={t.public.fields.scfhs_number} error={err("scfhs_number")} htmlFor="w-scfhs">
          <Input id="w-scfhs" dir="ltr" value={form.scfhs_number} onChange={(e) => set("scfhs_number", e.target.value)} invalid={!!errors.scfhs_number} />
        </Field>
        <Field label={t.public.fields.national_id} error={err("national_id")} htmlFor="w-nid">
          <Input id="w-nid" inputMode="numeric" dir="ltr" maxLength={10} value={form.national_id} onChange={(e) => set("national_id", e.target.value)} invalid={!!errors.national_id} />
        </Field>
        <Field label={t.public.fields.profession} optional htmlFor="w-prof" className="sm:col-span-2">
          <Select id="w-prof" value={form.profession} onChange={(e) => set("profession", e.target.value)}>
            <option value="">{t.public.fields.choose}</option>
            {PROFESSIONS.map((p) => (
              <option key={p} value={p}>
                {t.professions[p]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Checkbox checked={form.consent} onChange={(v) => set("consent", v)} label={t.public.fields.consent} invalid={!!errors.consent} />
          {errors.consent && <p className="ms-8 mt-1.5 text-[12.5px] font-medium text-danger">{err("consent")}</p>}
        </div>
        {formError && <p className="text-[13.5px] font-medium text-danger sm:col-span-2">{formError}</p>}
      </form>
    </Modal>
  );
}
