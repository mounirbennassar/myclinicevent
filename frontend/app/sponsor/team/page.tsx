"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";

import { Icon } from "@/components/icons";
import { useSponsor } from "@/components/sponsor-shell";
import { useToast } from "@/components/toast";
import { Avatar, Badge, Button, Card, Checkbox, EmptyState, ErrorBox, Field, Input, Modal, PageHeader, Skeleton, errorMessage } from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { useI18n } from "@/lib/i18n";
import type { SponsorMember } from "@/lib/types";

type Created = { member: SponsorMember; temporary_password: string | null; emailed: boolean };

export default function SponsorTeamPage() {
  const { user, refresh } = useSponsor();
  const { t, locale } = useI18n();
  const toast = useToast();
  const { data: members, error, mutate } = useSWR<SponsorMember[]>("/sponsor/members", fetcher);
  const [addOpen, setAddOpen] = useState(false);
  const [temp, setTemp] = useState<Created | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  async function act(id: number, fn: () => Promise<unknown>, success: string) {
    setBusy(id);
    try {
      await fn();
      toast(success);
      await mutate();
      refresh();
    } catch (err) {
      toast(errorMessage(err, t, locale), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title={t.sponsors.portal.team}
        subtitle={t.sponsors.portal.teamIntro}
        actions={
          <Button icon="plus" onClick={() => setAddOpen(true)}>
            {t.sponsors.portal.addMember}
          </Button>
        }
      />
      <Card className="overflow-hidden">
        {error ? (
          <div className="p-5">
            <ErrorBox error={error} onRetry={() => mutate()} />
          </div>
        ) : !members ? (
          <div className="grid gap-2 p-5">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : members.length === 0 ? (
          <EmptyState icon="team" title={t.team.empty} />
        ) : (
          <ul className="divide-y divide-hairline">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <Avatar name={m.full_name} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-bold text-ink-900">{m.full_name}</span>
                    {m.is_contact && <Badge tone="navy">{t.sponsors.portal.contactBadge}</Badge>}
                    {m.portal_access && <Badge tone="teal">{t.sponsors.portal.hasAccess}</Badge>}
                  </div>
                  <div className="text-[12.5px] text-ink-500">
                    {m.email}
                    {m.title && ` · ${m.title}`}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <a href={m.badge_url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-[13px] font-bold text-navy hover:bg-tint">
                    <Icon name="qr" size={15} />
                    {t.sponsors.badgeTitle}
                  </a>
                  <Button variant="secondary" size="sm" icon="copy" onClick={async () => (await copyText(m.badge_url)) && toast(t.common.copied)}>
                    {t.common.copy}
                  </Button>
                  <Button variant="secondary" size="sm" icon="mail" loading={busy === m.id} onClick={() => act(m.id, () => api(`/sponsor/members/${m.id}/resend`, { method: "POST" }), t.sponsors.portal.badgeSent)}>
                    {t.sponsors.portal.resendBadge}
                  </Button>
                  {!m.portal_access && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="lock"
                      loading={busy === m.id}
                      onClick={() =>
                        act(
                          m.id,
                          async () => {
                            const res = await api<Created>(`/sponsor/members/${m.id}/portal-access`, { method: "POST" });
                            if (res.temporary_password) setTemp(res);
                          },
                          t.sponsors.portal.accessGranted,
                        )
                      }
                    >
                      {t.sponsors.portal.grantAccess}
                    </Button>
                  )}
                  {!m.is_contact && m.email !== user.email && (
                    <Button variant="ghost" size="sm" icon="trash" className="text-danger" loading={busy === m.id} onClick={() => act(m.id, () => api(`/sponsor/members/${m.id}`, { method: "DELETE" }), t.team.removed)}>
                      {t.sponsors.portal.removeMember}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <AddMemberModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(res) => {
          setAddOpen(false);
          void mutate();
          refresh();
          toast(t.sponsors.portal.memberAdded);
          if (res.temporary_password) setTemp(res);
        }}
      />

      <Modal open={temp != null} onClose={() => setTemp(null)} title={t.sponsors.portal.tempTitle} size="sm" footer={<Button onClick={() => setTemp(null)}>{t.common.close}</Button>}>
        {temp && (
          <div className="grid gap-3">
            <p className="text-[14px] text-ink-700">
              <strong>{temp.member.full_name}</strong> · {temp.member.email}
            </p>
            <div className="flex items-center gap-2">
              <code className="num flex-1 rounded-lg bg-tint px-4 py-3 text-[18px] font-extrabold tracking-wide text-navy" dir="ltr">
                {temp.temporary_password}
              </code>
              <Button variant="secondary" icon="copy" onClick={async () => (await copyText(temp.temporary_password!)) && toast(t.common.copied)}>
                {t.common.copy}
              </Button>
            </div>
            <p className="text-[13px] text-ink-500">{t.sponsors.portal.tempBody}</p>
            {temp.emailed && (
              <p className="flex items-center gap-2 text-[13px] font-bold text-success">
                <Icon name="mail" size={15} />
                {t.users.emailed}
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

function AddMemberModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (res: Created) => void }) {
  const { t, locale } = useI18n();
  const [v, setV] = useState({ full_name: "", email: "", mobile: "", title: "", portal_access: false, notify: true });
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
      const res = await api<Created>("/sponsor/members", { method: "POST", body: { ...v, mobile: v.mobile || null, title: v.title || null } });
      setV({ full_name: "", email: "", mobile: "", title: "", portal_access: false, notify: true });
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
      title={t.sponsors.portal.addMember}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button type="submit" form="add-member" loading={busy}>
            {t.sponsors.portal.addMember}
          </Button>
        </>
      }
    >
      <form id="add-member" onSubmit={submit} className="grid gap-4">
        <Field label={t.sponsors.portal.memberName} error={err("contact_name")} htmlFor="m-name">
          <Input id="m-name" required autoFocus value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} />
        </Field>
        <Field label={t.sponsors.portal.memberEmail} error={err("contact_email") ?? err("email")} htmlFor="m-email">
          <Input id="m-email" type="email" dir="ltr" required value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.sponsors.portal.memberMobile} optional error={err("contact_mobile")} htmlFor="m-mobile">
            <Input id="m-mobile" type="tel" dir="ltr" value={v.mobile} onChange={(e) => setV({ ...v, mobile: e.target.value })} />
          </Field>
          <Field label={t.sponsors.portal.memberTitle} optional htmlFor="m-title">
            <Input id="m-title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
          </Field>
        </div>
        <Checkbox checked={v.portal_access} onChange={(val) => setV({ ...v, portal_access: val })} label={t.sponsors.portal.portalAccess} />
        <Checkbox checked={v.notify} onChange={(val) => setV({ ...v, notify: val })} label={t.sponsors.portal.notifyMember} />
        {formError && <p className="text-[13.5px] font-medium text-danger">{formError}</p>}
      </form>
    </Modal>
  );
}
