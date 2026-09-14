"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";

import { useAdminUser } from "@/components/admin-shell";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/toast";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  cn,
  errorMessage,
} from "@/components/ui";
import { ApiError, api, fetcher } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { fmtDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Role, User } from "@/lib/types";

const ROLES: Role[] = ["staff", "admin", "super_admin"];
const TZ = "Asia/Riyadh";

export default function UsersPage() {
  const me = useAdminUser();
  const { t, locale } = useI18n();
  const toast = useToast();
  const { data: users, error, mutate } = useSWR<User[]>(me.role === "super_admin" ? "/users" : null, fetcher);
  const [createOpen, setCreateOpen] = useState(false);
  const [temp, setTemp] = useState<{ user: User; password: string; emailed: boolean } | null>(null);

  if (me.role !== "super_admin") {
    return (
      <Card>
        <EmptyState icon="lock" title={t.common.forbidden} />
      </Card>
    );
  }

  async function update(user: User, body: Partial<Pick<User, "role" | "is_active">>) {
    try {
      await api(`/users/${user.id}`, { method: "PATCH", body });
      toast(t.users.updated);
      await mutate();
    } catch (err) {
      toast(errorMessage(err, t, locale), "error");
    }
  }

  async function resetPassword(user: User) {
    if (!window.confirm(t.users.resetConfirm)) return;
    try {
      const res = await api<{ user: User; temporary_password: string; email_sent: boolean }>(`/users/${user.id}/reset-password`, {
        method: "POST",
      });
      setTemp({ user: res.user, password: res.temporary_password, emailed: res.email_sent });
    } catch (err) {
      toast(errorMessage(err, t, locale), "error");
    }
  }

  return (
    <>
      <PageHeader
        title={t.users.title}
        subtitle={t.users.intro}
        actions={
          <Button icon="plus" onClick={() => setCreateOpen(true)}>
            {t.users.new}
          </Button>
        }
      />

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        {ROLES.map((r) => (
          <div key={r} className="rounded-xl border border-hairline bg-white p-4">
            <div className="text-[13px] font-extrabold text-navy">{t.roles[r]}</div>
            <p className="mt-1 text-[12.5px] text-ink-500">{t.roleHelp[r]}</p>
          </div>
        ))}
      </div>

      <Card className="overflow-hidden">
        {error ? (
          <div className="p-5">
            <ErrorBox error={error} onRetry={() => mutate()} />
          </div>
        ) : !users ? (
          <div className="grid gap-2 p-5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {users.map((u) => {
              const isMe = u.id === me.id;
              return (
                <li key={u.id} className={cn("flex flex-wrap items-center gap-4 px-5 py-4", !u.is_active && "bg-ink-50")}>
                  <Avatar name={u.full_name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[14px] font-bold text-ink-900">{u.full_name}</span>
                      {isMe && <Badge tone="info">{t.users.you}</Badge>}
                      {!u.is_active && <Badge tone="danger">{t.users.inactive}</Badge>}
                    </div>
                    <div className="text-[12.5px] text-ink-500">
                      {u.email} · {t.users.lastLogin}: {u.last_login_at ? fmtDateTime(u.last_login_at, TZ, locale) : t.users.never}
                    </div>
                  </div>
                  <div className="w-40">
                    <Select
                      value={u.role}
                      disabled={isMe}
                      onChange={(e) => update(u, { role: e.target.value as Role })}
                      aria-label={t.users.role}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t.roles[r]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="flex gap-1.5">
                    <Button variant="ghost" size="sm" icon="lock" onClick={() => resetPassword(u)}>
                      {t.users.resetPassword}
                    </Button>
                    {!isMe && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className={u.is_active ? "text-danger" : ""}
                        onClick={() => update(u, { is_active: !u.is_active })}
                      >
                        {u.is_active ? t.users.deactivate : t.users.activate}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(user, password, emailed) => {
          setCreateOpen(false);
          void mutate();
          toast(t.users.created);
          if (password) setTemp({ user, password, emailed });
        }}
      />

      <Modal
        open={temp != null}
        onClose={() => setTemp(null)}
        title={t.users.tempTitle}
        size="sm"
        footer={<Button onClick={() => setTemp(null)}>{t.common.close}</Button>}
      >
        {temp && (
          <div className="grid gap-3">
            <p className="text-[14px] text-ink-700">
              <strong>{temp.user.full_name}</strong> · {temp.user.email}
            </p>
            <div className="flex items-center gap-2">
              <code className="num flex-1 rounded-lg bg-tint px-4 py-3 text-[18px] font-extrabold tracking-wide text-navy" dir="ltr">
                {temp.password}
              </code>
              <Button variant="secondary" icon="copy" onClick={async () => (await copyText(temp.password)) && toast(t.common.copied)}>
                {t.common.copy}
              </Button>
            </div>
            <p className="text-[13px] text-ink-500">{t.users.tempBody}</p>
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

function CreateUserModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (user: User, password: string | null, emailed: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const [v, setV] = useState({ full_name: "", email: "", role: "staff" as Role, password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      const res = await api<{ user: User; temporary_password: string | null; email_sent: boolean }>("/users", {
        method: "POST",
        body: { ...v, password: v.password || null },
      });
      setV({ full_name: "", email: "", role: "staff", password: "" });
      onCreated(res.user, res.temporary_password, res.email_sent);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields);
      else setFormError(errorMessage(err, t, locale));
    } finally {
      setBusy(false);
    }
  }

  const err = (key: string) => (errors[key] ? t.fieldErrors[errors[key]] ?? t.fieldErrors.invalid : null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.users.new}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button type="submit" form="create-user" loading={busy}>
            {t.common.create}
          </Button>
        </>
      }
    >
      <form id="create-user" onSubmit={submit} className="grid gap-4">
        <Field label={t.users.name} error={err("full_name")} htmlFor="u-name">
          <Input id="u-name" required value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} autoFocus />
        </Field>
        <Field label={t.users.email} error={err("email")} htmlFor="u-email">
          <Input id="u-email" type="email" dir="ltr" required value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        </Field>
        <fieldset>
          <legend className="text-[13px] font-bold text-ink-900">{t.users.role}</legend>
          <div className="mt-2 grid gap-2">
            {ROLES.map((r) => (
              <label
                key={r}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-xl border p-3.5 transition-colors",
                  v.role === r ? "border-action bg-tint" : "border-ink-200 hover:border-navy/30",
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value={r}
                  checked={v.role === r}
                  onChange={() => setV({ ...v, role: r })}
                  className="mt-1 accent-[#004d99]"
                />
                <span>
                  <span className="block text-[14px] font-bold text-ink-900">{t.roles[r]}</span>
                  <span className="block text-[12.5px] text-ink-500">{t.roleHelp[r]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label={t.users.passwordOptional} hint={t.users.passwordHint} error={err("password")} htmlFor="u-pass">
          <Input
            id="u-pass"
            type="password"
            dir="ltr"
            autoComplete="new-password"
            minLength={10}
            value={v.password}
            onChange={(e) => setV({ ...v, password: e.target.value })}
          />
        </Field>
        {formError && <p className="text-[13.5px] font-medium text-danger">{formError}</p>}
      </form>
    </Modal>
  );
}
