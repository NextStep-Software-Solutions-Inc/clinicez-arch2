import Link from "next/link";
import { headers } from "next/headers";
import { ClinicEzLogo } from "@/components/ClinicEzLogo";
import { getMarketingSiteUrl } from "@/utils/domain";

export default async function TenantRegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    headerList.get("host") ||
    "";
  const marketingHomeUrl = getMarketingSiteUrl("/", host);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="w-full border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            href={marketingHomeUrl}
            className="inline-flex items-center gap-2.5 shrink-0"
          >
            <ClinicEzLogo
              markClassName="h-8 w-9 shrink-0"
              textClassName="text-xl font-bold tracking-tight text-foreground"
            />
          </Link>
          <span className="text-xs font-medium text-muted-foreground">
            Clinic EZ Workspace Onboarding
          </span>
        </div>
      </header>
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  );
}
