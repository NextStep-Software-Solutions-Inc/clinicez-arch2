import { Metadata } from "next";
import LabUploadClient from "./LabUploadClient";

export const metadata: Metadata = {
  title: "External Diagnostic Report Dropzone | Clinic EZ",
  description: "Secure, DPA-compliant diagnostic result dropzone portal for external clinical laboratories.",
};

export default async function LabUploadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const resolvedParams = await params;
  return <LabUploadClient token={resolvedParams.token} />;
}
