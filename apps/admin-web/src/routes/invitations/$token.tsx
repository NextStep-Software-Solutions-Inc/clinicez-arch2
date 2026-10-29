import React, { useEffect, useState } from 'react';
import { createRoute, Link } from '@tanstack/react-router';
import { Route as rootRoute } from '../__root';
import { adminService, AdminInvitationDetailsDto } from '@/services/admin.service';
import { useAuth } from '@clerk/clerk-react';
import { IconMailCheck, IconArrowRight } from '@tabler/icons-react';
import { toast } from 'sonner';
import { ClinicEzLogo } from '@/components/ClinicEzLogo';
import { setupAxiosInterceptors } from '@/lib/api';

function InvitationAcceptPage() {
  const { token } = Route.useParams();
  const [invite, setInvite] = useState<AdminInvitationDetailsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  let isSignedIn = false;
  try {
    const auth = useAuth();
    isSignedIn = Boolean(auth.isSignedIn);
    if (auth.getToken) {
      setupAxiosInterceptors(auth.getToken);
    }
  } catch {
    // outside clerk provider in unit tests
  }

  useEffect(() => {
    async function fetchInvite() {
      try {
        setLoading(true);
        setError(null);
        const res = await adminService.getInvitationDetails(token);
        setInvite(res);
      } catch (err: any) {
        setError(err?.message || 'Invalid or expired invitation token.');
      } finally {
        setLoading(false);
      }
    }
    fetchInvite();
  }, [token]);

  const handleAccept = async () => {
    try {
      setAccepting(true);
      await adminService.acceptInvitation(token);
      toast.success('Invitation accepted successfully! Welcome to Clinic EZ Governance.');
      window.location.href = '/';
    } catch (err: any) {
      toast.error(err?.message || 'Failed to accept invitation.');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-text">
        <div className="flex items-center gap-3 text-text-muted text-xs">
          <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span>Validating administrative invitation...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6 text-text">
      <div className="max-w-md w-full bg-surface border border-border rounded-3xl p-8 shadow-xl space-y-6">
        <div className="pb-4 border-b border-border flex items-center justify-between">
          <ClinicEzLogo
            markClassName="h-7 w-8 shrink-0"
            textClassName="text-base font-bold tracking-tight text-text"
            subtitle="Governance"
          />
        </div>
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-primary-subtle text-primary">
            <IconMailCheck className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-text">
              Platform Admin Invitation
            </h1>
            <p className="text-xs text-text-muted mt-0.5">Clinic EZ Governance Workstation</p>
          </div>
        </div>

        {error ? (
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 space-y-2">
            <p className="font-semibold">Unable to accept invitation:</p>
            <p>{error}</p>
          </div>
        ) : invite ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-surface-muted border border-border text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-text-muted">Invitee:</span>
                <span className="font-semibold text-text">{invite.fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Email:</span>
                <span className="font-mono text-text">{invite.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Assigned Role:</span>
                <span className="font-semibold text-primary">{invite.roleName}</span>
              </div>
            </div>

            {isSignedIn ? (
              <button
                type="button"
                onClick={handleAccept}
                disabled={accepting}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer shadow-sm"
              >
                {accepting ? 'Activating Account...' : 'Accept Invitation & Enter Workstation'}
                <IconArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-text-muted text-center">
                  Sign in or create an account with <strong>{invite.email}</strong> to accept.
                </p>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <Link
                    to="/sign-in"
                    className="flex items-center justify-center px-4 py-2.5 text-xs font-semibold text-text bg-surface-muted hover:bg-border rounded-xl transition-colors"
                  >
                    Sign In
                  </Link>
                  <Link
                    to="/sign-up"
                    className="flex items-center justify-center px-4 py-2.5 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors"
                  >
                    Sign Up
                  </Link>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: 'invitations/$token',
  component: InvitationAcceptPage,
});
