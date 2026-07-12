import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { tenantService } from '@/services/tenant.service';

export default async function SyncAuthPage() {
    const { userId, getToken } = await auth();

    if (!userId) {
        redirect('/sign-in');
    }

    let tenantSlug: string | null = null;

    try {
        const token = await getToken();
        const tenant = await tenantService.getTenantByOwner(userId, token);

        if (tenant && tenant.tenantSlug) {
            tenantSlug = tenant.tenantSlug;
        }
    } catch (err) {
        console.error("Error syncing auth:", err);
    }
    
    if (tenantSlug) {
        redirect(`/${tenantSlug}/dashboard`);
    }

    // If we reach here, it means the user doesn't have a tenant or the API call failed/returned 404
    redirect('/tenants/register');
}