import { Suspense } from "react";
import { Metadata } from "next";
import AdminInvitationAcceptClient from "./AdminInvitationAcceptClient";
import { IconLoader } from "@tabler/icons-react";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Admin Invitation | Clinic EZ",
  description: "Join the platform administration on Clinic EZ.",
};

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 text-center rounded-2xl border border-border bg-card/80 backdrop-blur-md shadow-xs">
        <IconLoader className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
        <h2 className="text-base font-bold text-foreground">Verifying Invitation...</h2>
      </Card>
    </div>
  );
}

export default async function AdminInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const resolvedParams = await params;
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AdminInvitationAcceptClient token={resolvedParams.token} />
    </Suspense>
  );
}

