import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isProtectedRoute = createRouteMatcher([
    '/:tenant/dashboard(.*)',
    '/sync-auth(.*)',
    '/admin(.*)'
]);

const RESERVED_SUBDOMAINS = new Set([
    'www', 'app', 'api', 'admin', 'clinic', 'lab', 'pharmacy', 'dev', 'portal', 'localhost'
]);

// 60-second in-memory slug existence cache at edge/proxy
const slugCache = new Map<string, { exists: boolean; timestamp: number }>();

async function checkSlugExists(slug: string, apiBaseUrl: string): Promise<boolean> {
    const cached = slugCache.get(slug);
    if (cached && Date.now() - cached.timestamp < 60_000) {
        return cached.exists;
    }

    try {
        const cleanBase = apiBaseUrl.replace(/\/+$/, '');
        const res = await fetch(`${cleanBase}/api/v1/tenants/lookup/${encodeURIComponent(slug)}`, {
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store'
        });

        const exists = res.status === 200;
        slugCache.set(slug, { exists, timestamp: Date.now() });
        return exists;
    } catch (err) {
        console.warn(`[Proxy] Tenant slug lookup failed for '${slug}':`, err);
        // On transient network or lookup failure, allow route to proceed to page-level verification
        return true;
    }
}

export default clerkMiddleware(async (auth, req) => {
    const hostname = (req.headers.get('host') || '').toLowerCase();
    const url = req.nextUrl.clone();
    const pathname = url.pathname;

    // Detect subdomain:
    // e.g. "tenant1.dev.clinicez.net" -> "tenant1"
    // e.g. "tenant1.clinicez.net" -> "tenant1"
    // e.g. "tenant1.localhost:3000" -> "tenant1"
    let subdomain: string | null = null;

    if (hostname.endsWith('.dev.clinicez.net')) {
        subdomain = hostname.replace('.dev.clinicez.net', '').split(':')[0];
    } else if (hostname.endsWith('.clinicez.net') && !hostname.endsWith('.dev.clinicez.net')) {
        subdomain = hostname.replace('.clinicez.net', '').split(':')[0];
    } else if (hostname.includes('.localhost')) {
        subdomain = hostname.split('.localhost')[0];
    }

    if (subdomain && !RESERVED_SUBDOMAINS.has(subdomain)) {
        // Skip API routes or static files if any slipped through matcher
        if (pathname.startsWith('/api') || pathname.startsWith('/_next') || pathname === '/notfound') {
            return NextResponse.next();
        }

        const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5200';
        const exists = await checkSlugExists(subdomain, apiBaseUrl);

        if (!exists) {
            // Non-existent slug -> rewrite to /notfound with 404 status
            url.pathname = '/notfound';
            url.searchParams.set('slug', subdomain);
            return NextResponse.rewrite(url, { status: 404 });
        }

        // Existing tenant slug -> rewrite to /${subdomain}/dashboard...
        const targetPath = pathname === '/'
            ? `/${subdomain}/dashboard`
            : pathname.startsWith(`/${subdomain}`)
                ? pathname
                : `/${subdomain}/dashboard${pathname}`;

        url.pathname = targetPath;

        // If target dashboard requires authentication, enforce Clerk protection
        if (isProtectedRoute(req) || targetPath.includes('/dashboard')) {
            await auth.protect();
        }

        return NextResponse.rewrite(url);
    }

    // Default routing
    if (isProtectedRoute(req)) {
        await auth.protect();
    }

    return NextResponse.next();
});

export const config = {
    matcher: [
        // Skip Next.js internals and all static files, unless found in search params
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        // Always run for API routes
        '/(api|trpc)(.*)',
    ],
};