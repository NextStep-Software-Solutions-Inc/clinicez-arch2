import { redirect } from "next/navigation";

// Replace this with your real tenant check logic
function hasTenant() {
    // TODO: Replace with actual tenant check (e.g. from session, API, etc.)
    return true;
}

export default function TenantDashboardEntry() {
    if (typeof window !== "undefined") {
        // Client-side redirect
        if (hasTenant()) {
            redirect("/tenants/dashboard/overview");
        } else {
            redirect("/tenants/register");
        }
        return null;
    }
    // SSR fallback (Next.js will handle redirect on server)
    if (hasTenant()) {
        redirect("/tenants/dashboard/overview");
    } else {
        redirect("/tenants/register");
    }
}
