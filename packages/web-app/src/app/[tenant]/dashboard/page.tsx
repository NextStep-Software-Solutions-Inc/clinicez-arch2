import { redirect } from "next/navigation";

// Replace this with your real tenant check logic
function hasTenant() {
    // TODO: Replace with actual tenant check (e.g. from session, API, etc.)
    return true;
}

import { useEffect } from "react";

export default function TenantDashboardEntry() {
    useEffect(() => {
        if (hasTenant()) {
            window.location.replace("/tenants/dashboard/overview");
        } else {
            window.location.replace("/tenants/register");
        }
    }, []);

    // SSR redirect
    if (typeof window === "undefined") {
        if (hasTenant()) {
            redirect("/tenants/dashboard/overview");
        } else {
            redirect("/tenants/register");
        }
    }

    return null;
}
