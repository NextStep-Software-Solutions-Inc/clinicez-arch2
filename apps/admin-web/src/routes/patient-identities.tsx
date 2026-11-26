import React, { useEffect, useState } from 'react';
import { createRoute } from '@tanstack/react-router';
import { Route as authRoute } from './_auth';
import { adminService, type AdminMeDto } from '@/services/admin.service';
import {
  PatientIdentityDirectoryPanel,
  canAccessPatientIdentityDirectory,
} from '@/components/PatientIdentityDirectoryPanel';
import { IconShieldLock } from '@tabler/icons-react';

export function PatientIdentitiesPage({
  initialProfile,
  initialLoading,
}: {
  initialProfile?: AdminMeDto | null;
  initialLoading?: boolean;
} = {}) {
  const [profile, setProfile] = useState<AdminMeDto | null>(initialProfile ?? null);
  const [loading, setLoading] = useState<boolean>(initialLoading ?? initialProfile === undefined);

  useEffect(() => {
    if (initialProfile !== undefined) return;
    let active = true;
    adminService
      .getMe()
      .then((me) => {
        if (active) setProfile(me);
      })
      .catch(() => {
        if (active) setProfile(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialProfile]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse" aria-label="Loading patient identity directory">
        <div className="h-14 w-80 max-w-full rounded-2xl bg-surface-muted" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((idx) => (
            <div key={idx} className="h-24 rounded-2xl bg-surface-muted" />
          ))}
        </div>
        <div className="h-16 w-full rounded-2xl bg-surface-muted" />
        <div className="h-72 w-full rounded-2xl bg-surface-muted" />
      </div>
    );
  }

  if (!canAccessPatientIdentityDirectory(profile)) {
    return (
      <div className="py-16 flex items-center justify-center">
        <div className="max-w-md w-full p-8 rounded-2xl bg-surface border border-border text-center space-y-4 shadow-sm">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <IconShieldLock className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-bold text-text">Access Restricted</h1>
            <p className="text-xs text-text-muted leading-relaxed">
              Your administrator role does not include permission to view or update patient sign-in
              links. Contact a Super Admin if you need access.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-text">Patient Identities</h1>
        <p className="text-xs text-text-muted max-w-2xl">
          Review how patient profiles connect to active sign-in accounts and resolve unlinked or
          duplicate email records.
        </p>
      </div>

      <PatientIdentityDirectoryPanel mode="platform-interop" />
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: '/patient-identities',
  component: () => <PatientIdentitiesPage />,
});
