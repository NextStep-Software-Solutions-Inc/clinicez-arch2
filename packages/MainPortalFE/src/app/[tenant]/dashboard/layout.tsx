import { AppSidebar } from "@/components/dashboard/app-sidebar";
import CreateResourceDialog from "@/components/dashboard/CreateResourceDialog";
import { SiteHeader } from "@/components/dashboard/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { auth, currentUser } from "@clerk/nextjs/server";
import { tenantService } from "@/services/tenant.service";

export default async function TenantDashboardLayout({ children }: { children: React.ReactNode }) {
    const { userId, getToken } = await auth();
    let clinicName = "Unknown Clinic";
    let userDetails = {
        name: "Unknown User",
        email: "",
        avatar: "",
    };
    
    if (userId) {
        const user = await currentUser();
        if (user) {
            userDetails = {
                name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "User",
                email: user.emailAddresses[0]?.emailAddress || "",
                avatar: user.imageUrl || "",
            };
        }
        try {
            const token = await getToken();
            const tenant = await tenantService.getTenantByOwner(userId, token);
            if (tenant) {
                clinicName = tenant.clinicName;
            }
        } catch (e) {
            console.error("Failed to fetch tenant for layout", e);
        }
    }

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
                <AppSidebar variant="inset" clinicName={clinicName} user={userDetails} />
                <SidebarInset className="overflow-auto">
                    <SiteHeader />
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