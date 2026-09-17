"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { Icon } from "@/components/icons";
import { Button, Checkbox, Field, Input, Modal, Select, errorMessage } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { MemberRegistration, PublicEvent, User } from "@/lib/types";

const PROFESSIONS = ["consultant", "specialist", "resident", "gp", "nurse", "pharmacist", "dentist", "allied_health", "student", "other"];
const REQUIRED = ["full_name", "email", "mobile", "scfhs_number", "national_id"] as const;

type Form = {
  full_name: string;
  email: string;
  mobile: string;
  scfhs_number: string;
  national_id: string;
  profession: string;
  consent: boolean;
  sponsor_consent: boolean;
};

const EMPTY: Form = {
  full_name: "", email: "", mobile: "", scfhs_number: "", national_id: "", profession: "", consent: false, sponsor_consent: false,
};

export function RegistrationForm({ event }: { event: PublicEvent }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [findOpen, setFindOpen] = useState(false);

  const { data: me } = useMe();
  const state = event.registration_state ?? "open";
  const canRegister = state === "open" || event.is_preview;

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors(({ [key]: _removed, ...rest }) => rest);
  };
  const err = (key: string) => (errors[key] ? t.fieldErrors[errors[key]] ?? t.fieldErrors.invalid : null);

  function localCheck(): Record<string, string> {
    const e: Record<string, string> = {};
    for (const key of REQUIRED) if (!form[key].trim()) e[key] = "required";
    if (!e.full_name && form.full_name.trim().split(/\s+/).length < 3) e.full_name = "name_three_parts";
    if (!form.consent) e.consent = "consent_required";
    return e;
  }

  function focusFirstError(keys: string[]) {
    const first = [...REQUIRED, "profession", "consent"].find((k) => keys.includes(k));
    if (first) formRef.current?.querySelector<HTMLElement>(`#reg-${first}`)?.focus();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setDuplicate(false);
    const local = localCheck();
    if (Object.keys(local).length) {
      setErrors(local);
      focusFirstError(Object.keys(local));
      return;
    }
    setSubmitting(true);
    try {
      const res = await api<{ access_token: string }>(`/public/events/${event.slug}/register`, {
        method: "POST",
        body: { ...form, profession: form.profession || null },
      });
      router.push(`/r/${res.access_token}?welcome=1`);
    } catch (error) {
      setSubmitting(false);
      if (error instanceof ApiError) {
        if (Object.keys(error.fields).length) {
          setErrors(error.fields);
          focusFirstError(Object.keys(error.fields));
        }
        if (error.code === "duplicate") setDuplicate(true);
        else if (!Object.keys(error.fields).length) setFormError(errorMessage(error, t, locale));
      } else {
        setFormError(t.common.error);
      }
    }
  }

  if (!canRegister) {
    return (
      <section className="rounded-2xl border border-hairline/80 bg-white p-8 text-center shadow-card">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-tint text-navy">
          <Icon name="lock" size={24} />
        </div>
        <p className="mt-4 text-[17px] font-extrabold text-navy">{t.public.states[state]}</p>
        <button onClick={() => setFindOpen(true)} className="mt-4 text-[14px] font-bold text-action hover:underline">
          {t.public.already} {t.public.findPass}
        </button>
        <FindPassModal open={findOpen} onClose={() => setFindOpen(false)} slug={event.slug} />
      </section>
    );
  }

  // Members never fill in the form: their saved details are used.
  if (me?.role === "member" && state === "open") return <MemberApply event={event} user={me} />;

  const here = `/e/${event.slug}`;
  return (
    <section className="rounded-2xl border border-hairline/80 bg-white p-6 shadow-card sm:p-8">
      {!me && (
        <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-tint px-4 py-3 text-[13.5px] font-medium text-navy">
          <Icon name="sparkle" size={16} className="shrink-0" />
          <span className="flex-1">{t.member.guestHint}</span>
          <Link href={`/login?next=${encodeURIComponent(here)}`} className="font-bold text-action hover:underline">
            {t.member.guestSignIn}
          </Link>
          <Link href={`/signup?next=${encodeURIComponent(here)}`} className="font-bold text-action hover:underline">
            {t.member.guestJoin}
          </Link>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[20px] font-extrabold">{t.public.formTitle}</h3>
          <p className="mt-1 text-[13.5px] text-ink-500">{t.public.formIntro}</p>
        </div>
        {event.seats_left != null && (
          <span className="rounded-full bg-tint px-3 py-1 text-[12.5px] font-bold text-navy">
            {t.public.seatsLeft(event.seats_left)}
          </span>
        )}
      </div>

      <form ref={formRef} onSubmit={submit} noValidate className="mt-6 grid gap-5 sm:grid-cols-2">
        <Field
          label={t.public.fields.full_name}
          hint={t.public.fields.full_name_hint}
          error={err("full_name")}
          htmlFor="reg-full_name"
          className="sm:col-span-2"
        >
          <Input
            id="reg-full_name"
            autoComplete="name"
            value={form.full_name}
            onChange={(e) => set("full_name", e.target.value)}
            invalid={!!errors.full_name}
          />
        </Field>
        <Field label={t.public.fields.email} error={err("email")} htmlFor="reg-email">
          <Input
            id="reg-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            dir="ltr"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            invalid={!!errors.email}
          />
        </Field>
        <Field label={t.public.fields.mobile} hint={t.public.fields.mobile_hint} error={err("mobile")} htmlFor="reg-mobile">
          <Input
            id="reg-mobile"
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
        <Field label={t.public.fields.scfhs_number} error={err("scfhs_number")} htmlFor="reg-scfhs_number">
          <Input
            id="reg-scfhs_number"
            dir="ltr"
            autoCapitalize="characters"
            value={form.scfhs_number}
            onChange={(e) => set("scfhs_number", e.target.value)}
            invalid={!!errors.scfhs_number}
          />
        </Field>
        <Field label={t.public.fields.national_id} error={err("national_id")} htmlFor="reg-national_id">
          <Input
            id="reg-national_id"
            inputMode="numeric"
            dir="ltr"
            maxLength={10}
            value={form.national_id}
            onChange={(e) => set("national_id", e.target.value)}
            invalid={!!errors.national_id}
          />
        </Field>
        <Field
          label={t.public.fields.profession}
          optional
          error={err("profession")}
          htmlFor="reg-profession"
          className="sm:col-span-2"
        >
          <Select
            id="reg-profession"
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
            id="reg-consent"
            checked={form.consent}
            onChange={(v) => set("consent", v)}
            label={t.public.fields.consent}
            invalid={!!errors.consent}
          />
          {errors.consent && <p className="ms-8 mt-1.5 text-[12.5px] font-medium text-danger">{err("consent")}</p>}
        </div>
        {(event.sponsors?.length ?? 0) > 0 && (
          <div className="sm:col-span-2">
            <Checkbox
              id="reg-sponsor-consent"
              checked={form.sponsor_consent}
              onChange={(v) => set("sponsor_consent", v)}
              label={t.sponsors.regConsent}
            />
            <p className="ms-8 mt-1 text-[12px] text-ink-500">{t.sponsors.regConsentHint}</p>
          </div>
        )}

        {duplicate && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-info-tint p-4 text-[14px] font-medium text-info sm:col-span-2">
            <Icon name="info" className="shrink-0" />
            <span className="flex-1">{t.fieldErrors.already_registered}</span>
            <button type="button" className="font-bold underline" onClick={() => setFindOpen(true)}>
              {t.public.findPass}
            </button>
          </div>
        )}
        {formError && (
          <div className="flex items-start gap-3 rounded-xl bg-danger-tint p-4 text-[14px] font-medium text-danger sm:col-span-2">
            <Icon name="alert" className="mt-0.5 shrink-0" />
            {formError}
          </div>
        )}

        <div className="flex flex-col-reverse items-stretch gap-4 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={() => setFindOpen(true)} className="text-[14px] font-bold text-action hover:underline">
            {t.public.already} {t.public.findPass}
          </button>
          <Button type="submit" size="lg" loading={submitting} className="sm:min-w-56">
            {submitting ? t.public.submitting : t.public.submit}
          </Button>
        </div>
      </form>
      <FindPassModal open={findOpen} onClose={() => setFindOpen(false)} slug={event.slug} />
    </section>
  );
}

