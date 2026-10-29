import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { buildServiceHostRegex, getServiceSubdomains, joinApiUrl } from '@shared/safe';
import { APP_SUBDOMAINS } from '@/config/site';
import {
    MULTI_PART_TLDS,
    RESERVED_TENANT_SLUGS,
    getPortalApiUrl,
    isReservedTenantSlug,
} from '@/utils/domain';

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

// Core reserved labels; full RESERVED_TENANT_SLUGS and service subdomains are also enforced below.
const RESERVED_SUBDOMAINS = new Set([
    'www', 'app', 'api', 'admin', 'dev', 'portal', 'localhost', 'home'
]);

// Service subdomains recognised by this deployment: NEXT_PUBLIC_SERVICE_SUBDOMAINS plus the per-facility-type names.
const getKnownServiceSubdomains = (): string[] =>
    Array.from(new Set([...getServiceSubdomains(), ...Object.values(APP_SUBDOMAINS)]));

export const isReservedSubdomain = (label: string): boolean => {
    const normalized = label.trim().toLowerCase();
    return (
        RESERVED_SUBDOMAINS.has(normalized) ||
        RESERVED_TENANT_SLUGS.has(normalized) ||
        isReservedTenantSlug(normalized) ||
        getKnownServiceSubdomains().some((s) => s.toLowerCase() === normalized)
    );
};

export function isTenantSubdomainBypassPath(pathname: string): boolean {
    return (
        pathname === '/api' ||
        pathname.startsWith('/api/') ||
        pathname.startsWith('/_next') ||
        pathname === '/notfound' ||
        pathname === '/robots.txt' ||
        pathname === '/sitemap.xml' ||
        pathname === '/sign-in' ||
        pathname.startsWith('/sign-in/') ||
        pathname === '/sign-up' ||
        pathname.startsWith('/sign-up/') ||
        pathname === '/sync-auth' ||
        pathname.startsWith('/sync-auth/') ||
        pathname === '/tenants/register' ||
        pathname.startsWith('/tenants/register/')
    );
}

export function resolveTenantDashboardRewritePath(subdomain: string, pathname: string): string {
    if (pathname === '/' || pathname === '/dashboard') {
        return `/${subdomain}/dashboard`;
    }
    if (pathname.startsWith('/dashboard/')) {
        return `/${subdomain}${pathname}`;
    }
    if (pathname === `/${subdomain}`) {
        return `/${subdomain}/dashboard`;
    }
    if (pathname.startsWith(`/${subdomain}/`)) {
        return pathname;
    }
    return `/${subdomain}/dashboard${pathname}`;
}

export function resolvePortalCanonicalRedirect(
    cleanHost: string,
    pathname: string,
    search: string = ''
): string | null {
    if (!cleanHost.startsWith('portal.')) {
        return null;
    }

    const baseDomain = cleanHost.slice('portal.'.length);
    if (
        !baseDomain ||
        !baseDomain.includes('.') ||
        baseDomain === 'localhost' ||
        baseDomain === 'lvh.me' ||
        baseDomain.endsWith('.localhost') ||
        baseDomain.endsWith('.lvh.me')
    ) {
        return null;
    }

    const match = pathname.match(/^\/([a-z0-9]+(?:-[a-z0-9]+)*)(\/dashboard(?:\/.*)?)$/);
    if (!match) {
        return null;
    }

    const slug = match[1];
    const dashboardPath = match[2];
    if (isReservedSubdomain(slug)) {
        return null;
    }

    return new URL(`${dashboardPath}${search}`, `https://${slug}.${baseDomain}`).toString();
}

export function extractSubdomainCandidate(cleanHost: string): string | null {
    const serviceMatch = cleanHost.match(buildServiceHostRegex(getKnownServiceSubdomains()));
    const localMatch = cleanHost.match(/^([a-z0-9-]+)\.(?:localhost|lvh\.me)$/);
    const devMatch = cleanHost.match(/^([a-z0-9-]+)\.dev\.(.+)$/);
    const directMatch = cleanHost.match(/^([a-z0-9-]+)\.([a-z0-9-]+\.[a-z0-9-.]+)$/);

    if (serviceMatch) {
        return serviceMatch[1];
    }
    if (localMatch) {
        return localMatch[1];
    }
    if (devMatch) {
        return devMatch[1];
    }
    if (directMatch && !MULTI_PART_TLDS.has(directMatch[2])) {
        return directMatch[1];
    }
    return null;
}

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

    const hostname = (
        req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
        req.headers.get('host') ||
        ''
    ).toLowerCase();
    const url = req.nextUrl.clone();
    const pathname = url.pathname;
    const cleanHost = hostname.split(':')[0].trim();

    // Canonical cloud redirect on portal.<baseDomain>: /{slug}/dashboard(...) -> https://{slug}.{baseDomain}/dashboard(...)
    const canonicalRedirectUrl = resolvePortalCanonicalRedirect(cleanHost, pathname, url.search);
    if (canonicalRedirectUrl) {
        return NextResponse.redirect(new URL(canonicalRedirectUrl), 308);
    }

    const subdomain = extractSubdomainCandidate(cleanHost);

    if (subdomain && !isReservedSubdomain(subdomain) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(subdomain)) {
        // Bypass auth/shared portal paths on tenant subdomains so Clerk sign-in/sign-up/sync-auth never loop
        if (!isTenantSubdomainBypassPath(pathname)) {
            const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || getPortalApiUrl(cleanHost);
            const exists = await checkSlugExists(subdomain, apiBaseUrl);

            if (!exists) {
                // Non-existent slug -> rewrite to /notfound with 404 status
                url.pathname = '/notfound';
                url.searchParams.set('slug', subdomain);
                return NextResponse.rewrite(url, { status: 404 });
            }

            const targetPath = resolveTenantDashboardRewritePath(subdomain, pathname);
            url.pathname = targetPath;

            // If target dashboard requires authentication, enforce Clerk protection
            if (isProtectedRoute(req) || targetPath.includes('/dashboard')) {
                await auth.protect();
            }

            return NextResponse.rewrite(url);
        }
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
