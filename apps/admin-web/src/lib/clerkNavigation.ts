export interface ClerkNavigationRouterLike {
  navigate: (options: { href: string; replace?: boolean }) => Promise<unknown> | unknown;
}

export interface ClerkNavigationMetadata {
  windowNavigate?: (to: URL | string) => void;
  [key: string]: unknown;
}

export interface ClerkRouterNavigation {
  routerPush: (to: string, metadata?: ClerkNavigationMetadata) => Promise<unknown> | unknown;
  routerReplace: (to: string, metadata?: ClerkNavigationMetadata) => Promise<unknown> | unknown;
}

const EXPLICIT_SCHEME_OR_PROTOCOL_RELATIVE = /^(?:[a-zA-Z][a-zA-Z\d+\-.]*:|\/\/)/;

/**
 * Resolves a Clerk navigation target to a same-origin relative href (`pathname + search + hash`),
 * or returns `null` when the target is cross-origin or non-HTTP(S) and must use full window navigation.
 */
export function resolveSameOriginRelativeHref(to: string): string | null {
  const trimmed = (to ?? '').trim();
  if (!trimmed) {
    return '/';
  }

  const hasWindowOrigin =
    typeof window !== 'undefined' &&
    Boolean(window.location?.origin) &&
    window.location.origin !== 'null';
  const baseHref =
    typeof window !== 'undefined' && window.location?.href
      ? window.location.href
      : 'http://localhost/';

  try {
    const parsed = new URL(trimmed, baseHref);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    if (hasWindowOrigin) {
      if (parsed.origin !== window.location.origin) {
        return null;
      }
    } else if (EXPLICIT_SCHEME_OR_PROTOCOL_RELATIVE.test(trimmed)) {
      return null;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function fallbackWindowNavigate(
  to: string,
  replace: boolean,
  metadata?: ClerkNavigationMetadata
): void {
  if (typeof metadata?.windowNavigate === 'function') {
    metadata.windowNavigate(to);
    return;
  }

  if (typeof window !== 'undefined' && window.location) {
    if (replace) {
      window.location.replace(to);
    } else {
      window.location.assign(to);
    }
  }
}

/**
 * Bridges Clerk's `routerPush` and `routerReplace` callbacks to TanStack Router so
 * multi-step `<SignIn />` / `<SignUp />` sub-route transitions stay client-side without
 * triggering full-page reloads that remount Clerk and re-send verification codes.
 */
export function createClerkRouterNavigation(
  router: ClerkNavigationRouterLike
): ClerkRouterNavigation {
  const navigateWithMode = (
    to: string,
    replace: boolean,
    metadata?: ClerkNavigationMetadata
  ) => {
    const relativeHref = resolveSameOriginRelativeHref(to);
    if (relativeHref === null) {
      fallbackWindowNavigate(to, replace, metadata);
      return;
    }

    return router.navigate(replace ? { href: relativeHref, replace: true } : { href: relativeHref });
  };

  return {
    routerPush: (to, metadata) => navigateWithMode(to, false, metadata),
    routerReplace: (to, metadata) => navigateWithMode(to, true, metadata),
  };
}
