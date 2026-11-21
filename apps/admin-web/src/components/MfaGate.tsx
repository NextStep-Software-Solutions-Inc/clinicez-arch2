import React from 'react';
import { useUser, useClerk } from '@clerk/clerk-react';
import { IconShieldLock, IconArrowRight, IconLogout } from '@tabler/icons-react';
import { isAdminMfaRequired, hasVerifiedMfa } from '@/lib/mfaGuard';
import { ClinicEzLogo } from '@/components/ClinicEzLogo';

interface MfaGateProps {
  children: React.ReactNode;
}

export function MfaGate({ children }: MfaGateProps) {
  const { user, isLoaded } = useUser();
  const { openUserProfile, signOut } = useClerk();

  const mfaRequired = isAdminMfaRequired();

  if (!mfaRequired) {
    return <>{children}</>;
  }

  // Wait for Clerk user to load
  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-text">
        <div className="flex items-center gap-3 text-text-muted text-sm">
          <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span>Verifying workstation security credentials...</span>
        </div>
      </div>
    );
  }

  const isMfaEnrolled = hasVerifiedMfa(user);

  if (isMfaEnrolled) {
    return <>{children}</>;
  }

  // User is signed in, but MFA is not enrolled and MFA is required:
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6 text-text">
      <div className="max-w-md w-full bg-surface border border-border rounded-3xl p-8 shadow-xl text-center space-y-6 animate-in fade-in duration-200">
        <div className="flex justify-center">
          <ClinicEzLogo
            markClassName="h-8 w-9 shrink-0"
            textClassName="text-lg font-bold tracking-tight text-text"
            subtitle="Governance"
          />
        </div>

        <div className="inline-flex p-4 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 mx-auto">
          <IconShieldLock className="h-10 w-10" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold tracking-tight text-text">
            Two-Factor Authentication Required
          </h1>
          <p className="text-xs text-text-secondary leading-relaxed">
            Platform Administrator accounts require Multi-Factor Authentication (2FA/TOTP) enrollment before accessing the Clinic EZ Governance Workstation.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-surface-muted border border-border text-xs text-text-muted text-left space-y-1.5">
          <p className="font-semibold text-text">Enforcement Policy:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Mandatory for Central Platform Administrators</li>
            <li>Authenticator app (Google Authenticator, 1Password, Authy)</li>
            <li>Enforced by high-assurance security policy</li>
          </ul>
        </div>

        <div className="space-y-2 pt-2">
          <button
            type="button"
            onClick={() => {
              if (openUserProfile) {
                // Open Clerk User Profile security section
                openUserProfile();
              }
            }}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer shadow-sm"
          >
            <span>Configure Two-Factor Authentication</span>
            <IconArrowRight className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={async () => {
              await signOut();
              window.location.href = '/sign-in';
            }}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-text-muted hover:text-text rounded-xl transition-colors cursor-pointer"
          >
            <IconLogout className="h-4 w-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
