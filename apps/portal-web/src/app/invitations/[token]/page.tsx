import { Suspense } from "react";
import { Metadata } from "next";
import InvitationAcceptClient from "./InvitationAcceptClient";
import { IconLoader } from "@tabler/icons-react";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Team Invitation | Clinic EZ",
  description: "Join your healthcare team on Clinic EZ.",
};

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 text-center rounded-2xl border border-border bg-card/80 backdrop-blur-md shadow-sm">
        <IconLoader className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
        <h2 className="text-base font-bold text-foreground">Loading Invitation...</h2>
      </Card>
    </div>
  );
}

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const resolvedParams = await params;
  return (
    <Suspense fallback={<LoadingFallback />}>
      <InvitationAcceptClient token={resolvedParams.token} />
    </Suspense>
  );
}

