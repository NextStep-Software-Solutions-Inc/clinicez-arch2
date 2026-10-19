import { Metadata } from "next";
import RxUploadClient from "./RxUploadClient";

export const metadata: Metadata = {
  title: "e-Prescription Dropzone & Dispense Verification | Clinic EZ",
  description: "Secure, DPA-compliant e-prescription fulfillment and dispensing dropzone for licensed community and hospital pharmacies.",
};

export default async function RxUploadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const resolvedParams = await params;
  return <RxUploadClient token={resolvedParams.token} />;
}
