import React, { Suspense } from "react";
import { PractitionerConfirmClient } from "./PractitionerConfirmClient";

export const metadata = {
  title: "Confirm Practitioner Affiliation | Clinic EZ",
  description:
    "Confirm your clinical practice affiliation to be listed in the Clinic EZ Patient App directory.",
};

interface PractitionerVerifyPageProps {
  searchParams?: Promise<{
    token?: string;
    [key: string]: string | undefined;
  }>;
}

export default async function PractitionerVerifyPage({
  searchParams,
}: PractitionerVerifyPageProps) {
  const sp = searchParams ? await searchParams : {};
  const token = sp.token?.trim() || "";

  return (
    <Suspense fallback={null}>
      <PractitionerConfirmClient initialToken={token} />
    </Suspense>
  );
}
