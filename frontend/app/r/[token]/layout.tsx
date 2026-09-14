import type { Metadata } from "next";

// Personal pages: keep them out of search engines and link previews.
export const metadata: Metadata = {
  title: "Attendance pass",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function PassLayout({ children }: { children: React.ReactNode }) {
  return children;
}
