import React, { useState, useEffect } from 'react';
import { adminService, TenantCleanupPreviewDto } from '@/services/admin.service';
import { toast } from 'sonner';
import {
  IconLoader,
  IconArchive,
  IconTrash,
  IconAlertTriangle,
  IconBuildingHospital,
  IconUsers,
  IconFileText,
  IconReceipt,
  IconCircleCheck,
  IconCircleX,
  IconX,
} from '@tabler/icons-react';

export interface TenantCleanupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  tenantId: string;
  tenantSlug: string;
  clinicName: string;
  archivedAt?: string | null;
}

export function TenantCleanupDialog({
  isOpen,
  onClose,
  onSuccess,
  tenantId,
  tenantSlug,
  clinicName,
  archivedAt,
}: TenantCleanupDialogProps) {
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<TenantCleanupPreviewDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'archive' | 'purge'>('archive');
  const [archiveReason, setArchiveReason] = useState('');
  const [confirmSlug, setConfirmSlug] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen || !tenantId) return;

    let mounted = true;
    setLoading(true);
    setError(null);
    setConfirmSlug('');
    setArchiveReason('');

    adminService
      .getTenantCleanupPreview(tenantId)
      .then((data) => {
        if (!mounted) return;
        setPreview(data);
        if (data.isEligibleForPurge && data.isOrphaned) {
          setActionType('purge');
        } else {
          setActionType('archive');
        }
      })
      .catch((err: any) => {
        if (!mounted) return;
        setError(
          err.response?.data?.message ||
            err.message ||
            'Failed to load pre-flight dependency check.'
        );
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen, tenantId]);

  const handleArchive = async () => {
    setSubmitting(true);
    try {
      await adminService.archiveTenant(tenantId, archiveReason);
      toast.success(`Workspace '${tenantSlug}' has been archived.`);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to archive tenant');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePurge = async () => {
    if (confirmSlug.trim() !== tenantSlug.trim()) {
      toast.error('Slug confirmation does not match exactly.');
      return;
    }
    setSubmitting(true);
    try {
      await adminService.purgeTenant(tenantId, confirmSlug.trim());
      toast.success(`Workspace '${tenantSlug}' has been permanently purged.`);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to purge tenant');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col text-text"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl ${
                actionType === 'purge'
                  ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              }`}
            >
              {actionType === 'purge' ? (
                <IconTrash className="h-5 w-5" />
              ) : (
                <IconArchive className="h-5 w-5" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-text">Workspace Offboarding & Cleanup</h2>
              <p className="text-xs text-text-muted mt-0.5">
                {clinicName} ({tenantSlug})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text cursor-pointer"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        {/* Action Type Toggle */}
        <div className="px-5 pt-4">
          <div className="grid grid-cols-2 p-1 bg-surface-muted rounded-xl border border-border text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActionType('archive')}
              className={`py-2 rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                actionType === 'archive'
                  ? 'bg-surface text-text shadow-xs'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              <IconArchive className="h-4 w-4" />
              <span>Soft Archive</span>
            </button>
            <button
              type="button"
              onClick={() => setActionType('purge')}
              className={`py-2 rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
                actionType === 'purge'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-text-muted hover:text-text'
              }`}
            >
              <IconTrash className="h-4 w-4" />
              <span>Permanent Purge</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-text-muted">
              <IconLoader className="h-6 w-6 animate-spin text-primary" />
              <span>Running pre-flight dependency check across database...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 space-y-2">
              <div className="font-semibold flex items-center gap-2">
                <IconAlertTriangle className="h-4 w-4" />
                <span>Pre-flight Inspection Failed</span>
              </div>
              <p>{error}</p>
            </div>
          ) : preview ? (
            <>
              {/* Dependency Check Overview Grid */}
              <div className="p-4 rounded-xl bg-surface-muted border border-border space-y-3">
                <div className="font-semibold text-text flex items-center justify-between">
                  <span>Pre-flight Inspection Results</span>
                  {preview.isOrphaned ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                      <IconAlertTriangle className="h-3 w-3" />
                      Orphan Workspace
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                      <IconCircleCheck className="h-3 w-3" />
                      Active Organization
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-2.5 rounded-lg bg-surface border border-border">
                    <div className="text-text-muted text-[10px]">Facilities</div>
                    <div className="font-bold text-sm text-text mt-0.5">{preview.facilitiesCount}</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-surface border border-border">
                    <div className="text-text-muted text-[10px]">Staff Accounts</div>
                    <div className="font-bold text-sm text-text mt-0.5">{preview.staffAccountsCount}</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-surface border border-border">
                    <div className="text-text-muted text-[10px]">Patient Records</div>
                    <div className="font-bold text-sm text-text mt-0.5">{preview.activePatientRecordsCount}</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-surface border border-border">
                    <div className="text-text-muted text-[10px]">Invoices</div>
                    <div className="font-bold text-sm text-text mt-0.5">{preview.invoicesCount}</div>
                  </div>
                </div>

                <div className="text-[11px] text-text-muted flex items-center justify-between pt-1">
                  <span>
                    Workspace Age:{' '}
                    {preview.createdAt
                      ? `${Math.max(0, Math.floor((Date.now() - new Date(preview.createdAt).getTime()) / 86_400_000))} days`
                      : '—'}
                  </span>
                  <span>
                    Purge Eligible:{' '}
                    {preview.isEligibleForPurge ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Yes</span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">Requires Soft-Archive</span>
                    )}
                  </span>
                </div>

                {preview.orphanReason && (
                  <div className="text-[11px] text-amber-600 dark:text-amber-400 pt-1">
                    Orphan Classification: {preview.orphanReason}
                  </div>
                )}

                {preview.ineligibilityReasons && preview.ineligibilityReasons.length > 0 && (
                  <ul className="text-[11px] text-text-secondary list-disc pl-4 space-y-0.5 pt-1">
                    {preview.ineligibilityReasons.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Action Description & Forms */}
              {actionType === 'archive' ? (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-text-secondary leading-relaxed space-y-1">
                    <p className="font-semibold text-text">Soft Archive Operation</p>
                    <p>
                      Archiving disables clinical login for all clinic staff and freezes telemetry. Data remains safely retained in the database and can be reactivated if needed.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-medium text-text">Archive Reason (Optional)</label>
                    <textarea
                      value={archiveReason}
                      onChange={(e) => setArchiveReason(e.target.value)}
                      placeholder="e.g. Clinic closure, non-payment of subscription, voluntary cancellation..."
                      rows={2}
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text placeholder:text-text-muted focus:outline-hidden focus:ring-1 focus:ring-primary text-xs"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 leading-relaxed space-y-1">
                    <p className="font-semibold flex items-center gap-1.5 text-red-700 dark:text-red-300">
                      <IconAlertTriangle className="h-4 w-4" />
                      Permanent Irreversible Purge
                    </p>
                    <p>
                      This will permanently delete this tenant database row, all associated branch facilities, staff assignments, and billing history. This action CANNOT be undone.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-medium text-text">
                      Type <span className="font-mono font-bold text-red-600 dark:text-red-400">{tenantSlug}</span> to confirm:
                    </label>
                    <input
                      type="text"
                      value={confirmSlug}
                      onChange={(e) => setConfirmSlug(e.target.value)}
                      placeholder={tenantSlug}
                      className="w-full px-3 py-2 rounded-xl bg-surface-muted border border-border text-text font-mono text-xs focus:outline-hidden focus:ring-1 focus:ring-red-500"
                    />
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-surface-muted border-t border-border flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-xs font-medium text-text-secondary hover:text-text rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>

          {actionType === 'archive' ? (
            <button
              type="button"
              onClick={handleArchive}
              disabled={submitting || loading || !preview}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50"
            >
              {submitting && <IconLoader className="h-4 w-4 animate-spin" />}
              <span>{archivedAt ? 'Re-Archive Workspace' : 'Archive Workspace'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePurge}
              disabled={submitting || loading || confirmSlug.trim() !== tenantSlug.trim()}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50"
            >
              {submitting && <IconLoader className="h-4 w-4 animate-spin" />}
              <span>Permanently Purge Workspace</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
