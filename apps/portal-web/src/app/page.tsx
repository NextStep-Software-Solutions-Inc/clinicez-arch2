import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PortalRootPage() {
  const { userId } = await auth();

  if (userId) {
    redirect("/sync-auth");
  }

  redirect("/sign-in");
}
