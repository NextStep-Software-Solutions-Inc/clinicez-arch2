import { auth } from '@clerk/nextjs/server';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { tenantService } from '@/services/tenant.service';
import { staffService } from '@/services/staff.service';
import { getTenantWorkspaceUrl } from '@/utils/domain';
import { safeAwait } from '@shared/safe';
import { PENDING_INVITATION_COOKIE_NAME, parsePendingInvitation } from '@/lib/invitationCookie';

export const dynamic = 'force-dynamic';

interface SyncAuthPageProps {
    searchParams?: Promise<{ plan?: string; billing?: string }>;
}

export default async function SyncAuthPage({ searchParams }: SyncAuthPageProps = {}) {
    const { userId, getToken } = await auth();

    if (!userId) {
        redirect('/sign-in');
    }

    const headerList = await headers();
    const host =
        headerList.get('x-forwarded-host')?.split(',')[0]?.trim() ||
        headerList.get('host') ||
        '';

    // Priority 1: Check pending invitation cookie from active invitation session
    const cookieStore = await cookies();
    const pendingCookieRaw = cookieStore.get(PENDING_INVITATION_COOKIE_NAME)?.value;
    const pendingInvite = parsePendingInvitation(pendingCookieRaw);

    if (pendingInvite) {
        redirect(`/invitations/${encodeURIComponent(pendingInvite.token)}`);
    }

    const [token, tokenErr] = await safeAwait(getToken());
    if (tokenErr) {
        console.error('[sync-auth] Failed to retrieve auth token', tokenErr);
        redirect('/sign-in');
    }

    // Priority 2: Existing owned workspace or active membership
    const [tenant, tenantErr] = await safeAwait(tenantService.getTenantByOwner(userId, token));
    if (tenantErr) {
        console.error('[sync-auth] Error fetching tenant for owner', tenantErr);
    } else if (tenant && tenant.tenantSlug) {
        redirect(getTenantWorkspaceUrl(tenant.tenantSlug, '/dashboard', host));
    }

    // Priority 3: Check pending self-invitations matching caller's verified identity
    const [pendingSelfInvite, pendingSelfErr] = await safeAwait(staffService.getPendingSelfInvitation(token));
    if (pendingSelfErr) {
        console.error('[sync-auth] Error checking pending self-invitation', pendingSelfErr);
    } else if (pendingSelfInvite && pendingSelfInvite.token) {
        if (
            pendingSelfInvite.redirectUrl &&
            (pendingSelfInvite.redirectUrl.startsWith('http://') || pendingSelfInvite.redirectUrl.startsWith('https://'))
        ) {
            redirect(pendingSelfInvite.redirectUrl);
        } else {
            redirect(`/invitations/${encodeURIComponent(pendingSelfInvite.token)}`);
        }
    }

    // Priority 4: Fallback to Tenant Registration (preserving optional plan/billing params)
    if (searchParams) {
        const resolved = await searchParams;
        const qs = new URLSearchParams();
        if (resolved?.plan?.trim()) qs.set('plan', resolved.plan.trim());
        if (resolved?.billing?.trim()) qs.set('billing', resolved.billing.trim());
        const queryString = qs.toString();
        if (queryString) {
            redirect(`/tenants/register?${queryString}`);
        }
    }

    redirect('/tenants/register');
}
