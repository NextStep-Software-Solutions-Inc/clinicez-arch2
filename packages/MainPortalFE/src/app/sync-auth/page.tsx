import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export default async function SyncAuthPage() {
    const { userId } = await auth();

    if (!userId) {
        redirect('/sign-in');
    }

    // TODO: In the future, this is where we call the BE to fetch the tenant details for this userId from the DB.
    // const response = await fetch(`http://localhost:5245/api/users/${userId}/tenant`);
    // const data = await response.json();
    
    // For now, we mock the logic.
    // If the user has a tenant, redirect to /[tenant]/dashboard
    // If the user does not have a tenant, redirect to /tenants/register
    
    const hasTenant = false; // Mocking: user doesn't have a tenant yet
    
    if (hasTenant) {
        // const tenantId = data.tenantId;
        const tenantId = 'demo-tenant';
        redirect(`/${tenantId}/dashboard`);
    } else {
        redirect('/tenants/register');
    }
}