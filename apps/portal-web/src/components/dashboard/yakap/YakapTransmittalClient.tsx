"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { branchService, type BranchDto } from "@/services/branch.service";
import {
  yakapService,
  type PortalYakapBranchSummaryDto,
  type PortalYakapSubmissionDto,
} from "@/services/yakap.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  IconFileCertificate,
  IconBuilding,
  IconShieldCheck,
  IconAlertTriangle,
  IconCheck,
  IconLoader,
  IconRefresh,
  IconSearch,
  IconAlertCircle,
  IconX,
  IconClock,
  IconCloudCheck,
} from "@tabler/icons-react";
import { toast } from "sonner";

export default function YakapTransmittalClient() {
  const params = useParams();
  const tenantSlug = (params?.tenant as string) || "demo-tenant";

  // Branch state
  const [branches, setBranches] = useState<BranchDto[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [loadingBranches, setLoadingBranches] = useState(true);

  // Summary Telemetry state
  const [summary, setSummary] = useState<PortalYakapBranchSummaryDto | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [isSyncingMasterlist, setIsSyncingMasterlist] = useState(false);

  // Submissions Ledger state
  const [submissions, setSubmissions] = useState<PortalYakapSubmissionDto[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // In-flight Action state
  const [pollingId, setPollingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Non-PHI Error Inspector Modal state
  const [inspectedSubmission, setInspectedSubmission] = useState<PortalYakapSubmissionDto | null>(null);

  const activeBranch = useMemo(
    () => branches.find((b) => b.id === selectedBranchId),
    [branches, selectedBranchId]
  );

  // 1. Load branches on mount
  useEffect(() => {
    async function loadBranches() {
      setLoadingBranches(true);
      try {
        const list = await branchService.getBranches(tenantSlug);
        setBranches(list);
        if (list.length > 0 && !selectedBranchId) {
          // Default to first accredited branch if available, else first branch
          const firstAccredited = list.find((b) => b.isPhilHealthAccredited && b.philHealthAccreditationNumber);
          setSelectedBranchId(firstAccredited ? firstAccredited.id : list[0].id);
        }
      } catch (err: unknown) {
        console.error("Failed to load branches", err);
        toast.error("Could not load branches.");
      } finally {
        setLoadingBranches(false);
      }
    }
    loadBranches();
  }, [tenantSlug]);

  // 2. Load Telemetry Summary & Submissions whenever selectedBranchId changes
  const loadBranchData = async (branchId: string) => {
    if (!branchId) return;
    setLoadingSummary(true);
    setLoadingSubmissions(true);

    try {
      const [sum, subs] = await Promise.all([
        yakapService.getBranchSummary(branchId).catch((err) => {
          console.warn("Summary fetch error", err);
          return null;
        }),
        yakapService.getSubmissions(branchId).catch((err) => {
          console.warn("Submissions fetch error", err);
          return [];
        }),
      ]);

      setSummary(sum);
      setSubmissions(subs || []);
    } catch (err: unknown) {
      console.error("Failed to load YAKAP branch data", err);
      toast.error("Failed to load YAKAP telemetry data.");
    } finally {
      setLoadingSummary(false);
      setLoadingSubmissions(false);
    }
  };

  useEffect(() => {
    if (selectedBranchId) {
      loadBranchData(selectedBranchId);
    }
  }, [selectedBranchId]);

  // 3. Action Handlers
  const handleSyncMasterlist = async () => {
    if (!selectedBranchId) return;
    setIsSyncingMasterlist(true);
    try {
      const res = await yakapService.syncMasterlist(selectedBranchId);
      if (res.success) {
        toast.success(
          res.message ||
            `Masterlist synchronized: ${res.recordsAdded} added, ${res.recordsUpdated} updated (${res.totalActiveCount} total).`
        );
        // Refresh summary
        const updatedSummary = await yakapService.getBranchSummary(selectedBranchId);
        setSummary(updatedSummary);
      } else {
        toast.error(res.message || "Masterlist sync completed with warnings.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      toast.error("Masterlist sync failed: " + msg);
    } finally {
      setIsSyncingMasterlist(false);
    }
  };

  const handlePollStatus = async (id: string) => {
    if (!selectedBranchId) return;
    setPollingId(id);
    try {
      const updated = await yakapService.pollSubmissionStatus(selectedBranchId, id);
      toast.success(`Polled status: ${updated.processingStatus}`);
      setSubmissions((prev) => prev.map((s) => (s.id === id ? updated : s)));
      // Also refresh summary KPI counts
      const updatedSummary = await yakapService.getBranchSummary(selectedBranchId);
      setSummary(updatedSummary);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Poll failed";
      toast.error("Status poll failed: " + msg);
    } finally {
      setPollingId(null);
    }
  };

  const handleRetrySubmission = async (id: string) => {
    if (!selectedBranchId) return;
    setRetryingId(id);
    try {
      const updated = await yakapService.retrySubmission(selectedBranchId, id);
      toast.success(`Submission queued for retry: ${updated.processingStatus}`);
      setSubmissions((prev) => prev.map((s) => (s.id === id ? updated : s)));
      // Also refresh summary KPI counts
      const updatedSummary = await yakapService.getBranchSummary(selectedBranchId);
      setSummary(updatedSummary);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Retry failed";
      toast.error("Submission retry failed: " + msg);
    } finally {
      setRetryingId(null);
    }
  };

  // 4. Filtered Submissions (Filtered strictly by non-PHI codes)
  const filteredSubmissions = useMemo(() => {
    return submissions.filter((item) => {
      // Status filter
      if (statusFilter !== "all" && item.processingStatus.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }
      // Type filter
      if (typeFilter !== "all" && item.submissionType.toLowerCase() !== typeFilter.toLowerCase()) {
        return false;
      }
      // Search query (matches PatientCode, LocalTx, UploadTx, or YesReferenceNo)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchCode = item.patientCode.toLowerCase().includes(q);
        const matchLocal = item.localTransactionNo?.toLowerCase().includes(q);
        const matchUpload = item.uploadTransactionNo?.toLowerCase().includes(q);
        const matchRef = item.yesReferenceNo?.toLowerCase().includes(q);
        const matchCase = item.caseNo?.toLowerCase().includes(q);
        if (!matchCode && !matchLocal && !matchUpload && !matchRef && !matchCase) {
          return false;
        }
      }
      return true;
    });
  }, [submissions, statusFilter, typeFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* ── HEADER & BRANCH SELECTOR ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <IconFileCertificate className="h-5 w-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              PhilHealth YAKAP 2.0 Telemetry Console
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Zero-PHI real-time submission tracking, asynchronous batch polling, and PCAPI Service 05 Masterlist oversight.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              disabled={loadingBranches}
              className="h-9 px-3 py-1.5 rounded-xl border border-input text-xs bg-background text-foreground font-medium focus:ring-2 focus:ring-primary focus:outline-none pr-8"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.philHealthAccreditationNumber ? `(${b.philHealthAccreditationNumber})` : "(Unaccredited)"}
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => selectedBranchId && loadBranchData(selectedBranchId)}
            disabled={loadingSummary || loadingSubmissions}
            className="h-9 rounded-xl text-xs font-semibold gap-1.5"
            title="Refresh Telemetry"
          >
            <IconRefresh className={`h-3.5 w-3.5 ${loadingSummary || loadingSubmissions ? "animate-spin text-primary" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* ── BRANCH ACCREDITATION BANNER ── */}
      {activeBranch && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-muted/40 border border-border text-xs">
          <div className="flex items-center gap-2.5">
            <IconBuilding className="h-4 w-4 text-primary shrink-0" />
            <div>
              <span className="font-semibold text-foreground mr-2">{activeBranch.name}</span>
              {activeBranch.philHealthAccreditationNumber ? (
                <span className="font-mono text-muted-foreground">
                  Accreditation: <strong className="text-foreground">{activeBranch.philHealthAccreditationNumber}</strong>
                  {activeBranch.philHealthPmccNumber && ` • PMCC: ${activeBranch.philHealthPmccNumber}`}
                </span>
              ) : (
                <span className="text-destructive font-medium">No PhilHealth Accreditation Configured</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeBranch.hasSecretKey ? (
              <Badge variant="outline" className="text-primary bg-primary/10 border-primary/20 text-[11px] font-normal gap-1">
                <IconShieldCheck className="h-3 w-3 text-primary" />
                PCAPI Secured
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground text-[11px] font-normal">
                Credentials Incomplete
              </Badge>
            )}
            <Badge variant="outline" className="text-muted-foreground font-mono text-[10px]">
              {activeBranch.philHealthBaseUrl || "https://pcapi.philhealth.gov.ph"}
            </Badge>
          </div>
        </div>
      )}

      {/* ── 4 KPI TELEMETRY CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Empaneled & Masterlist */}
        <Card className="rounded-2xl border-border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Empaneled / Masterlist
              </CardDescription>
              <span className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <IconShieldCheck className="h-4 w-4" />
              </span>
            </div>
            <CardTitle className="text-2xl font-black text-foreground">
              {loadingSummary ? "—" : (summary?.empaneledCount ?? 0).toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Selected: <strong>{summary?.selectedCount ?? 0}</strong></span>
              <span>Total Active: <strong>{summary?.masterlistTotalCount ?? 0}</strong></span>
            </div>
            <div className="pt-2 border-t border-border flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncMasterlist}
                disabled={isSyncingMasterlist || !selectedBranchId}
                className="h-7 px-2.5 rounded-lg text-[11px] font-semibold gap-1 w-full bg-background hover:bg-muted"
              >
                {isSyncingMasterlist ? (
                  <>
                    <IconLoader className="h-3 w-3 animate-spin text-primary" />
                    <span>Syncing...</span>
                  </>
                ) : (
                  <>
                    <IconRefresh className="h-3 w-3 text-primary" />
                    <span>Sync Masterlist</span>
                  </>
                )}
              </Button>
            </div>
            {summary?.lastMasterlistSyncAtUtc && (
              <p className="text-[10px] text-muted-foreground text-center truncate">
                Last: {new Date(summary.lastMasterlistSyncAtUtc).toLocaleDateString()} {new Date(summary.lastMasterlistSyncAtUtc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Card 2: Pending Polling (U...) */}
        <Card className="rounded-2xl border-border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Pending Polling
              </CardDescription>
              <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <IconClock className="h-4 w-4" />
              </span>
            </div>
            <CardTitle className="text-2xl font-black text-amber-600 dark:text-amber-400">
              {loadingSummary ? "—" : (summary?.pendingPollingCount ?? 0).toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-[11px] text-muted-foreground leading-snug">
              Submissions awaiting PhilHealth asynchronous batch validation (23B <code className="font-mono text-[10px]">U...</code> upload codes).
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Accepted Uploads */}
        <Card className="rounded-2xl border-border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Accepted Uploads
              </CardDescription>
              <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <IconCloudCheck className="h-4 w-4" />
              </span>
            </div>
            <CardTitle className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {loadingSummary ? "—" : (summary?.acceptedUploadsCount ?? 0).toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-[11px] text-muted-foreground leading-snug">
              Verified transmissions with statutory <code className="font-mono text-[10px]">MCA...</code> PhilHealth confirmation numbers.
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Rejected / Failed */}
        <Card className="rounded-2xl border-border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Rejected / Failed
              </CardDescription>
              <span className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <IconAlertTriangle className="h-4 w-4" />
              </span>
            </div>
            <CardTitle className="text-2xl font-black text-rose-600 dark:text-rose-400">
              {loadingSummary ? "—" : (summary?.rejectedOrFailedCount ?? 0).toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-[11px] text-muted-foreground leading-snug">
              Transmissions rejected by PhilHealth validation. Inspect non-PHI error diagnostics and retry.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── SUBMISSIONS LEDGER ── */}
      <Card className="rounded-2xl border-border bg-card shadow-sm">
        <CardHeader className="pb-4 border-b border-border">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="text-base font-bold text-foreground">
                Submissions &amp; Claims Telemetry Ledger
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Filtered strictly by anonymized Patient Code and statutory 23B transaction identifiers.
              </CardDescription>
            </div>

            {/* Filter controls */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative w-full sm:w-60">
                <IconSearch className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search PatientCode, Tx No..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs rounded-xl"
                />
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 px-2.5 rounded-xl border border-input text-xs bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="submitted">Submitted</option>
                <option value="accepted">Accepted</option>
                <option value="rejected">Rejected</option>
                <option value="failed">Failed</option>
              </select>

              {/* Type Filter */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-8 px-2.5 rounded-xl border border-input text-xs bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
              >
                <option value="all">All Types</option>
                <option value="fpe">FPE</option>
                <option value="consultation">Consultation</option>
                <option value="diagnostic">Diagnostic</option>
                <option value="medicine">Medicine</option>
                <option value="referral">Referral</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loadingSubmissions ? (
            <div className="p-8 text-center space-y-3">
              <IconLoader className="h-6 w-6 animate-spin text-primary mx-auto" />
              <p className="text-xs text-muted-foreground">Loading submissions ledger...</p>
            </div>
          ) : filteredSubmissions.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="p-3 rounded-2xl bg-muted/60 text-muted-foreground inline-block">
                <IconFileCertificate className="h-8 w-8" />
              </div>
              <h3 className="text-sm font-bold text-foreground">No Submissions Found</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {searchQuery || statusFilter !== "all" || typeFilter !== "all"
                  ? "No transmissions matched your active filters."
                  : "No submissions recorded for this branch yet. Clinical transmittals from clinic facilities will appear here."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-muted/40 text-muted-foreground border-b border-border uppercase font-semibold text-[10px] tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3.5">Patient Code</th>
                    <th className="py-2.5 px-3.5">Type</th>
                    <th className="py-2.5 px-3.5">23B Local Tx No</th>
                    <th className="py-2.5 px-3.5">23B Upload Tx No</th>
                    <th className="py-2.5 px-3.5">PhilHealth Ref No</th>
                    <th className="py-2.5 px-3.5">Status</th>
                    <th className="py-2.5 px-3.5">Submitted</th>
                    <th className="py-2.5 px-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredSubmissions.map((sub) => {
                    const isPending = sub.processingStatus === "Pending" || sub.processingStatus === "Submitted";
                    const isFailed = sub.processingStatus === "Rejected" || sub.processingStatus === "Failed";
                    const isAccepted = sub.processingStatus === "Accepted";

                    return (
                      <tr key={sub.id} className="hover:bg-muted/30 transition-colors">
                        {/* Patient Code (Monospace, Zero-PHI) */}
                        <td className="py-3 px-3.5 font-mono font-bold text-foreground">
                          <span className="px-2 py-0.5 rounded-md bg-muted border border-border">
                            {sub.patientCode}
                          </span>
                        </td>

                        {/* Submission Type */}
                        <td className="py-3 px-3.5">
                          <Badge variant="outline" className="font-semibold text-[10px] py-0">
                            {sub.submissionType}
                          </Badge>
                        </td>

                        {/* 23B Local Transaction No */}
                        <td className="py-3 px-3.5 font-mono text-muted-foreground text-[11px]">
                          {sub.localTransactionNo || "—"}
                        </td>

                        {/* 23B Upload Transaction No */}
                        <td className="py-3 px-3.5 font-mono font-medium text-foreground text-[11px]">
                          {sub.uploadTransactionNo ? (
                            <span className="text-primary font-bold">{sub.uploadTransactionNo}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* PhilHealth Ref No (MCA...) */}
                        <td className="py-3 px-3.5 font-mono text-[11px]">
                          {sub.yesReferenceNo ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">{sub.yesReferenceNo}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Processing Status Badge */}
                        <td className="py-3 px-3.5">
                          {isAccepted && (
                            <Badge variant="outline" className="text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-[10px]">
                              Accepted
                            </Badge>
                          )}
                          {isPending && (
                            <Badge variant="outline" className="text-amber-700 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-[10px] gap-1">
                              <IconClock className="h-2.5 w-2.5 animate-pulse" />
                              {sub.processingStatus}
                            </Badge>
                          )}
                          {isFailed && (
                            <Badge variant="outline" className="text-rose-700 bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-[10px]">
                              {sub.processingStatus}
                            </Badge>
                          )}
                          {!isAccepted && !isPending && !isFailed && (
                            <Badge variant="outline" className="text-muted-foreground text-[10px]">
                              {sub.processingStatus}
                            </Badge>
                          )}
                        </td>

                        {/* Submitted At */}
                        <td className="py-3 px-3.5 text-muted-foreground text-[11px] whitespace-nowrap">
                          {sub.submittedAtUtc
                            ? new Date(sub.submittedAtUtc).toLocaleDateString() +
                              " " +
                              new Date(sub.submittedAtUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                            : "—"}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Poll Status for Pending / Submitted */}
                            {isPending && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePollStatus(sub.id)}
                                disabled={pollingId === sub.id}
                                className="h-7 px-2 rounded-lg text-[11px] font-semibold gap-1"
                                title="Poll latest PCAPI validation status"
                              >
                                {pollingId === sub.id ? (
                                  <IconLoader className="h-3 w-3 animate-spin text-primary" />
                                ) : (
                                  <IconRefresh className="h-3 w-3 text-primary" />
                                )}
                                <span>Poll</span>
                              </Button>
                            )}

                            {/* Retry for Rejected / Failed */}
                            {isFailed && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRetrySubmission(sub.id)}
                                disabled={retryingId === sub.id}
                                className="h-7 px-2 rounded-lg text-[11px] font-semibold gap-1 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                title="Retry PCAPI submission"
                              >
                                {retryingId === sub.id ? (
                                  <IconLoader className="h-3 w-3 animate-spin" />
                                ) : (
                                  <IconRefresh className="h-3 w-3" />
                                )}
                                <span>Retry</span>
                              </Button>
                            )}

                            {/* View Issues if any errors */}
                            {(sub.errors?.length > 0 || sub.lastErrorMessage) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setInspectedSubmission(sub)}
                                className="h-7 px-2 rounded-lg text-[11px] text-muted-foreground hover:text-foreground"
                                title="View non-PHI validation diagnostics"
                              >
                                <IconAlertCircle className="h-3.5 w-3.5 text-rose-500" />
                                <span className="hidden md:inline">Issues</span>
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── NON-PHI ERROR INSPECTOR MODAL ── */}
      <Dialog open={!!inspectedSubmission} onOpenChange={(open) => !open && setInspectedSubmission(null)}>
        <DialogContent className="max-w-xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <IconAlertCircle className="h-5 w-5 text-rose-500" />
              Non-PHI Submission Diagnostics
            </DialogTitle>
            <DialogDescription className="text-xs">
              PhilHealth PCAPI validation issues for transaction{" "}
              <code className="font-mono font-bold text-foreground">{inspectedSubmission?.localTransactionNo}</code>.
            </DialogDescription>
          </DialogHeader>

          {inspectedSubmission && (
            <div className="space-y-4 py-2 text-xs">
              {/* Submission Metadata Strip */}
              <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-muted/40 border border-border text-[11px]">
                <div>
                  <span className="text-muted-foreground block">Patient Code</span>
                  <span className="font-mono font-bold text-foreground">{inspectedSubmission.patientCode}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Submission Type</span>
                  <span className="font-semibold text-foreground">{inspectedSubmission.submissionType}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Attempt Count</span>
                  <span className="font-semibold text-foreground">{inspectedSubmission.attemptCount}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Processing Status</span>
                  <Badge variant="outline" className="text-rose-700 bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-[10px]">
                    {inspectedSubmission.processingStatus}
                  </Badge>
                </div>
              </div>

              {/* SHA-256 Payload Hash */}
              {inspectedSubmission.payloadSha256Hash && (
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-foreground">Payload SHA-256 Hash</span>
                  <div className="p-2 rounded-lg bg-muted/60 font-mono text-[10px] break-all border border-border text-muted-foreground">
                    {inspectedSubmission.payloadSha256Hash}
                  </div>
                </div>
              )}

              {/* Last Error Message */}
              {inspectedSubmission.lastErrorMessage && (
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-foreground">Error Summary</span>
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-800 dark:text-rose-300 text-xs">
                    {inspectedSubmission.lastErrorMessage}
                  </div>
                </div>
              )}

              {/* Field-level Validation Errors Table */}
              {inspectedSubmission.errors && inspectedSubmission.errors.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-foreground">
                    Field Validation Issues ({inspectedSubmission.errors.length})
                  </span>
                  <div className="border border-border rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-[11px] text-left">
                      <thead className="bg-muted/60 text-muted-foreground font-semibold text-[10px] uppercase border-b border-border">
                        <tr>
                          <th className="py-2 px-3">Field Path</th>
                          <th className="py-2 px-3">Code</th>
                          <th className="py-2 px-3">Issue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {inspectedSubmission.errors.map((err, idx) => (
                          <tr key={idx} className="hover:bg-muted/30">
                            <td className="py-2 px-3 font-mono text-foreground font-medium">{err.fieldPath}</td>
                            <td className="py-2 px-3 font-mono text-muted-foreground text-[10px]">
                              {err.errorCode || "—"}
                            </td>
                            <td className="py-2 px-3 text-muted-foreground">{err.issue}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setInspectedSubmission(null)}
              className="rounded-xl text-xs font-semibold"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
