import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { buildServiceHostRegex, getServiceSubdomains, joinApiUrl } from '@shared/safe';
import { APP_SUBDOMAINS } from '@/config/site';

const isProtectedRoute = createRouteMatcher([
    '/:tenant/dashboard(.*)',
    '/sync-auth(.*)'
]);

// Canonical public unauthenticated routes (no tenant resolution, no Clerk auth gate)
export const PUBLIC_ROUTE_PATTERNS = [
    '/claim(.*)',
    '/join(.*)',
    '/teleconsult(.*)',
    '/verify(.*)',
    '/upload(.*)',
    '/invitations(.*)',
    '/reset-password(.*)',
];

export const isPublicRoute = createRouteMatcher(PUBLIC_ROUTE_PATTERNS);

// Generic reserved labels; service subdomains (clinic, lab, ...) are added from configuration
// (NEXT_PUBLIC_SERVICE_SUBDOMAINS) so they are never treated as tenant slugs.
const RESERVED_SUBDOMAINS = new Set([
    'www', 'app', 'api', 'admin', 'dev', 'portal', 'localhost'
]);

// Service subdomains recognised by this deployment: NEXT_PUBLIC_SERVICE_SUBDOMAINS plus the per-facility-type names.
const getKnownServiceSubdomains = (): string[] =>
    Array.from(new Set([...getServiceSubdomains(), ...Object.values(APP_SUBDOMAINS)]));

const isReservedSubdomain = (label: string): boolean =>
    RESERVED_SUBDOMAINS.has(label) || getKnownServiceSubdomains().includes(label);

// 60-second in-memory slug existence cache at edge/proxy
const slugCache = new Map<string, { exists: boolean; timestamp: number }>();

async function checkSlugExists(slug: string, apiBaseUrl: string): Promise<boolean> {
    const cached = slugCache.get(slug);
    if (cached && Date.now() - cached.timestamp < 60_000) {
        return cached.exists;
    }

    try {
        const cleanBase = apiBaseUrl.replace(/\/+$/, '');
        const lookupUrl = joinApiUrl(cleanBase, `/tenants/lookup/${encodeURIComponent(slug)}`);
        const res = await fetch(lookupUrl, {
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
    if (isPublicRoute(req)) {
        return NextResponse.next();
    }

    const hostname = (req.headers.get('host') || '').toLowerCase();
    const url = req.nextUrl.clone();
    const pathname = url.pathname;

    // Detect tenant/facility subdomain dynamically across any base domain:
    // e.g. "tenant1.dev.domain.com" -> "tenant1"
    // e.g. "tenant1.domain.com" -> "tenant1"
    // e.g. "tenant1.localhost:3000" -> "tenant1"
    let subdomain: string | null = null;
    const cleanHost = hostname.split(':')[0].trim();

    const serviceMatch = cleanHost.match(buildServiceHostRegex(getKnownServiceSubdomains()));
    const localMatch = cleanHost.match(/^([a-z0-9-]+)\.(?:localhost|lvh\.me)$/);
    const devMatch = cleanHost.match(/^([a-z0-9-]+)\.dev\.(.+)$/);
    const directMatch = cleanHost.match(/^([a-z0-9-]+)\.([a-z0-9-]+\.[a-z0-9-.]+)$/);

    if (serviceMatch) {
        subdomain = serviceMatch[1];
    } else if (localMatch) {
        subdomain = localMatch[1];
    } else if (devMatch) {
        subdomain = devMatch[1];
    } else if (directMatch) {
        subdomain = directMatch[1];
    }

    if (subdomain && !isReservedSubdomain(subdomain) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(subdomain)) {
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