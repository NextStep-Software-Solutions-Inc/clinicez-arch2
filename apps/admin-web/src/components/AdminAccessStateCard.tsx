import React, { useState } from 'react';
import { IconLogout, IconRefresh, IconShieldX } from '@tabler/icons-react';
import { ClinicEzLogo } from '@/components/ClinicEzLogo';
import { Button } from '@/components/ui';

export interface AdminAccessStateCardProps {
  variant: 'unauthorized' | 'error';
  message?: string;
  onRetry?: () => void;
  onSignOut: () => Promise<void> | void;
}

/**
 * Shared administrative access denial and synchronization error card used by
 * /sync-auth and the _auth Workstation layout guard.
 */
export function AdminAccessStateCard({
  variant,
  message,
  onRetry,
  onSignOut,
}: AdminAccessStateCardProps) {
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOutClick = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
    }
  };

  if (variant === 'unauthorized') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6 text-text">
        <div className="max-w-md w-full bg-surface border border-border rounded-3xl p-8 shadow-xl text-center space-y-5">
          <div className="flex justify-center pb-1">
            <ClinicEzLogo
              markClassName="h-8 w-9 shrink-0"
              textClassName="text-lg font-bold tracking-tight text-text"
              subtitle="Governance"
            />
          </div>
          <div className="inline-flex p-3 rounded-2xl bg-red-500/10 text-red-600 dark:text-red-400">
            <IconShieldX className="h-8 w-8" />
          </div>
          <h2 className="text-lg font-bold text-text">Access Restricted</h2>
          <p className="text-xs text-text-secondary leading-relaxed">
            Your authenticated account is not registered as an active Platform Administrator in Clinic EZ Central. If you received an invitation email, open your invitation link after signing in with the invited account, or contact your organization owner.
          </p>
          <div className="pt-2">
            <Button
              variant="danger"
              size="lg"
              onClick={handleSignOutClick}
              disabled={signingOut}
              leadingIcon={<IconLogout className="h-4 w-4" />}
              className="px-5 text-xs"
            >
              {signingOut ? 'Signing Out...' : 'Sign Out'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6 text-text">
      <div className="max-w-md w-full bg-surface border border-border rounded-3xl p-8 shadow-xl text-center space-y-5">
        <div className="flex justify-center pb-1">
          <ClinicEzLogo
            markClassName="h-8 w-9 shrink-0"
            textClassName="text-lg font-bold tracking-tight text-text"
            subtitle="Governance"
          />
        </div>
        <div className="inline-flex p-3 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <IconShieldX className="h-8 w-8" />
        </div>
        <h2 className="text-lg font-bold text-text">Synchronization Error</h2>
        <p className="text-xs text-text-secondary">
          {message || 'Failed to verify administrative authorization.'}
        </p>
        <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
          {onRetry && (
            <Button
              variant="secondary"
              size="lg"
              onClick={onRetry}
              disabled={signingOut}
              leadingIcon={<IconRefresh className="h-4 w-4" />}
              className="px-4 text-xs"
            >
              Retry
            </Button>
          )}
          <Button
            variant="primary"
            size="lg"
            onClick={handleSignOutClick}
            disabled={signingOut}
            leadingIcon={<IconLogout className="h-4 w-4" />}
            className="px-5 text-xs"
          >
            {signingOut ? 'Signing Out...' : 'Return to Sign In'}
          </Button>
        </div>
      </div>
    </div>
  );
}
