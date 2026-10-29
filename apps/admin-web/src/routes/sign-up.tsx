import React from 'react';
import { createRoute } from '@tanstack/react-router';
import { Route as rootRoute } from './__root';
import { SignUp } from '@clerk/clerk-react';
import { ClinicEzLogo } from '@/components/ClinicEzLogo';

function SignUpPage() {
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
          <SignUp
            path="/sign-up"
            routing="path"
            signInUrl="/sign-in"
            forceRedirectUrl="/sync-auth"
          />
        </div>
      </div>
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: 'sign-up',
  component: SignUpPage,
});
