import { Metadata } from "next";
import InvitationAcceptClient from "./InvitationAcceptClient";

export const metadata: Metadata = {
  title: "Team Invitation | Clinic EZ",
  description: "Join your healthcare team on Clinic EZ.",
};

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const resolvedParams = await params;
  return <InvitationAcceptClient token={resolvedParams.token} />;
}
