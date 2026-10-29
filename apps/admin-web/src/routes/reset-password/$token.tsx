import React, { useEffect, useState } from 'react';
import { createRoute, Link } from '@tanstack/react-router';
import { Route as rootRoute } from '../__root';
import { apiClient } from '@/lib/api';
import { IconKey, IconCheck, IconAlertCircle } from '@tabler/icons-react';
import { toast } from 'sonner';

function ResetPasswordPage() {
  const { token } = Route.useParams();
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function validateToken() {
      try {
        setLoading(true);
        setError(null);
        const res = await apiClient.get<{ valid: boolean; email?: string; fullName?: string }>(
          `/public/password-reset/${token}`
        );
        setTokenValid(res.data.valid);
        setEmail(res.data.email || '');
        setFullName(res.data.fullName || '');
      } catch (err: any) {
        setTokenValid(false);
        setError(err?.message || 'Invalid or expired password reset link.');
      } finally {
        setLoading(false);
      }
    }
    validateToken();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    try {
      setSubmitting(true);
      await apiClient.post(`/public/password-reset/${token}`, {
        newPassword,
      });
      setSuccess(true);
      toast.success('Password successfully reset.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reset password.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-text">
        <div className="flex items-center gap-3 text-text-muted text-xs">
          <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span>Verifying password reset credentials...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6 text-text">
      <div className="max-w-md w-full bg-surface border border-border rounded-3xl p-8 shadow-xl space-y-6">
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-primary-subtle text-primary">
            <IconKey className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-text">
              Reset Administrator Password
            </h1>
            <p className="text-xs text-text-muted mt-0.5">ClinicEZ Governance Workstation</p>
          </div>
        </div>

        {success ? (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 space-y-3 text-center">
            <div className="font-semibold">Your password has been reset successfully!</div>
            <p>You can now sign in to the Governance Workstation with your new password.</p>
            <div className="pt-2">
              <Link
                to="/sign-in"
                className="inline-flex items-center justify-center px-5 py-2.5 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors"
              >
                Proceed to Sign In
              </Link>
            </div>
          </div>
        ) : !tokenValid ? (
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 space-y-2">
            <p className="font-semibold">Reset Link Expired or Invalid</p>
            <p>{error || 'This password reset link is invalid, expired, or has already been used.'}</p>
            <div className="pt-2">
              <Link
                to="/sign-in"
                className="text-primary hover:underline font-semibold"
              >
                Return to Sign In
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {email && (
              <div className="p-3 rounded-xl bg-surface-muted border border-border text-xs text-text-secondary">
                Account: <span className="font-semibold text-text">{fullName || email}</span> ({email})
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text">New Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-surface-muted border border-border text-text placeholder:text-text-muted focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text">Confirm Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className="w-full px-3.5 py-2 text-xs rounded-xl bg-surface-muted border border-border text-text placeholder:text-text-muted focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full px-5 py-2.5 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl transition-colors cursor-pointer shadow-sm"
            >
              {submitting ? 'Updating Password...' : 'Save New Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: 'reset-password/$token',
  component: ResetPasswordPage,
});
