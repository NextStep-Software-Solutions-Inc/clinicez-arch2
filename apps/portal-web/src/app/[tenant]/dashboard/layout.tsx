import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { BrandTheme } from "@/components/dashboard/BrandTheme";
import CreateResourceDialog from "@/components/dashboard/CreateResourceDialog";
import TrialCountdownBanner from "@/components/dashboard/TrialCountdownBanner";
import NavigationProgressBar from "@/components/dashboard/NavigationProgressBar";
import { SiteHeader } from "@/components/dashboard/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { auth, currentUser } from "@clerk/nextjs/server";
import { tenantService, TenantDto } from "@/services/tenant.service";
import { redirect, notFound } from "next/navigation";
import { safeAwait } from "@shared/safe";

export default async function TenantDashboardLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ tenant: string }>;
}) {
    const { userId, getToken } = await auth();

    if (!userId) {
        redirect("/sign-in");
    }

    const resolvedParams = await params;
    const routeTenantSlug = resolvedParams.tenant;

    let clinicName = "Unknown Clinic";
    let userDetails = {
        name: "Unknown User",
        email: "",
        avatar: "",
    };

    const user = await currentUser();
    if (user) {
        userDetails = {
            name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "User",
            email: user.emailAddresses[0]?.emailAddress || "",
            avatar: user.imageUrl || "",
        };
    }

    const [token, tokenErr] = await safeAwait(getToken());
    if (tokenErr) {
        console.error("Failed to fetch tenant token for layout", tokenErr);
        notFound();
    }

    const [tenant, tenantErr] = await safeAwait(tenantService.getTenantByOwner(userId, token, routeTenantSlug));
    if (tenantErr || !tenant) {
        console.error("Failed to fetch tenant for layout", tenantErr);
        notFound();
    }

    // Protect layout boundary: only authorized workspace owner or active members have access
    if (tenant.tenantSlug.toLowerCase() !== routeTenantSlug.toLowerCase()) {
        if (tenant?.tenantSlug) {
            redirect(`/${tenant.tenantSlug}/dashboard/overview`);
        } else {
            redirect("/tenants/register");
        }
    }

    const userRole = tenant.role || "Owner";
    if (user) {
        (userDetails as any).role = userRole;
    }

    const workplaceName = tenant.name || tenant.clinicName || "Workspace";

    // Brand identity is cosmetic: a failed lookup falls back to the product defaults.
    const profile = await tenantService.getWorkspaceProfile(routeTenantSlug);
    const brandName = profile?.displayName || workplaceName;

    return (
        <>
            <BrandTheme accentColorHex={profile?.accentColorHex} />
            <SidebarProvider
                style={
                    {
                        "--sidebar-width": "calc(var(--spacing) * 72)",
                        "--header-height": "calc(var(--spacing) * 12)",
                    } as React.CSSProperties
                }
            >
                <AppSidebar variant="inset" name={brandName} logoUrl={profile?.logoUrl ?? undefined} user={userDetails} />
                <SidebarInset className="overflow-auto">
                    <NavigationProgressBar />
                    <SiteHeader />
                    <TrialCountdownBanner tenantSlug={routeTenantSlug} />
                    <div className="flex flex-1 flex-col">
                        <div className="@container/main flex flex-1 flex-col gap-2">
                            {children}
                        </div>
                    </div>
                </SidebarInset>
            </SidebarProvider>
            <CreateResourceDialog />
        </>
    );
}