import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { VerificationQueueClient } from "@/components/verifications/VerificationQueueClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Directory Verifications | Clinic EZ Portal",
  description: "Review clinic DOH LTO and clinician PRC verification submissions.",
};

export default async function PortalVerificationsPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  return <VerificationQueueClient />;
}
