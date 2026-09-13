import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { tenantService } from '@/services/tenant.service';

export default async function SyncAuthPage() {
    const { userId, getToken } = await auth();

    if (!userId) {
        redirect('/sign-in');
    }

    const token = await getToken();
    const tenant = await tenantService.getTenantByOwner(userId, token);

    if (tenant && tenant.tenantSlug) {
        redirect(`/${tenant.tenantSlug}/dashboard`);
    }

    // If we reach here, it means the user doesn't have a tenant (404 was caught in tenantService and returned null)
    redirect('/tenants/register');
}