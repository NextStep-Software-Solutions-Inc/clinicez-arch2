import React, { useEffect, useState } from 'react';
import { createRoute, Link } from '@tanstack/react-router';
import { Route as rootRoute } from './__root';
import { useAuth, useClerk } from '@clerk/clerk-react';
import { adminService } from '@/services/admin.service';
import { setupAxiosInterceptors } from '@/lib/api';
import { IconShieldX, IconLogout } from '@tabler/icons-react';
import { ClinicEzLogo, ClinicEzMark } from '@/components/ClinicEzLogo';

function SyncAuthPage() {
  const [status, setStatus] = useState<'syncing' | 'unauthorized' | 'error'>('syncing');
  const [errorMessage, setErrorMessage] = useState('');

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
    async function sync() {
      if (!isLoaded) {
        return;
      }
      if (!isSignedIn || !getToken) {
        window.location.href = '/sign-in';
        return;
      }

      setupAxiosInterceptors(getToken);

      try {
        const me = await adminService.getMe();
        if (me.isAdmin) {
          window.location.href = '/';
        } else {
          setStatus('unauthorized');
        }
      } catch (err: any) {
        console.error('Failed to synchronize admin profile', err);
        setStatus('error');
        setErrorMessage(err?.message || 'Failed to verify administrative authorization.');
      }
    }

    sync();
  }, [isLoaded, getToken, isSignedIn]);

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
            Your authenticated account is not registered as a Platform Administrator in Clinic EZ Central. Please contact your organization owner to request access.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={async () => {
                await signOut();
                window.location.href = '/sign-in';
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors cursor-pointer"
            >
              <IconLogout className="h-4 w-4" />
              <span>Sign Out</span>
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
        <p className="text-xs text-text-secondary">{errorMessage}</p>
        <div className="pt-2">
          <Link
            to="/sign-in"
            className="inline-flex items-center justify-center px-5 py-2.5 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors"
          >
            Return to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: 'sync-auth',
  component: SyncAuthPage,
});
