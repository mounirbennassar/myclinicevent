import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sponsor badge", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function BadgeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
