"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  adminService,
  TenantCleanupPreviewDto
} from "@/services/admin.service";
import {
  IconLoader,
  IconArchive,
  IconTrash,
  IconShieldCheck,
  IconAlertTriangle,
  IconInfoCircle,
  IconUsers,
  IconFileText,
  IconReceipt,
  IconBuildingHospital,
  IconCircleCheck,
  IconCircleX
} from "@tabler/icons-react";

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
  archivedAt
}: TenantCleanupDialogProps) {
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<TenantCleanupPreviewDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"archive" | "purge">("archive");
  const [archiveReason, setArchiveReason] = useState("");
  const [confirmSlug, setConfirmSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen || !tenantId) return;

    let mounted = true;
    setLoading(true);
    setError(null);
    setConfirmSlug("");
    setArchiveReason("");

    adminService.getTenantCleanupPreview(tenantId)
      .then((data) => {
        if (!mounted) return;
        setPreview(data);
        // Default to purge if it's eligible and orphaned; otherwise default to archive
        if (data.isEligibleForPurge && data.isOrphaned) {
          setActionType("purge");
        } else {
          setActionType("archive");
        }
      })
      .catch((err: any) => {
        if (!mounted) return;
        setError(err.response?.data?.message || err.message || "Failed to load pre-flight dependency check.");
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
      toast.error(err.response?.data?.message || err.message || "Failed to archive workspace.");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePurge = async () => {
    if (confirmSlug.trim().toLowerCase() !== tenantSlug.toLowerCase()) {
      toast.error("Please type the exact workspace slug to confirm permanent deletion.");
      return;
    }

    setSubmitting(true);
    try {
      await adminService.purgeTenant(tenantId, confirmSlug.trim());
      toast.success(`Ghost workspace '${tenantSlug}' permanently purged. Slug is now freed.`);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to purge workspace.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 sm:p-8">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <IconAlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight">
                Workspace Offboarding & Cleanup
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Manage lifecycle, archival, or permanent deletion for <code className="font-mono text-primary font-semibold">{tenantSlug}</code>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500">
            <IconLoader className="h-8 w-8 animate-spin text-primary" />
            <p className="text-xs font-semibold">Running zero-data pre-flight dependency check...</p>
          </div>
        ) : error ? (
          <div className="p-6 rounded-2xl bg-destructive/10 text-destructive border border-destructive/20 text-center space-y-2">
            <IconCircleX className="h-8 w-8 mx-auto" />
            <p className="text-sm font-bold">Failed to Inspect Workspace</p>
            <p className="text-xs opacity-90">{error}</p>
          </div>
        ) : preview ? (
          <div className="space-y-6 mt-2">
            {/* Eligibility Banner */}
            {preview.isEligibleForPurge ? (
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 flex items-start gap-3">
                <IconCircleCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-emerald-900 dark:text-emerald-300">
                      Zero Clinical/Financial Records Detected
                    </span>
                    <Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 text-[10px] py-0 px-2 font-bold">
                      Safe to Purge
                    </Badge>
                  </div>
                  <p className="text-emerald-700 dark:text-emerald-400">
                    This workspace has no active patients or billing transactions. It is a ghost registration eligible for permanent removal.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 flex items-start gap-3">
                <IconShieldCheck className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-amber-900 dark:text-amber-300">
                      Protected Workspace Invariants
                    </span>
                    <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-300 text-[10px] py-0 px-2 font-bold">
                      Archival Only
                    </Badge>
                  </div>
                  <p className="text-amber-700 dark:text-amber-400">
                    Hard purge is strictly prohibited to comply with medical record retention and tax audit laws:
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5 text-amber-800 dark:text-amber-300 mt-1">
                    {preview.ineligibilityReasons.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Invariant Dependency Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-center">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Patient Records</span>
                <span className={`text-lg font-mono font-bold ${preview.activePatientRecordsCount > 0 ? "text-amber-600" : "text-slate-700 dark:text-slate-300"}`}>
                  {preview.activePatientRecordsCount}
                </span>
              </div>
              <div className="p-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-center">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Facilities / Clinics</span>
                <span className="text-lg font-mono font-bold text-slate-700 dark:text-slate-300">
                  {preview.facilitiesCount}
                </span>
              </div>
              <div className="p-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-center">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Invoices</span>
                <span className={`text-lg font-mono font-bold ${preview.invoicesCount > 0 ? "text-amber-600" : "text-slate-700 dark:text-slate-300"}`}>
                  {preview.invoicesCount}
                </span>
              </div>
              <div className="p-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-center">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Tax Receipts</span>
                <span className={`text-lg font-mono font-bold ${preview.receiptsCount > 0 ? "text-amber-600" : "text-slate-700 dark:text-slate-300"}`}>
                  {preview.receiptsCount}
                </span>
              </div>
            </div>

            {/* Action Selection Tabs */}
            <div className="flex border border-slate-200 dark:border-slate-800 rounded-2xl p-1 bg-slate-50 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setActionType("archive")}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  actionType === "archive"
                    ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <IconArchive className="h-4 w-4" />
                Archive Workspace (Safe)
              </button>
              <button
                type="button"
                onClick={() => setActionType("purge")}
                disabled={!preview.isEligibleForPurge}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  actionType === "purge"
                    ? "bg-destructive text-destructive-foreground shadow-xs"
                    : preview.isEligibleForPurge
                    ? "text-destructive hover:bg-destructive/10"
                    : "opacity-40 cursor-not-allowed text-slate-400"
                }`}
                title={!preview.isEligibleForPurge ? "Locked due to clinical or financial records" : ""}
              >
                <IconTrash className="h-4 w-4" />
                Permanently Purge Ghost
              </button>
            </div>

            {/* Action Details */}
            {actionType === "archive" ? (
              <div className="space-y-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30">
                <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
                  <IconInfoCircle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                  <p>
                    Archiving marks the workspace as archived, suspends all branch facilities, and revokes Interop Hub keys. All clinical and financial records are preserved for legal compliance.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="archiveReason" className="text-xs font-bold">
                    Archival Note / Reason (Optional)
                  </Label>
                  <Input
                    id="archiveReason"
                    placeholder="e.g. Inactive trial account cleanup, client offboarded"
                    value={archiveReason}
                    onChange={(e) => setArchiveReason(e.target.value)}
                    className="rounded-xl text-xs"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4 p-4 rounded-2xl border border-destructive/20 bg-destructive/5 text-destructive">
                <div className="flex items-start gap-2.5 text-xs">
                  <IconAlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">Irreversible Action: Purge Ghost Workspace</p>
                    <p className="opacity-90 leading-relaxed">
                      This will permanently wipe this workspace and its configuration stubs from the database. The clinic slug <code className="font-bold underline">{tenantSlug}</code> will be immediately released back into the pool.
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 pt-2">
                  <Label htmlFor="confirmSlugInput" className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    To confirm, please type <code className="font-mono text-destructive font-bold">{tenantSlug}</code> below:
                  </Label>
                  <Input
                    id="confirmSlugInput"
                    placeholder={tenantSlug}
                    value={confirmSlug}
                    onChange={(e) => setConfirmSlug(e.target.value)}
                    className="rounded-xl text-xs font-mono border-destructive/30 focus-visible:ring-destructive text-destructive"
                  />
                </div>
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter className="mt-6 flex sm:justify-between items-center gap-3">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl text-xs font-semibold"
          >
            Cancel
          </Button>

          {actionType === "archive" ? (
            <Button
              onClick={handleArchive}
              disabled={submitting || Boolean(preview?.archivedAt)}
              className="rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white"
            >
              {submitting ? (
                <>
                  <IconLoader className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Archiving...
                </>
              ) : preview?.archivedAt ? (
                "Already Archived"
              ) : (
                <>
                  <IconArchive className="h-3.5 w-3.5 mr-1.5" />
                  Archive Workspace
                </>
              )}
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={handlePurge}
              disabled={submitting || confirmSlug.trim().toLowerCase() !== tenantSlug.toLowerCase()}
              className="rounded-xl text-xs font-bold"
            >
              {submitting ? (
                <>
                  <IconLoader className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Purging Ghost Workspace...
                </>
              ) : (
                <>
                  <IconTrash className="h-3.5 w-3.5 mr-1.5" />
                  Permanently Purge Workspace
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
