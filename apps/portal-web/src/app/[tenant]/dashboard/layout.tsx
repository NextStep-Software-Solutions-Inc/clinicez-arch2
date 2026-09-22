import { AppSidebar } from "@/components/dashboard/app-sidebar";
import CreateResourceDialog from "@/components/dashboard/CreateResourceDialog";
import TrialCountdownBanner from "@/components/dashboard/TrialCountdownBanner";
import { SiteHeader } from "@/components/dashboard/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { auth, currentUser } from "@clerk/nextjs/server";
import { tenantService, TenantDto } from "@/services/tenant.service";
import { redirect } from "next/navigation";
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
        console.error("Failed to fetch tenant for layout", tokenErr);
        redirect("/tenants/register");
    }

    const [tenant, tenantErr] = await safeAwait(tenantService.getTenantByOwner(userId, token));
    if (tenantErr) {
        console.error("Failed to fetch tenant for layout", tenantErr);
        redirect("/tenants/register");
    }

    // Protect layout boundary: only workspace owner has access
    if (!tenant || tenant.tenantSlug !== routeTenantSlug) {
        if (tenant?.tenantSlug) {
            redirect(`/${tenant.tenantSlug}/dashboard/overview`);
        } else {
            redirect("/tenants/register");
        }
    }

    const workplaceName = tenant.name || tenant.clinicName || "Workspace";

    return (
        <>
            <SidebarProvider
                style={
                    {
                        "--sidebar-width": "calc(var(--spacing) * 72)",
                        "--header-height": "calc(var(--spacing) * 12)",
                    } as React.CSSProperties
                }
            >
                <AppSidebar variant="inset" name={workplaceName} user={userDetails} />
                <SidebarInset className="overflow-auto">
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