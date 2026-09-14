"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";

import { useEventCtx } from "@/components/event-context";
import { Icon } from "@/components/icons";
import { Stars } from "@/components/lead-card";
import { useToast } from "@/components/toast";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Drawer,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Switch,
  Textarea,
  cn,
  errorMessage,
  type Tone,
} from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { fmtDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Sponsor, SponsorDetail, SponsorLead, SponsorStatus, SponsorTier } from "@/lib/types";

const TIERS: SponsorTier[] = ["platinum", "gold", "silver", "bronze", "exhibitor", "partner"];
const STATUS_TONE: Record<SponsorStatus, Tone> = { pending: "warning", approved: "success", rejected: "danger" };
type List = { items: Sponsor[]; counts: Record<string, number>; apply_url: string };
type Account = { login_email: string; temporary_password: string | null; emailed: boolean };

export default function SponsorsAdminPage() {
  const { event } = useEventCtx();
  const { t } = useI18n();
  const toast = useToast();
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const { data, error, mutate } = useSWR<List>(`/events/${event.id}/sponsors${status ? `?status=${status}` : ""}`, fetcher, { refreshInterval: 20000 });

  return (
    <div className="grid gap-5">
      <p className="max-w-3xl text-[14px] text-ink-500">{t.sponsors.admin.intro}</p>
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <span className="text-[13px] font-bold text-ink-900">{t.sponsors.admin.applyLink}</span>
        <div className="num flex h-10 min-w-0 flex-1 items-center overflow-x-auto rounded-lg border border-ink-200 bg-ink-50 px-3 text-[13px] text-navy" dir="ltr">
          {data?.apply_url ?? `/e/${event.slug}/sponsor`}
        </div>
        <Button size="sm" variant="secondary" icon="copy" onClick={async () => data && (await copyText(data.apply_url)) && toast(t.common.copied)}>
          {t.common.copy}
        </Button>
        <Button size="sm" icon="plus" onClick={() => setAddOpen(true)}>
          {t.sponsors.admin.addSponsor}
        </Button>
      </Card>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {["", "pending", "approved", "rejected"].map((f) => (
          <button
            key={f}
            onClick={() => setStatus(f)}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors",
              status === f ? "border-navy bg-navy text-white" : "border-ink-200 bg-white text-ink-700 hover:border-navy/40",
            )}
          >
            {f ? t.sponsors.status[f] : t.common.all}
            <span className={cn("num rounded-full px-1.5 text-[11.5px]", status === f ? "bg-white/20" : "bg-ink-100")}>{data?.counts[f || "all"] ?? "·"}</span>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {error && !data ? (
          <div className="p-5">
            <ErrorBox error={error} onRetry={() => mutate()} />
          </div>
        ) : !data ? (
          <div className="grid gap-2 p-5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState icon="team" title={t.sponsors.admin.empty} />
        ) : (
          <ul className="divide-y divide-hairline">
            {data.items.map((s) => (
              <li key={s.id}>
                <button onClick={() => setSelected(s.id)} className="flex w-full flex-wrap items-center gap-4 px-5 py-4 text-start transition-colors hover:bg-tint">
                  {s.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.logo_url} alt="" className="size-10 shrink-0 rounded-lg object-contain" />
                  ) : (
                    <Avatar name={s.company_name} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-bold text-ink-900">{s.company_name}</span>
                      <Badge tone={STATUS_TONE[s.status]}>{t.sponsors.status[s.status]}</Badge>
                      <Badge tone="navy">{t.sponsors.tiers[s.tier]}</Badge>
                      {s.booth_number && <span className="text-[12px] text-ink-500">{t.sponsors.booth} {s.booth_number}</span>}
                    </div>
                    <div className="text-[12.5px] text-ink-500">
                      {s.contact_name} · {s.contact_email}
                    </div>
                  </div>
                  <div className="flex gap-5 text-center">
                    <div>
                      <div className="num text-[18px] font-extrabold text-navy">{s.leads}</div>
                      <div className="text-[11px] font-bold text-ink-500">{t.sponsors.admin.leads}</div>
                    </div>
                    <div>
                      <div className="num text-[18px] font-extrabold text-navy">{s.members}</div>
                      <div className="text-[11px] font-bold text-ink-500">{t.sponsors.admin.membersCount}</div>
                    </div>
                  </div>
                  <Icon name="chevronRight" size={16} className="text-ink-300 rtl:rotate-180" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <SponsorDrawer key={selected ?? "none"} sponsorId={selected} onClose={() => setSelected(null)} onChanged={() => mutate()} onAccount={setAccount} />
      <AddSponsorModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(detail) => {
          setAddOpen(false);
          void mutate();
          toast(t.sponsors.admin.created);
          if (detail.account) setAccount(detail.account);
        }}
      />
      <AccountModal account={account} onClose={() => setAccount(null)} />
    </div>
  );
}

function AccountModal({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  return (
    <Modal open={account != null} onClose={onClose} title={t.users.tempTitle} size="sm" footer={<Button onClick={onClose}>{t.common.close}</Button>}>
      {account && (
        <div className="grid gap-3">
          <p className="text-[14px] text-ink-700">
            {t.sponsors.admin.loginEmail}: <strong dir="ltr">{account.login_email}</strong>
          </p>
          {account.temporary_password ? (
            <div className="flex items-center gap-2">
              <code className="num flex-1 rounded-lg bg-tint px-4 py-3 text-[18px] font-extrabold tracking-wide text-navy" dir="ltr">
                {account.temporary_password}
              </code>
              <Button variant="secondary" icon="copy" onClick={async () => (await copyText(account.temporary_password!)) && toast(t.common.copied)}>
                {t.common.copy}
              </Button>
            </div>
          ) : (
            <p className="text-[13px] text-ink-500">{t.users.tempBody}</p>
          )}
          <p className={cn("text-[13px] font-bold", account.emailed ? "text-success" : "text-warning")}>
            {account.emailed ? t.sponsors.admin.emailedLogin : t.sponsors.admin.notEmailed}
          </p>
        </div>
      )}
    </Modal>
  );
}

function SponsorDrawer({
  sponsorId,
  onClose,
  onChanged,
  onAccount,
}: {
  sponsorId: number | null;
  onClose: () => void;
  onChanged: () => void;
  onAccount: (a: Account) => void;
}) {
  const { event } = useEventCtx();
  const { t, locale } = useI18n();
  const toast = useToast();
  const base = `/events/${event.id}/sponsors/${sponsorId}`;
  const { data: s, error, mutate } = useSWR<SponsorDetail>(sponsorId ? base : null, fetcher);
  const { data: leads } = useSWR<SponsorLead[]>(sponsorId && s?.status === "approved" ? `${base}/leads` : null, fetcher);
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [tier, setTier] = useState<SponsorTier | "">("");
  const [booth, setBooth] = useState("");
  const [message, setMessage] = useState("");
  const [notify, setNotify] = useState(true);
  const [notes, setNotes] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function run(label: string, fn: () => Promise<unknown>, success?: string) {
    setBusy(label);
    try {
      const result = await fn();
      await mutate();
      onChanged();
      if (success) toast(success);
      return result;
    } catch (err) {
      toast(errorMessage(err, t, locale), "error");
    } finally {
      setBusy(null);
    }
  }
  const patch = (body: Record<string, unknown>) => run("patch", () => api(base, { method: "PATCH", body }), t.sponsors.admin.updated);

  async function decide() {
    if (!decision) return;
    const body = decision === "approve" ? { tier: tier || undefined, booth_number: booth || undefined, notify } : { message: message || undefined, notify };
    const res = (await run(decision, () => api<SponsorDetail>(`${base}/${decision}`, { method: "POST", body }), decision === "approve" ? t.sponsors.admin.approved : t.sponsors.admin.rejected)) as SponsorDetail | undefined;
    setDecision(null);
    if (res?.account) onAccount(res.account);
  }

  return (
    <Drawer
      open={sponsorId != null}
      onClose={onClose}
      title={s?.company_name ?? t.common.loading}
      subtitle={
        s && (
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[s.status]}>{t.sponsors.status[s.status]}</Badge>
            <Badge tone="navy">{t.sponsors.tiers[s.tier]}</Badge>
            <span className="num text-ink-500">{fmtDateTime(s.created_at, event.timezone, locale)}</span>
          </span>
        )
      }
    >
      {error ? (
        <ErrorBox error={error} onRetry={() => mutate()} />
      ) : !s ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="grid gap-6">
          {s.status === "pending" && (
            <div className="flex flex-wrap gap-2 rounded-2xl bg-warning-tint p-4">
              <Button icon="check" variant="success" onClick={() => { setTier(s.tier); setBooth(s.booth_number ?? ""); setDecision("approve"); }}>
                {t.sponsors.admin.approve}
              </Button>
              <Button icon="x" variant="secondary" onClick={() => setDecision("reject")}>
                {t.sponsors.admin.reject}
              </Button>
            </div>
          )}

          <section>
            <h3 className="text-[13px] font-extrabold text-ink-900">{t.sponsors.admin.contact}</h3>
            <dl className="mt-2 divide-y divide-hairline rounded-xl border border-hairline text-[13.5px]">
              {[
                [t.sponsors.contactName, s.contact_name],
                [t.sponsors.contactEmail, s.contact_email],
                [t.sponsors.contactMobile, s.contact_mobile],
                [t.sponsors.website, s.website ?? "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-ink-500">{label}</dt>
                  <dd className="num text-end font-bold text-ink-900" dir="auto">{value}</dd>
                </div>
              ))}
            </dl>
            {s.description && <p className="mt-2 text-[13.5px] text-ink-700">{s.description}</p>}
          </section>

          <section className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.sponsors.tierInterest} htmlFor="d-tier">
                <Select id="d-tier" value={s.tier} onChange={(e) => patch({ tier: e.target.value })}>
                  {TIERS.map((x) => (
                    <option key={x} value={x}>{t.sponsors.tiers[x]}</option>
                  ))}
                </Select>
              </Field>
              <Field label={t.sponsors.admin.boothNumber} htmlFor="d-booth">
                <Input id="d-booth" defaultValue={s.booth_number ?? ""} onBlur={(e) => e.target.value !== (s.booth_number ?? "") && patch({ booth_number: e.target.value })} />
              </Field>
            </div>
            <Switch checked={s.show_publicly} onChange={(v) => patch({ show_publicly: v })} label={t.sponsors.admin.showPublicly} disabled={s.status !== "approved"} />
            <div>
              <label className="text-[13px] font-extrabold text-ink-900" htmlFor="d-notes">{t.sponsors.admin.notes}</label>
              <Textarea id="d-notes" className="mt-1.5 min-h-20" value={notes ?? s.notes ?? ""} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes != null && notes !== (s.notes ?? "") && patch({ notes })} />
            </div>
          </section>

          <section>
            <h3 className="text-[13px] font-extrabold text-ink-900">{t.sponsors.portal.team}</h3>
            <ul className="mt-2 grid gap-1.5">
              {s.members_list.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-hairline px-3.5 py-2.5 text-[13.5px]">
                  <span className="font-bold text-ink-900">{m.full_name}</span>
                  {m.is_contact && <Badge tone="navy">{t.sponsors.portal.contactBadge}</Badge>}
                  {m.portal_access && <Badge tone="teal">{t.sponsors.portal.hasAccess}</Badge>}
                  <span className="text-ink-500">{m.email}</span>
                  <a href={m.badge_url} target="_blank" rel="noopener noreferrer" className="ms-auto text-[12.5px] font-bold text-action hover:underline">
                    {t.sponsors.badgeTitle}
                  </a>
                </li>
              ))}
            </ul>
          </section>

          {s.status === "approved" && (
            <>
              <section className="flex flex-wrap gap-2">
                <a href={s.booth_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-[13px] font-bold text-navy hover:bg-tint">
                  <Icon name="qr" size={15} />
                  {t.sponsors.portal.booth}
                </a>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="lock"
                  loading={busy === "resend"}
                  title={t.sponsors.admin.resendHint}
                  onClick={async () => {
                    const res = (await run("resend", () => api<Account>(`${base}/resend`, { method: "POST" }), t.sponsors.admin.credsSent)) as Account | undefined;
                    if (res) onAccount(res);
                  }}
                >
                  {t.sponsors.admin.resendCreds}
                </Button>
              </section>
              <section>
                <h3 className="text-[13px] font-extrabold text-ink-900">
                  {t.sponsors.admin.leads} <span className="num text-ink-500">({leads?.length ?? s.leads})</span>
                </h3>
                {!leads ? (
                  <Skeleton className="mt-2 h-16" />
                ) : leads.length === 0 ? (
                  <p className="mt-2 text-[13.5px] text-ink-500">{t.sponsors.admin.noLeads}</p>
                ) : (
                  <ul className="mt-2 max-h-72 divide-y divide-hairline overflow-y-auto rounded-xl border border-hairline">
                    {leads.map((l) => (
                      <li key={l.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[13px]">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-bold text-ink-900">{l.attendee.full_name}</div>
                          <div className="text-[12px] text-ink-500">
                            {t.sponsors.portal.methods[l.method]} · <span className="num">{fmtDateTime(l.captured_at, event.timezone, locale)}</span>
                          </div>
                        </div>
                        <Stars value={l.rating} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}

          <section className="border-t border-hairline pt-5">
            {confirmDelete ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-danger-tint p-3 text-[13px] text-danger">
                <span className="flex-1 font-medium">{t.sponsors.admin.deleteHint} {t.common.cantUndo}</span>
                <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>{t.common.cancel}</Button>
                <Button variant="danger" size="sm" loading={busy === "delete"} onClick={async () => { await run("delete", () => api(base, { method: "DELETE" }), t.sponsors.admin.deleted); onClose(); }}>
                  {t.common.delete}
                </Button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" icon="trash" className="text-danger" onClick={() => setConfirmDelete(true)}>
                {t.common.delete}
              </Button>
            )}
          </section>
        </div>
      )}

      <Modal
        open={decision != null}
        onClose={() => setDecision(null)}
        title={decision === "approve" ? t.sponsors.admin.approveTitle : t.sponsors.admin.rejectTitle}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDecision(null)}>{t.common.cancel}</Button>
            <Button variant={decision === "approve" ? "success" : "danger"} loading={busy === decision} onClick={decide}>
              {decision === "approve" ? t.sponsors.admin.approve : t.sponsors.admin.reject}
            </Button>
          </>
        }
      >
        {decision === "approve" ? (
          <div className="grid gap-4">
            <p className="text-[13.5px] text-ink-500">{t.sponsors.admin.approveHint}</p>
            <Field label={t.sponsors.tierInterest} htmlFor="a-tier">
              <Select id="a-tier" value={tier} onChange={(e) => setTier(e.target.value as SponsorTier)}>
                {TIERS.map((x) => (
                  <option key={x} value={x}>{t.sponsors.tiers[x]}</option>
                ))}
              </Select>
            </Field>
            <Field label={t.sponsors.admin.boothNumber} optional htmlFor="a-booth">
              <Input id="a-booth" value={booth} onChange={(e) => setBooth(e.target.value)} />
            </Field>
            <Checkbox checked={notify} onChange={setNotify} label={t.sponsors.admin.notify} />
          </div>
        ) : (
          <div className="grid gap-4">
            <Field label={t.sponsors.admin.rejectMessage} htmlFor="r-msg">
              <Textarea id="r-msg" value={message} onChange={(e) => setMessage(e.target.value)} />
            </Field>
            <Checkbox checked={notify} onChange={setNotify} label={t.sponsors.admin.notify} />
          </div>
        )}
      </Modal>
    </Drawer>
  );
}

function AddSponsorModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (s: SponsorDetail) => void }) {
  const { event } = useEventCtx();
  const { t, locale } = useI18n();
  const empty = { company_name: "", company_name_ar: "", tier: "exhibitor" as SponsorTier, booth_number: "", website: "", description: "", contact_name: "", contact_email: "", contact_mobile: "", notify: true };
  const [v, setV] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const err = (key: string) => (errors[key] ? t.fieldErrors[errors[key]] ?? t.fieldErrors.invalid : null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      const res = await api<SponsorDetail>(`/events/${event.id}/sponsors`, {
        method: "POST",
        body: { ...v, consent: true, website: v.website || null, description: v.description || null, company_name_ar: v.company_name_ar || null, booth_number: v.booth_number || null },
      });
      setV(empty);
      onCreated(res);
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
      title={t.sponsors.admin.addSponsor}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t.common.cancel}</Button>
          <Button type="submit" form="add-sponsor" loading={busy}>{t.sponsors.admin.addSponsor}</Button>
        </>
      }
    >
      <form id="add-sponsor" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <p className="text-[13.5px] text-ink-500 sm:col-span-2">{t.sponsors.admin.addIntro}</p>
        <Field label={t.sponsors.company} error={err("company_name")} htmlFor="n-company">
          <Input id="n-company" required autoFocus value={v.company_name} onChange={(e) => setV({ ...v, company_name: e.target.value })} />
        </Field>
        <Field label={t.sponsors.companyAr} optional htmlFor="n-company-ar">
          <Input id="n-company-ar" dir="rtl" lang="ar" value={v.company_name_ar} onChange={(e) => setV({ ...v, company_name_ar: e.target.value })} />
        </Field>
        <Field label={t.sponsors.tierInterest} htmlFor="n-tier">
          <Select id="n-tier" value={v.tier} onChange={(e) => setV({ ...v, tier: e.target.value as SponsorTier })}>
            {TIERS.map((x) => (
              <option key={x} value={x}>{t.sponsors.tiers[x]}</option>
            ))}
          </Select>
        </Field>
        <Field label={t.sponsors.admin.boothNumber} optional htmlFor="n-booth">
          <Input id="n-booth" value={v.booth_number} onChange={(e) => setV({ ...v, booth_number: e.target.value })} />
        </Field>
        <Field label={t.sponsors.website} optional error={err("website")} htmlFor="n-web">
          <Input id="n-web" type="url" dir="ltr" placeholder="https://" value={v.website} onChange={(e) => setV({ ...v, website: e.target.value })} />
        </Field>
        <Field label={t.sponsors.description} optional htmlFor="n-desc">
          <Input id="n-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
        </Field>
        <Field label={t.sponsors.contactName} error={err("contact_name")} htmlFor="n-name">
          <Input id="n-name" required value={v.contact_name} onChange={(e) => setV({ ...v, contact_name: e.target.value })} />
        </Field>
        <Field label={t.sponsors.contactEmail} error={err("contact_email") ?? err("email")} htmlFor="n-email">
          <Input id="n-email" type="email" dir="ltr" required value={v.contact_email} onChange={(e) => setV({ ...v, contact_email: e.target.value })} />
        </Field>
        <Field label={t.sponsors.contactMobile} error={err("contact_mobile")} htmlFor="n-mobile">
          <Input id="n-mobile" type="tel" dir="ltr" required value={v.contact_mobile} onChange={(e) => setV({ ...v, contact_mobile: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Checkbox checked={v.notify} onChange={(val) => setV({ ...v, notify: val })} label={t.sponsors.admin.notify} />
        </div>
        {formError && <p className="text-[13.5px] font-medium text-danger sm:col-span-2">{formError}</p>}
      </form>
    </Modal>
  );
}