/** One-click registration for a signed-in member, using the details saved on their membership. */
function MemberApply({ event, user }: { event: PublicEvent; user: User }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ registration: MemberRegistration; already_registered: boolean }>(
        `/member/events/${event.slug}/apply`,
        { method: "POST", body: {} },
      );
      router.push(`/r/${res.registration.access_token}${res.already_registered ? "" : "?welcome=1"}`);
    } catch (err) {
      setBusy(false);
      setError(errorMessage(err, t, locale));
    }
  }

  return (
    <section className="rounded-2xl border border-hairline/80 bg-white p-6 shadow-card sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[20px] font-extrabold">{t.public.formTitle}</h3>
          <p className="mt-1 text-[13.5px] text-ink-500">{t.member.applyAsMemberIntro}</p>
        </div>
        {event.seats_left != null && (
          <span className="rounded-full bg-tint px-3 py-1 text-[12.5px] font-bold text-navy">
            {t.public.seatsLeft(event.seats_left)}
          </span>
        )}
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-tint p-4">
        <div className="min-w-0 text-[14px]">
          <div className="font-extrabold text-navy">{t.member.signedInAs(user.full_name)}</div>
          <div className="text-ink-500" dir="ltr">
            {user.email}
          </div>
        </div>
        <Button size="lg" onClick={apply} loading={busy} icon="check" className="sm:min-w-56">
          {busy ? t.member.applying : t.member.applyAsMember}
        </Button>
      </div>
      {error && (
        <div className="mt-4 flex items-start gap-3 rounded-xl bg-danger-tint p-4 text-[14px] font-medium text-danger" role="alert">
          <Icon name="alert" className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[13.5px] font-bold">
        <Link href="/member" className="text-action hover:underline">
          {t.member.portalTitle}
        </Link>
        <Link href="/member/profile" className="text-action hover:underline">
          {t.member.navProfile}
        </Link>
      </div>
    </section>
  );
}

function FindPassModal({ open, onClose, slug }: { open: boolean; onClose: () => void; slug: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [values, setValues] = useState({ email: "", national_id: "", mobile: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function find(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ access_token: string }>(`/public/events/${slug}/find`, { method: "POST", body: values });
      router.push(`/r/${res.access_token}`);
    } catch (err) {
      setBusy(false);
      setError(err instanceof ApiError && err.status === 404 ? t.public.findNotFound : errorMessage(err, t, locale));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t.public.findTitle} size="sm">
      <form onSubmit={find} className="grid gap-4">
        <p className="text-[14px] text-ink-500">{t.public.findIntro}</p>
        <Field label={t.public.fields.email} htmlFor="find-email">
          <Input
            id="find-email"
            type="email"
            dir="ltr"
            required
            value={values.email}
            onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
          />
        </Field>
        <Field label={t.public.fields.national_id} htmlFor="find-id">
          <Input
            id="find-id"
            inputMode="numeric"
            dir="ltr"
            required
            value={values.national_id}
            onChange={(e) => setValues((v) => ({ ...v, national_id: e.target.value }))}
          />
        </Field>
        <Field label={t.public.fields.mobile} htmlFor="find-mobile">
          <Input
            id="find-mobile"
            type="tel"
            dir="ltr"
            required
            value={values.mobile}
            onChange={(e) => setValues((v) => ({ ...v, mobile: e.target.value }))}
          />
        </Field>
        {error && <p className="text-[13px] font-medium text-danger">{error}</p>}
        <Button type="submit" loading={busy}>
          {t.public.findPass}
        </Button>
      </form>
    </Modal>
  );
}
