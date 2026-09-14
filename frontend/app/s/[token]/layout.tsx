import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sponsor booth", robots: { index: false, follow: false } };

export default function BoothLayout({ children }: { children: React.ReactNode }) {
  return children;
}
