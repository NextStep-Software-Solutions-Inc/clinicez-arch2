import React from 'react';
import { createRoute } from '@tanstack/react-router';
import { Route as rootRoute } from './__root';
import { SignUp } from '@clerk/clerk-react';

function SignUpPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-text">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-primary items-center justify-center text-white font-bold text-xl shadow-md mx-auto">
            C
          </div>
          <h1 className="text-xl font-bold tracking-tight text-text">
            ClinicEZ Governance Workstation
          </h1>
          <p className="text-xs text-text-muted">
            Platform Administrator Account Registration
          </p>
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
