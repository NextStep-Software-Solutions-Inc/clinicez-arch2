import { Metadata } from "next";
import { joinApiUrl } from "@shared/safe";
import { PricingClient } from "./_components/PricingClient";
import { absoluteUrl } from "@/config/site";
import { BillingPlan, BillingPublicConfig } from "@/services/billing.service";
import { getPortalApiUrl } from "@/utils/urls";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Pricing | Clinic EZ",
  description: "Simple, transparent pricing for healthcare management.",
  keywords: ["pricing", "software cost", "healthcare IT cost", "Clinic EZ pricing", "EMR subscription"],
  openGraph: {
    title: "Pricing | Clinic EZ",
    description: "Simple, transparent pricing for healthcare management.",
    url: absoluteUrl("/pricing"),
    siteName: "Clinic EZ",
    images: [
      {
        url: absoluteUrl("/og-pricing.png"),
        width: 1200,
        height: 630,
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing | Clinic EZ",
    description: "Simple, transparent pricing for healthcare management.",
    images: [absoluteUrl("/og-pricing.png")],
  },
};

async function fetchInitialPricingData(): Promise<{
  plans: BillingPlan[];
  publicConfig: BillingPublicConfig | null;
}> {
  const apiUrl = getPortalApiUrl();
  const [plansResult, configResult] = await Promise.allSettled([
    fetch(joinApiUrl(apiUrl, "/billing/plans"), {
      next: { revalidate: 60 },
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    }),
    fetch(joinApiUrl(apiUrl, "/billing/public-config"), {
      next: { revalidate: 60 },
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    }),
  ]);

  let plans: BillingPlan[] = [];
  if (plansResult.status === "fulfilled" && plansResult.value.ok) {
    const json = await plansResult.value.json().catch(() => []);
    if (Array.isArray(json)) {
      plans = json;
    }
  }

  let publicConfig: BillingPublicConfig | null = null;
  if (configResult.status === "fulfilled" && configResult.value.ok) {
    publicConfig = await configResult.value.json().catch(() => null);
  }

  return { plans, publicConfig };
}

export default async function PricingPage() {
  const { plans, publicConfig } = await fetchInitialPricingData();
  return <PricingClient initialPlans={plans} initialPublicConfig={publicConfig} />;
}
