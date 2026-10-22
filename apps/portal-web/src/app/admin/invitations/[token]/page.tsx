import { Metadata } from "next";
import AdminInvitationAcceptClient from "./AdminInvitationAcceptClient";

export const metadata: Metadata = {
  title: "Admin Invitation | Clinic EZ",
  description: "Join the platform administration on Clinic EZ.",
};

export default async function AdminInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const resolvedParams = await params;
  return <AdminInvitationAcceptClient token={resolvedParams.token} />;
}
