"use client";

import { useRouter } from "next/navigation";
import { use } from "react";

import { useAdminUser } from "@/components/admin-shell";
import { ChangePasswordForm } from "@/components/change-password";
import { Icon } from "@/components/icons";
import { Avatar, Card, PageHeader } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

export default function AccountPage({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const { required } = use(searchParams);
  const user = useAdminUser();
  const { t } = useI18n();
  const router = useRouter();
  const mustChange = user.must_change_password || required === "1";

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t.account.title} />
      {mustChange && (
        <div className="mb-5 flex items-start gap-3 rounded-xl bg-warning-tint p-4 text-[14px] font-bold text-warning">
          <Icon name="lock" className="mt-0.5 shrink-0" />
          {t.account.mustChange}
        </div>
      )}
      <Card className="flex items-center gap-4 p-5">
        <Avatar name={user.full_name} className="size-12 text-[18px]" />
        <div>
          <div className="text-[16px] font-extrabold text-navy">{user.full_name}</div>
          <div className="text-[13px] text-ink-500">
            {user.email} · {t.roles[user.role]}
          </div>
        </div>
      </Card>
      <div className="mt-5">
        <ChangePasswordForm onChanged={() => mustChange && router.replace("/admin")} />
      </div>
    </div>
  );
}
