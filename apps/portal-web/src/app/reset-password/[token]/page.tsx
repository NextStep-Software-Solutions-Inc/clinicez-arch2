import { Metadata } from "next";
import PasswordResetClient from "./PasswordResetClient";

export const metadata: Metadata = {
  title: "Reset Password | Clinic EZ",
  description: "Set a new password for your Clinic EZ account.",
};

export default async function PasswordResetPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const resolvedParams = await params;
  return <PasswordResetClient token={resolvedParams.token} />;
}
