import type { Metadata } from "next";

import { SponsorShell } from "@/components/sponsor-shell";

export const metadata: Metadata = {
  title: { default: "Sponsor portal", template: "%s · Sponsor portal" },
  robots: { index: false, follow: false },
};

export default function SponsorLayout({ children }: { children: React.ReactNode }) {
  return <SponsorShell>{children}</SponsorShell>;
}
