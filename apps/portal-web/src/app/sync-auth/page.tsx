import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { tenantService } from '@/services/tenant.service';
import { safeAwait } from '@shared/safe';

export const dynamic = 'force-dynamic';

export default async function SyncAuthPage() {
    const { userId, getToken } = await auth();

    if (!userId) {
        redirect('/sign-in');
    }

    const [token, tokenErr] = await safeAwait(getToken());
    if (tokenErr) {
        console.error("[sync-auth] Failed to retrieve auth token", tokenErr);
        redirect('/sign-in');
    }

    const [tenant, tenantErr] = await safeAwait(tenantService.getTenantByOwner(userId, token));

    if (tenantErr) {
        console.error("[sync-auth] Error fetching tenant for owner", tenantErr);
        redirect('/tenants/register');
    }

    if (tenant && tenant.tenantSlug) {
        redirect(`/${tenant.tenantSlug}/dashboard`);
    }

    // If we reach here, the user is authenticated but doesn't have a workspace
    redirect('/tenants/register');
}