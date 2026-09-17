"use client";

import { ChangePasswordForm } from "@/components/change-password";
import { useMember } from "@/components/member-shell";
import { Avatar, Card, PageHeader } from "@/components/ui";
import { fmtLocalDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export default function MemberAccountPage() {
  const { user, profile } = useMember();
  const { t, locale } = useI18n();
  const since = fmtLocalDate(profile.member_since.slice(0, 10), locale, { year: "numeric", month: "long" });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={t.account.title} />
      <Card className="flex items-center gap-4 p-5">
        <Avatar name={user.full_name} className="size-12 text-[18px]" />
        <div>
          <div className="text-[16px] font-extrabold text-navy">{user.full_name}</div>
          <div className="text-[13px] text-ink-500">
            <span dir="ltr">{user.email}</span> · {t.member.memberSince(since)}
          </div>
        </div>
      </Card>
      <div className="mt-5">
        <ChangePasswordForm />
      </div>
    </div>
  );
}
