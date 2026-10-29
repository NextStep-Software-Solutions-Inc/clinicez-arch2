import React from 'react';
import { createRoute } from '@tanstack/react-router';
import { Route as rootRoute } from './__root';
import { SignIn } from '@clerk/clerk-react';
import { IconAlertCircle } from '@tabler/icons-react';
import { ClinicEzLogo } from '@/components/ClinicEzLogo';
import { getIdleTimeoutMinutes } from '@/lib/idleGuard';

function SignInPage() {
  const searchParams = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : ''
  );
  const reason = searchParams.get('reason');
  const idleMinutes = getIdleTimeoutMinutes();

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
              Platform Administration & Central Oversight
            </p>
          </div>
        </div>

        {reason === 'session_expired' && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2.5">
            <IconAlertCircle className="h-4 w-4 shrink-0" />
            <span>Your administrative session has expired due to {idleMinutes} minutes of inactivity. Please sign in again.</span>
          </div>
        )}

        <div className="flex justify-center">
          <SignIn
            path="/sign-in"
            routing="path"
            signUpUrl="/sign-up"
            forceRedirectUrl="/sync-auth"
          />
        </div>
      </div>
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: 'sign-in',
  component: SignInPage,
});
