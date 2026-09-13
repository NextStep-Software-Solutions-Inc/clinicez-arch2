import { redirect } from "next/navigation";

export default async function TenantDashboardEntry({ params }: { params: Promise<{ tenant: string }> }) {
    const { tenant } = await params;
    
    // In a real application, you might verify if this tenant exists 
    // or if the user has access to it here.
    
    // Redirect to the overview page by default
    redirect(`/${tenant}/dashboard/overview`);
}
