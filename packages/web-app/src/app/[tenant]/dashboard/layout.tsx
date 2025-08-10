import { AppSidebar } from "@/components/dashboard/app-sidebar";
import CreateResourceDialog from "@/components/dashboard/CreateResourceDialog";
import { SiteHeader } from "@/components/dashboard/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function TenantDashboardLayout({ children }: { children: React.ReactNode }) {
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
                <AppSidebar variant="inset" />
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