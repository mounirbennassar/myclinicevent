import type { Metadata } from "next";

import { MemberShell } from "@/components/member-shell";

export const metadata: Metadata = {
  title: { default: "Member portal", template: "%s · Member portal" },
  robots: { index: false, follow: false },
};

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return <MemberShell>{children}</MemberShell>;
}
