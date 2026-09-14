import type { Metadata } from "next";

import { LandingPage } from "@/components/landing/landing-page";
import { getLocale } from "@/lib/i18n/server";
import { serverApi } from "@/lib/server-api";
import type { PublicEvent } from "@/lib/types";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const title =
    locale === "ar"
      ? "فعاليات عيادتي والتعليم الطبي المستمر"
      : "Medical Events & Continuing Education";
  const description =
    locale === "ar"
      ? "استكشف فعاليات عيادتي التعليمية للممارسين الصحيين. اطّلع على البرامج وساعات التعليم الطبي وسجّل في فعاليتك القادمة."
      : "Discover My Clinic educational events for healthcare professionals. Explore programmes, CME information, and register for your next learning experience.";
  return {
    title,
    description,
    alternates: { canonical: "/" },
    openGraph: {
      title,
      description,
      type: "website",
      images: [
        {
          url: "/images/myclinic/reception.webp",
          width: 1200,
          height: 800,
          alt: "My Clinic Educational",
        },
      ],
    },
  };
}

export default async function Home() {
  let events: PublicEvent[] = [];
  let failed = false;
  try {
    events =
      (await serverApi<PublicEvent[]>("/public/events?include_past=true")) ??
      [];
  } catch {
    failed = true;
  }
  return <LandingPage events={events} failed={failed} />;
}
