import type { Metadata } from "next";
import { EventsPage } from "@/components/landing/events-page";
import { getLocale } from "@/lib/i18n/server";
import { serverApi } from "@/lib/server-api";
import type { PublicEvent } from "@/lib/types";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const title = locale === "ar" ? "الفعاليات الطبية" : "Medical Events";
  const description =
    locale === "ar"
      ? "تصفّح فعاليات عيادتي القادمة والسابقة في المملكة العربية السعودية. ابحث عن البرامج العلمية، واطّلع على التفاصيل وسجّل حضورك."
      : "Browse upcoming and past My Clinic medical events in Saudi Arabia. Explore scientific programmes, CME details and registration.";
  return {
    title,
    description,
    alternates: { canonical: "/events" },
    openGraph: { title, description, type: "website" },
  };
}

export default async function Events() {
  let events: PublicEvent[] = [];
  let failed = false;
  try {
    events =
      (await serverApi<PublicEvent[]>("/public/events?include_past=true")) ??
      [];
  } catch {
    failed = true;
  }
  return <EventsPage events={events} failed={failed} />;
}
