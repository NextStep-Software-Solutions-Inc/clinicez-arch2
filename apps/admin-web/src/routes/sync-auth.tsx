import React, { useEffect, useState } from 'react';
import { createRoute } from '@tanstack/react-router';
import { Route as rootRoute } from './__root';
import { useAuth, useClerk } from '@clerk/clerk-react';
import { adminService } from '@/services/admin.service';
import { setupAxiosInterceptors } from '@/lib/api';
import { ClinicEzMark } from '@/components/ClinicEzLogo';
import { AdminAccessStateCard } from '@/components/AdminAccessStateCard';
import {
  isForbiddenError,
  isUnauthorizedError,
  performCleanAdminSignOut,
  resolvePendingAdminInvitationPath,
} from '@/lib/adminAuthRecovery';
import { clearAllPendingAdminAuthState } from '@/lib/authRedirect';

function SyncAuthPage() {
  const [status, setStatus] = useState<'syncing' | 'unauthorized' | 'error'>('syncing');
  const [errorMessage, setErrorMessage] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);

  let getToken: any = null;
  let isLoaded = true;
  let isSignedIn = false;
  let signOut: any = async () => {};

  try {
    const auth = useAuth();
    getToken = auth.getToken;
    isLoaded = auth.isLoaded;
    isSignedIn = Boolean(auth.isSignedIn);
    if (auth.getToken) {
      setupAxiosInterceptors(auth.getToken);
    }
    const clerk = useClerk();
    signOut = clerk.signOut;
  } catch {
    // outside clerk provider in unit tests
  }

  useEffect(() => {
    let cancelled = false;

    async function sync() {
      if (!isLoaded) {
        return;
      }
      if (!isSignedIn || !getToken) {
        window.location.href = '/sign-in';
        return;
      }

      setStatus('syncing');
      setErrorMessage('');
      setupAxiosInterceptors(getToken);

      try {
        const me = await adminService.getMe();
        if (cancelled) return;

        if (me.isAdmin) {
          clearAllPendingAdminAuthState();
          window.location.href = '/';
          return;
        }

        const pendingInvitePath = await resolvePendingAdminInvitationPath();
        if (cancelled) return;
        if (pendingInvitePath) {
          window.location.href = pendingInvitePath;
          return;
        }

        setStatus('unauthorized');
      } catch (err: any) {
        if (cancelled) return;

        if (isUnauthorizedError(err)) {
          await performCleanAdminSignOut(signOut, '/sign-in');
          return;
        }

        if (isForbiddenError(err)) {
          const pendingInvitePath = await resolvePendingAdminInvitationPath();
          if (cancelled) return;
          if (pendingInvitePath) {
            window.location.href = pendingInvitePath;
            return;
          }
          setStatus('unauthorized');
          return;
        }

        console.error('Failed to synchronize admin profile', err);
        setStatus('error');
        setErrorMessage(err?.message || 'Failed to verify administrative authorization.');
      }
    }

    sync();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, getToken, isSignedIn, retryNonce]);

  if (status === 'syncing') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-text">
        <div className="flex flex-col items-center gap-4">
          <ClinicEzMark variant="squircle" className="h-11 w-11 shrink-0 drop-shadow-sm animate-pulse" />
          <div className="flex items-center gap-2.5 text-text-muted text-xs">
            <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <span>Synchronizing administrative authorization profile...</span>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'unauthorized') {
    return (
      <AdminAccessStateCard
        variant="unauthorized"
        onSignOut={() => performCleanAdminSignOut(signOut, '/sign-in')}
      />
    );
  }

  return (
    <AdminAccessStateCard
      variant="error"
      message={errorMessage}
      onRetry={() => setRetryNonce((n) => n + 1)}
      onSignOut={() => performCleanAdminSignOut(signOut, '/sign-in')}
    />
  );
}

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: 'sync-auth',
  component: SyncAuthPage,
});
