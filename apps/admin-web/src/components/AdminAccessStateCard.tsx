import React, { useState } from 'react';
import { IconLogout, IconRefresh, IconShieldX } from '@tabler/icons-react';
import { ClinicEzLogo } from '@/components/ClinicEzLogo';

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
            <button
              type="button"
              onClick={handleSignOutClick}
              disabled={signingOut}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              <IconLogout className="h-4 w-4" />
              <span>{signingOut ? 'Signing Out...' : 'Sign Out'}</span>
            </button>
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
            <button
              type="button"
              onClick={onRetry}
              disabled={signingOut}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-text bg-surface-muted hover:bg-border rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              <IconRefresh className="h-4 w-4" />
              <span>Retry</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleSignOutClick}
            disabled={signingOut}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            <IconLogout className="h-4 w-4" />
            <span>{signingOut ? 'Signing Out...' : 'Return to Sign In'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
