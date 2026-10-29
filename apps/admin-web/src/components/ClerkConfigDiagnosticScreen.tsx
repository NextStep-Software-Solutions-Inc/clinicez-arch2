import React from 'react';
import { IconAlertTriangle, IconTerminal } from '@tabler/icons-react';
import { ClinicEzLogo } from '@/components/ClinicEzLogo';

export function ClerkConfigDiagnosticScreen() {
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';
  const apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PORTAL_API_URL) || 'http://localhost:5000/api/v1';

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6 text-text">
      <div className="max-w-xl w-full bg-surface border border-border rounded-3xl p-8 shadow-xl space-y-6">
        <div className="pb-4 border-b border-border flex items-center justify-between">
          <ClinicEzLogo
            markClassName="h-7 w-8 shrink-0"
            textClassName="text-base font-bold tracking-tight text-text"
            subtitle="Governance"
          />
        </div>
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <IconAlertTriangle className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-text">
              Admin Web Configuration Required
            </h1>
            <p className="text-xs text-text-muted mt-0.5">
              Missing Clerk Authentication Publishable Key
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-surface-muted border border-border text-xs text-text-secondary space-y-2">
          <p className="font-semibold text-text">
            <code>VITE_CLERK_PUBLISHABLE_KEY</code> is unset in this environment.
          </p>
          <p className="leading-relaxed">
            The Clinic EZ Governance Workstation requires a valid Clerk Publishable Key to initialize administrative authentication and session security.
          </p>
        </div>

        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
            <IconTerminal className="h-4 w-4" /> Quick Resolution
          </h2>
          <div className="p-3.5 rounded-xl bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto">
            <code>echo "VITE_CLERK_PUBLISHABLE_KEY=pk_test_..." &gt;&gt; apps/admin-web/.env.local</code>
          </div>
        </div>

        <div className="pt-4 border-t border-border grid grid-cols-2 gap-4 text-[11px] text-text-muted">
          <div>
            <span className="font-semibold block text-text-secondary">Origin</span>
            <code>{currentOrigin}</code>
          </div>
          <div>
            <span className="font-semibold block text-text-secondary">Target API</span>
            <code>{apiBase}</code>
          </div>
        </div>
      </div>
    </div>
  );
}
