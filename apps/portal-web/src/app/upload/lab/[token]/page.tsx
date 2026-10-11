import { Metadata } from "next";
import LabUploadClient from "./LabUploadClient";

export const metadata: Metadata = {
  title: "Send a lab result | Clinic EZ",
  description: "Upload a laboratory result file for the clinic that sent you this link.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function LabUploadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const resolvedParams = await params;
  return <LabUploadClient token={resolvedParams.token} />;
}
