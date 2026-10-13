import React from "react";
import type { Metadata } from "next";
import { queueDisplayService } from "@/services/queueDisplay.service";
import QueueDisplayClient from "@/components/queue-display/QueueDisplayClient";

interface QueueTvPageProps {
  params: Promise<{ facilitySlug: string }>;
}

export async function generateMetadata({
  params,
}: QueueTvPageProps): Promise<Metadata> {
  const { facilitySlug } = await params;
  return {
    title: `Public TV Display | ${facilitySlug}`,
    description: "Public Waiting Area TV Queue Display Board for ClinicEZ.",
  };
}

export default async function QueueTvPage({ params }: QueueTvPageProps) {
  const { facilitySlug } = await params;

  const res = await queueDisplayService.getDisplayData({
    facilitySlug,
  });

  return (
    <QueueDisplayClient
      initialData={res.success ? res.data : undefined}
      facilitySlug={facilitySlug}
    />
  );
}
