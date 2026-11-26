import React, { useEffect } from 'react';
import { createRoute, useLocation } from '@tanstack/react-router';
import { Route as rootRoute } from './__root';
import { SignUp } from '@clerk/clerk-react';
import { ClinicEzLogo } from '@/components/ClinicEzLogo';
import {
  buildAuthHrefWithRedirect,
  clearPendingAuthRedirect,
  readPendingAuthRedirect,
  sanitizeAdminRedirectPath,
  savePendingAuthRedirect,
} from '@/lib/authRedirect';

interface SignUpSearch {
  redirect_url?: string;
}

export interface SignUpViewProps {
  SignUpComponent?: React.ComponentType<React.ComponentProps<typeof SignUp>>;
}

export function SignUpView({ SignUpComponent = SignUp }: SignUpViewProps) {
  const searchStr = useLocation({ select: (loc) => loc.searchStr });
  const pathname = useLocation({ select: (loc) => loc.pathname });
  const searchParams = new URLSearchParams(
    searchStr ?? (typeof window !== 'undefined' ? window.location.search : '')
  );
  const urlRedirect = sanitizeAdminRedirectPath(searchParams.get('redirect_url'));
  const normalizedPath = (pathname || '/sign-up').replace(/\/+$/, '');
  const isSubRoute = normalizedPath !== '/sign-up';
  const resolvedRedirect = urlRedirect ?? (isSubRoute ? readPendingAuthRedirect() : null);
  const effectiveRedirect = resolvedRedirect ?? '/sync-auth';

  useEffect(() => {
    if (urlRedirect) {
      savePendingAuthRedirect(urlRedirect);
    } else if (!isSubRoute) {
      clearPendingAuthRedirect();
    }
  }, [urlRedirect, isSubRoute]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-text">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2.5">
          <div className="flex justify-center">
            <ClinicEzLogo
              markClassName="h-10 w-11 shrink-0 drop-shadow-xs"
              textClassName="text-2xl font-bold tracking-tight text-text"
            />
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-bold tracking-tight text-text">
              Governance Workstation
            </h1>
            <p className="text-xs text-text-muted">
              Platform Administrator Account Registration
            </p>
          </div>
        </div>

        <div className="flex justify-center">
          <SignUpComponent
            path="/sign-up"
            routing="path"
            signInUrl={buildAuthHrefWithRedirect('/sign-in', resolvedRedirect)}
            forceRedirectUrl={effectiveRedirect}
            fallbackRedirectUrl={effectiveRedirect}
            signInForceRedirectUrl={effectiveRedirect}
            signInFallbackRedirectUrl={effectiveRedirect}
          />
        </div>
      </div>
    </div>
  );
}

function SignUpPage() {
  return <SignUpView />;
}

const signUpBaseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'sign-up',
  validateSearch: (search: Record<string, unknown>): SignUpSearch => ({
    redirect_url: typeof search.redirect_url === 'string' ? search.redirect_url : undefined,
  }),
  component: SignUpPage,
});

const signUpIndexRoute = createRoute({
  getParentRoute: () => signUpBaseRoute,
  path: '/',
});

const signUpSplatRoute = createRoute({
  getParentRoute: () => signUpBaseRoute,
  path: '$',
});

export const Route = signUpBaseRoute.addChildren([
  signUpIndexRoute,
  signUpSplatRoute,
]);
