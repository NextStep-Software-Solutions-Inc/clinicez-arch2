import React, { useEffect, useState } from 'react';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';
import { ClinicEzLogo } from '@/components/ClinicEzLogo';

export interface ClerkLoadErrorInfo {
  code: string;
  message: string;
  scriptOrigin?: string;
}

const DEFAULT_CLERK_LOAD_ERROR_CODE = 'failed_to_load_clerk_js';
const SCRIPT_URL_REGEX = /https?:\/\/[^\s)"']+/i;

/**
 * Inspects an unhandled rejection reason and returns structured info when it
 * represents a ClerkJS browser script load failure, or null for unrelated errors.
 */
export function parseClerkLoadError(reason: unknown): ClerkLoadErrorInfo | null {
  if (!reason) {
    return null;
  }

  let code = '';
  let message = '';

  if (typeof reason === 'string') {
    message = reason;
  } else if (typeof reason === 'object') {
    const candidate = reason as { code?: unknown; message?: unknown };
    if (typeof candidate.code === 'string') {
      code = candidate.code.trim();
    }
    if (typeof candidate.message === 'string') {
      message = candidate.message;
    } else if (reason instanceof Error) {
      message = reason.message;
    }
  }

  const isClerkLoadError =
    code === DEFAULT_CLERK_LOAD_ERROR_CODE ||
    message.includes(DEFAULT_CLERK_LOAD_ERROR_CODE) ||
    /Clerk:\s*Failed to load Clerk/i.test(message) ||
    (/failed to load script/i.test(message) && /clerk/i.test(message));

  if (!isClerkLoadError) {
    return null;
  }

  let scriptOrigin: string | undefined;
  const urlMatch = message.match(SCRIPT_URL_REGEX);
  if (urlMatch) {
    const cleanedUrl = urlMatch[0].replace(/[.,;:]+$/, '');
    try {
      scriptOrigin = new URL(cleanedUrl).origin;
    } catch {
      // Ignore malformed URLs in error messages
    }
  }

  return {
    code: code || DEFAULT_CLERK_LOAD_ERROR_CODE,
    message: message.trim() || 'Clerk authentication script failed to load.',
    ...(scriptOrigin ? { scriptOrigin } : {}),
  };
}

export interface ClerkLoadFailureScreenProps {
  error?: ClerkLoadErrorInfo | null;
  onRetry?: () => void;
}

/**
 * Diagnostic fallback screen rendered when ClerkJS cannot load (for example
 * due to a Content Security Policy block, network outage, or DNS failure).
 */
export function ClerkLoadFailureScreen({ error, onRetry }: ClerkLoadFailureScreenProps) {
  const currentOrigin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : '(runtime origin)';
  const scriptOrigin = error?.scriptOrigin || '(unavailable)';
  const errorCode = error?.code || DEFAULT_CLERK_LOAD_ERROR_CODE;

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
      return;
    }
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

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
              Authentication Service Unavailable
            </h1>
            <p className="text-xs text-text-muted mt-0.5">
              Failed to load authentication provider script
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-surface-muted border border-border text-xs text-text-secondary space-y-2">
          <p className="font-semibold text-text">
            The workstation could not load the Clerk authentication script.
          </p>
          <p className="leading-relaxed">
            This is typically caused by a Content Security Policy (CSP) restriction, DNS lookup failure, or blocked third-party script request. Verify network access and security headers, then reload.
          </p>
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={handleRetry}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer shadow-sm"
          >
            <IconRefresh className="h-4 w-4" />
            <span>Reload Workstation</span>
          </button>
        </div>

        <div className="pt-4 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-4 text-[11px] text-text-muted">
          <div className="min-w-0">
            <span className="font-semibold block text-text-secondary">Origin</span>
            <code className="break-all">{currentOrigin}</code>
          </div>
          <div className="min-w-0">
            <span className="font-semibold block text-text-secondary">Auth Script Origin</span>
            <code className="break-all">{scriptOrigin}</code>
          </div>
          <div className="min-w-0">
            <span className="font-semibold block text-text-secondary">Error Code</span>
            <code className="break-all">{errorCode}</code>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface ClerkBootGuardProps {
  children: React.ReactNode;
}

/**
 * Listens for unhandled ClerkJS script-load rejections so the workstation shows
 * an actionable recovery screen instead of spinning indefinitely.
 */
export function ClerkBootGuard({ children }: ClerkBootGuardProps) {
  const [loadError, setLoadError] = useState<ClerkLoadErrorInfo | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const onRejection = (event: PromiseRejectionEvent) => {
      const parsed = parseClerkLoadError(event.reason);
      if (parsed) {
        event.preventDefault?.();
        setLoadError(parsed);
      }
    };

    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  if (loadError) {
    return <ClerkLoadFailureScreen error={loadError} />;
  }

  return <>{children}</>;
}
