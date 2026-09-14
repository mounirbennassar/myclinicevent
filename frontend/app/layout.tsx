import type { Metadata, Viewport } from "next";
import { Montserrat, Manrope, Poppins, Tajawal } from "next/font/google";

import { ToastProvider } from "@/components/toast";
import { I18nProvider } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

import "./globals.css";

// Montserrat stands in for Gothman and Tajawal for GE SS Two, per the My Clinic design system.
const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
});
const tajawal = Tajawal({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "700", "800"],
  variable: "--font-tajawal",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  // Production address; makes Open Graph and canonical URLs absolute.
  metadataBase: new URL(
    process.env.PUBLIC_BASE_URL ?? "https://event.myclinic.com.sa",
  ),
  title: {
    default: "My Clinic Educational",
    template: "%s · My Clinic Educational",
  },
  description:
    "Continuing medical education events by My Clinic: registration, attendance and CME certificates.",
};

export const viewport: Viewport = {
  themeColor: "#003868",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className={`${montserrat.variable} ${tajawal.variable} ${manrope.variable} ${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <I18nProvider locale={locale}>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
