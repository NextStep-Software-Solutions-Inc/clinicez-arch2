import React from 'react';
import { Link } from '@tanstack/react-router';
import { IconAlertCircle, IconArrowLeft } from '@tabler/icons-react';
import { ClinicEzLogo } from '@/components/ClinicEzLogo';
import { Text } from '@/components/ui';

/** Branded fallback screen for unmatched Governance Workstation routes. */
export function NotFoundScreen() {
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
          <IconAlertCircle className="h-8 w-8" />
        </div>

        <div className="space-y-1.5">
          <Text as="h1" className="text-lg font-bold tracking-tight text-text">
            Page Not Found
          </Text>
          <p className="text-xs text-text-secondary leading-relaxed">
            The Governance Workstation route you requested could not be found or is no longer available.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
          <Link
            to="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors whitespace-nowrap min-w-0"
          >
            <IconArrowLeft className="h-4 w-4 shrink-0" />
            <Text as="span">Return to Workstation</Text>
          </Link>
          <Link
            to="/sign-in"
            className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 text-xs font-semibold text-text bg-surface-muted hover:bg-border rounded-xl transition-colors whitespace-nowrap min-w-0"
          >
            <Text as="span">Sign In</Text>
          </Link>
        </div>
      </div>
    </div>
  );
}
