"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { resolveDashboardNavHref } from "@/components/dashboard/nav-main";
import { branchService, type BranchDto } from "@/services/branch.service";
import {
  yakapService,
  type PortalYakapBranchSummaryDto,
  type PortalYakapSubmissionDto,
} from "@/services/yakap.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
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
  IconArrowRight,
  IconCheck,
  IconLoader,
  IconRefresh,
  IconSearch,
  IconAlertCircle,
  IconClock,
  IconCloudCheck,
  IconX,
} from "@tabler/icons-react";
import { toast } from "sonner";

export type YakapStatusFilter =
  | "all"
  | "pending_polling"
  | "pending"
  | "submitted"
  | "accepted"
  | "rejected_failed"
  | "rejected"
  | "failed";

export function resolvePcapiEnvironmentLabel(baseUrl?: string | null): {
  label: "Staging" | "Production";
  url: string;
} {
  const url = baseUrl?.trim() || "https://pcapi.philhealth.gov.ph";
  const isStaging = /(staging|sandbox|uat|test|dev|localhost|127\.0\.0\.1|mock)/i.test(url);
  return {
    label: isStaging ? "Staging" : "Production",
    url,
  };
}

export function buildBranchPhilHealthSetupHref(
  tenantSlug: string,
  branchId: string,
  onSubdomain?: boolean,
): string {
  return resolveDashboardNavHref(
    tenantSlug,
    `/dashboard/branches/${branchId}?tab=philhealth`,
    onSubdomain,
  );
}

export function filterYakapSubmissions(
  submissions: ReadonlyArray<PortalYakapSubmissionDto>,
  filters: {
    status: YakapStatusFilter | string;
    type: string;
    query: string;
  },
): PortalYakapSubmissionDto[] {
  return submissions.filter((item) => {
    const statusLower = (filters.status || "all").toLowerCase();
    const itemStatusLower = item.processingStatus.toLowerCase();

    if (statusLower === "pending_polling") {
      if (itemStatusLower !== "pending" && itemStatusLower !== "submitted") {
        return false;
      }
    } else if (statusLower === "rejected_failed") {
      if (itemStatusLower !== "rejected" && itemStatusLower !== "failed") {
        return false;
      }
    } else if (statusLower !== "all" && itemStatusLower !== statusLower) {
      return false;
    }

    if (filters.type !== "all" && item.submissionType.toLowerCase() !== filters.type.toLowerCase()) {
      return false;
    }

    const q = filters.query.trim().toLowerCase();
    if (q) {
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
}

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
  const [statusFilter, setStatusFilter] = useState<YakapStatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // In-flight Action state
  const [pollingId, setPollingId] = useState<string | null>(null);
  const [isPollingAll, setIsPollingAll] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Non-PHI Error Inspector Modal state
  const [inspectedSubmission, setInspectedSubmission] = useState<PortalYakapSubmissionDto | null>(null);

  const activeBranch = useMemo(
    () => branches.find((b) => b.id === selectedBranchId),
    [branches, selectedBranchId],
  );

  // 1. Load branches on mount
  useEffect(() => {
    async function loadBranches() {
      setLoadingBranches(true);
      try {
        const list = await branchService.getBranches(tenantSlug);
        setBranches(list);
        if (list.length > 0 && !selectedBranchId) {
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
    void loadBranches();
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
      void loadBranchData(selectedBranchId);
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
            `Masterlist synchronized: ${res.recordsAdded} added, ${res.recordsUpdated} updated (${res.totalActiveCount} total).`,
        );
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
      const updatedSummary = await yakapService.getBranchSummary(selectedBranchId);
      setSummary(updatedSummary);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Poll failed";
      toast.error("Status poll failed: " + msg);
    } finally {
      setPollingId(null);
    }
  };

  const pendingSubmissions = useMemo(
    () =>
      submissions.filter(
        (s) => s.processingStatus === "Pending" || s.processingStatus === "Submitted",
      ),
    [submissions],
  );

  const handlePollAllPending = async () => {
    if (!selectedBranchId) return;
    if (pendingSubmissions.length === 0) {
      await loadBranchData(selectedBranchId);
      return;
    }

    setIsPollingAll(true);
    let succeeded = 0;
    let failed = 0;
    try {
      const results = await Promise.allSettled(
        pendingSubmissions.map((sub) => yakapService.pollSubmissionStatus(selectedBranchId, sub.id)),
      );
      const updatedById = new Map<string, PortalYakapSubmissionDto>();
      results.forEach((result) => {
        if (result.status === "fulfilled") {
          succeeded++;
          updatedById.set(result.value.id, result.value);
        } else {
          failed++;
        }
      });

      if (updatedById.size > 0) {
        setSubmissions((prev) => prev.map((s) => updatedById.get(s.id) ?? s));
      }
      const updatedSummary = await yakapService.getBranchSummary(selectedBranchId);
      setSummary(updatedSummary);

      if (failed === 0) {
        toast.success(`Polled ${succeeded} pending submission${succeeded === 1 ? "" : "s"}.`);
      } else {
        toast.warning(
          `Polled ${succeeded} submission${succeeded === 1 ? "" : "s"}; ${failed} failed to refresh.`,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Batch poll failed";
      toast.error("Failed to poll pending submissions: " + msg);
    } finally {
      setIsPollingAll(false);
    }
  };

  const handleRetrySubmission = async (id: string) => {
    if (!selectedBranchId) return;
    setRetryingId(id);
    try {
      const updated = await yakapService.retrySubmission(selectedBranchId, id);
      toast.success(`Submission queued for retry: ${updated.processingStatus}`);
      setSubmissions((prev) => prev.map((s) => (s.id === id ? updated : s)));
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
  const filteredSubmissions = useMemo(
    () =>
      filterYakapSubmissions(submissions, {
        status: statusFilter,
        type: typeFilter,
        query: searchQuery,
      }),
    [submissions, statusFilter, typeFilter, searchQuery],
  );

  const hasActiveFilters = Boolean(searchQuery.trim() || statusFilter !== "all" || typeFilter !== "all");
  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setTypeFilter("all");
  };

  const philHealthSetupHref = selectedBranchId
    ? buildBranchPhilHealthSetupHref(tenantSlug, selectedBranchId)
    : resolveDashboardNavHref(tenantSlug, "/dashboard/branches");
  const envInfo = resolvePcapiEnvironmentLabel(activeBranch?.philHealthBaseUrl);
  const pendingPollingCount = summary?.pendingPollingCount ?? pendingSubmissions.length;

  return (
    <div className="w-full flex-1 flex flex-col gap-6 sm:gap-8 p-4 sm:p-6 md:p-8 max-w-7xl mx-auto animate-in fade-in-50 duration-300">
      {/* ── HEADER & BRANCH SELECTOR ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
              <IconFileCertificate className="h-5 w-5" />
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              PhilHealth YAKAP Submissions Overview
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            De-identified submission tracking, status updates, and PhilHealth patient list sync.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <SelectField
            ariaLabel="Select accredited branch"
            placeholder="Select a branch..."
            value={selectedBranchId}
            onValueChange={setSelectedBranchId}
            disabled={loadingBranches}
            className="w-fit min-w-52 font-medium"
            options={branches.map((b) => ({
              value: b.id,
              label: `${b.name} ${b.philHealthAccreditationNumber ? `(${b.philHealthAccreditationNumber})` : "(Unaccredited)"}`,
            }))}
          />

          <Button
            variant="outline"
            size="sm"
            onClick={() => selectedBranchId && void loadBranchData(selectedBranchId)}
            disabled={loadingSummary || loadingSubmissions || !selectedBranchId}
            className="h-9 rounded-xl text-xs font-semibold gap-1.5"
            title="Refresh Telemetry"
          >
            <IconRefresh className={`h-3.5 w-3.5 ${loadingSummary || loadingSubmissions ? "animate-spin text-primary" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* ── BRANCH ACCREDITATION & MASTERLIST ACTION STRIP ── */}
      {activeBranch && (
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 rounded-2xl bg-muted/40 border border-border text-xs">
          <div className="flex items-center gap-2.5 flex-wrap min-w-0">
            <IconBuilding className="h-4 w-4 text-primary shrink-0" />
            <span className="font-semibold text-foreground">{activeBranch.name}</span>
            {activeBranch.philHealthAccreditationNumber ? (
              <span className="font-mono text-muted-foreground">
                Accreditation: <strong className="text-foreground">{activeBranch.philHealthAccreditationNumber}</strong>
                {activeBranch.philHealthPmccNumber && ` • Facility Code: ${activeBranch.philHealthPmccNumber}`}
              </span>
            ) : (
              <span className="text-destructive font-medium">No PhilHealth Accreditation Configured</span>
            )}
            <Badge
              variant="outline"
              title={envInfo.url}
              className={`text-[10px] font-semibold px-2 py-0.5 ${
                envInfo.label === "Staging"
                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
                  : "bg-background text-muted-foreground border-border"
              }`}
            >
              {envInfo.label}
            </Badge>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {activeBranch.hasSecretKey ? (
              <Badge variant="outline" className="text-primary bg-primary/10 border-primary/20 text-[11px] font-medium gap-1 h-8 px-2.5 rounded-xl">
                <IconShieldCheck className="h-3.5 w-3.5 text-primary" />
                PhilHealth Connected
              </Badge>
            ) : (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-8 px-3 rounded-xl text-xs font-semibold gap-1.5 border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20"
              >
                <Link href={philHealthSetupHref}>
                  <span>Configure PhilHealth Credentials</span>
                  <IconArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            )}

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleSyncMasterlist()}
                disabled={isSyncingMasterlist || !selectedBranchId}
                className="h-8 px-3 rounded-xl text-xs font-semibold gap-1.5 bg-background hover:bg-muted"
              >
                {isSyncingMasterlist ? (
                  <>
                    <IconLoader className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span>Syncing...</span>
                  </>
                ) : (
                  <>
                    <IconRefresh className="h-3.5 w-3.5 text-primary" />
                    <span>Sync Masterlist</span>
                  </>
                )}
              </Button>
              {summary?.lastMasterlistSyncAtUtc && (
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  Last synced{" "}
                  {new Date(summary.lastMasterlistSyncAtUtc).toLocaleDateString()}{" "}
                  {new Date(summary.lastMasterlistSyncAtUtc).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 4 UNIFORM, CLICKABLE KPI TELEMETRY CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
        {/* Card 1: Empaneled & Masterlist */}
        <button
          type="button"
          onClick={clearFilters}
          aria-pressed={!hasActiveFilters}
          className={`text-left w-full h-full rounded-2xl border bg-card p-5 shadow-sm transition-all flex flex-col justify-between gap-3 cursor-pointer hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            !hasActiveFilters ? "border-primary/40 ring-1 ring-primary/15" : "border-border"
          }`}
        >
          <div className="space-y-1.5 w-full">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Empaneled / Masterlist
              </span>
              <span className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
                <IconShieldCheck className="h-4 w-4" />
              </span>
            </div>
            <div className="text-2xl font-black text-foreground">
              {loadingSummary ? "—" : (summary?.empaneledCount ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                Selected: <strong className="text-foreground">{summary?.selectedCount ?? 0}</strong>
              </span>
              <span>
                Total Active: <strong className="text-foreground">{summary?.masterlistTotalCount ?? 0}</strong>
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Service 05 masterlist roster. Click to clear filters.
            </p>
          </div>
        </button>

        {/* Card 2: Pending Polling */}
        <button
          type="button"
          onClick={() =>
            setStatusFilter((prev) => (prev === "pending_polling" ? "all" : "pending_polling"))
          }
          aria-pressed={statusFilter === "pending_polling"}
          className={`text-left w-full h-full rounded-2xl border bg-card p-5 shadow-sm transition-all flex flex-col justify-between gap-3 cursor-pointer hover:border-amber-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            statusFilter === "pending_polling"
              ? "border-amber-500/60 ring-2 ring-amber-500/20"
              : "border-border"
          }`}
        >
          <div className="space-y-1.5 w-full">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Pending Polling
              </span>
              <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                <IconClock className="h-4 w-4" />
              </span>
            </div>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
              {loadingSummary ? "—" : (summary?.pendingPollingCount ?? 0).toLocaleString()}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Submissions awaiting PhilHealth asynchronous batch validation (23B U-prefix batch upload codes).
          </p>
        </button>

        {/* Card 3: Accepted Uploads */}
        <button
          type="button"
          onClick={() => setStatusFilter((prev) => (prev === "accepted" ? "all" : "accepted"))}
          aria-pressed={statusFilter === "accepted"}
          className={`text-left w-full h-full rounded-2xl border bg-card p-5 shadow-sm transition-all flex flex-col justify-between gap-3 cursor-pointer hover:border-emerald-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            statusFilter === "accepted"
              ? "border-emerald-500/60 ring-2 ring-emerald-500/20"
              : "border-border"
          }`}
        >
          <div className="space-y-1.5 w-full">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Accepted Uploads
              </span>
              <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                <IconCloudCheck className="h-4 w-4" />
              </span>
            </div>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {loadingSummary ? "—" : (summary?.acceptedUploadsCount ?? 0).toLocaleString()}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Verified transmissions with statutory MCA confirmation numbers.
          </p>
        </button>

        {/* Card 4: Rejected / Failed */}
        <button
          type="button"
          onClick={() =>
            setStatusFilter((prev) => (prev === "rejected_failed" ? "all" : "rejected_failed"))
          }
          aria-pressed={statusFilter === "rejected_failed"}
          className={`text-left w-full h-full rounded-2xl border bg-card p-5 shadow-sm transition-all flex flex-col justify-between gap-3 cursor-pointer hover:border-rose-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            statusFilter === "rejected_failed"
              ? "border-rose-500/60 ring-2 ring-rose-500/20"
              : "border-border"
          }`}
        >
          <div className="space-y-1.5 w-full">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Rejected / Failed
              </span>
              <span className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 shrink-0">
                <IconAlertTriangle className="h-4 w-4" />
              </span>
            </div>
            <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
              {loadingSummary ? "—" : (summary?.rejectedOrFailedCount ?? 0).toLocaleString()}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Transmissions rejected by PhilHealth validation. Inspect non-PHI error diagnostics and retry.
          </p>
        </button>
      </div>

      {/* ── SUBMISSIONS LEDGER ── */}
      <Card className="rounded-2xl border-border bg-card shadow-sm">
        <CardHeader className="p-5 sm:p-6 pb-4 border-b border-border space-y-4">
          <div>
            <CardTitle className="text-base font-bold text-foreground">
              Submissions &amp; Claims Telemetry Ledger
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Filtered strictly by anonymized Patient Code and statutory 23B transaction identifiers.
            </CardDescription>
          </div>

          {/* Dedicated Single-Row Filter & Batch Action Toolbar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 flex-1">
              <div className="relative w-full sm:w-64">
                <IconSearch className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search PatientCode, Tx No..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs rounded-xl"
                />
              </div>

              <SelectField
                ariaLabel="Filter by submission status"
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as YakapStatusFilter)}
                size="sm"
                className="w-full sm:w-44 shrink-0"
                options={[
                  { value: "all", label: "All Statuses" },
                  { value: "pending_polling", label: "Pending & Submitted" },
                  { value: "pending", label: "Pending" },
                  { value: "submitted", label: "Submitted" },
                  { value: "accepted", label: "Accepted" },
                  { value: "rejected_failed", label: "Rejected & Failed" },
                  { value: "rejected", label: "Rejected" },
                  { value: "failed", label: "Failed" },
                ]}
              />

              <SelectField
                ariaLabel="Filter by submission type"
                value={typeFilter}
                onValueChange={setTypeFilter}
                size="sm"
                className="w-full sm:w-36 shrink-0"
                options={[
                  { value: "all", label: "All Types" },
                  { value: "fpe", label: "Annual Checkup" },
                  { value: "consultation", label: "Consultation" },
                  { value: "diagnostic", label: "Diagnostic" },
                  { value: "medicine", label: "Medicine" },
                  { value: "referral", label: "Referral" },
                ]}
              />

              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-8 px-2.5 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground gap-1 shrink-0"
                >
                  <IconX className="h-3.5 w-3.5" />
                  <span>Clear</span>
                </Button>
              )}
            </div>

            {pendingPollingCount > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handlePollAllPending()}
                disabled={isPollingAll || !selectedBranchId}
                className="h-8 px-3 rounded-xl text-xs font-semibold gap-1.5 shrink-0 border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20"
              >
                {isPollingAll ? (
                  <>
                    <IconLoader className="h-3.5 w-3.5 animate-spin" />
                    <span>Polling Pending...</span>
                  </>
                ) : (
                  <>
                    <IconRefresh className="h-3.5 w-3.5" />
                    <span>Poll All Pending ({pendingPollingCount})</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loadingSubmissions ? (
            <div className="p-8 text-center space-y-3">
              <IconLoader className="h-6 w-6 animate-spin text-primary mx-auto" />
              <p className="text-xs text-muted-foreground">Loading submissions ledger...</p>
            </div>
          ) : filteredSubmissions.length === 0 ? (
            hasActiveFilters ? (
              <div className="p-12 text-center space-y-3">
                <div className="p-3 rounded-2xl bg-muted/60 text-muted-foreground inline-block">
                  <IconFileCertificate className="h-8 w-8" />
                </div>
                <h3 className="text-sm font-bold text-foreground">No Submissions Found</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  No transmissions matched your active filters.
                </p>
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clearFilters}
                    className="h-8 rounded-xl text-xs font-semibold"
                  >
                    Clear Filters
                  </Button>
                </div>
              </div>
            ) : activeBranch && !activeBranch.hasSecretKey ? (
              <div className="p-10 text-center space-y-5">
                <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 inline-block">
                  <IconShieldCheck className="h-8 w-8" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-foreground">
                    Finish PhilHealth Setup to Start Tracking Submissions
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    Complete these three steps for <strong>{activeBranch.name}</strong> before checkup submissions can be verified:
                  </p>
                </div>

                <ol className="max-w-md mx-auto text-left text-xs space-y-2 rounded-2xl border border-border bg-muted/30 p-4">
                  <li className="flex items-center gap-2.5 text-foreground font-medium">
                    <span className="size-5 rounded-full bg-primary/15 text-primary font-bold text-[11px] flex items-center justify-center shrink-0">
                      1
                    </span>
                    <span>Add PhilHealth credentials in Branch Settings</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-muted-foreground">
                    <span className="size-5 rounded-full bg-muted text-muted-foreground font-bold text-[11px] flex items-center justify-center shrink-0">
                      2
                    </span>
                    <span>Sync Assigned Patient List</span>
                  </li>
                  <li className="flex items-center gap-2.5 text-muted-foreground">
                    <span className="size-5 rounded-full bg-muted text-muted-foreground font-bold text-[11px] flex items-center justify-center shrink-0">
                      3
                    </span>
                    <span>Submit checkups and visits from the Clinic App</span>
                  </li>
                </ol>

                <div>
                  <Button asChild size="sm" className="rounded-xl text-xs font-semibold gap-1.5">
                    <Link href={philHealthSetupHref}>
                      <span>Configure PhilHealth Credentials</span>
                      <IconArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center space-y-3">
                <div className="p-3 rounded-2xl bg-muted/60 text-muted-foreground inline-block">
                  <IconFileCertificate className="h-8 w-8" />
                </div>
                <h3 className="text-sm font-bold text-foreground">No Submissions Found</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  No submissions recorded for this branch yet. Checkup and visit records from clinic facilities will appear here.
                </p>
              </div>
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-muted/40 text-muted-foreground border-b border-border uppercase font-semibold text-[10px] tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3.5">Patient Code</th>
                    <th className="py-2.5 px-3.5">Type</th>
                    <th className="py-2.5 px-3.5">Local Ref No</th>
                    <th className="py-2.5 px-3.5">Upload Ref No</th>
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
                        <td className="py-3 px-3.5 font-mono font-bold text-foreground">
                          <span className="px-2 py-0.5 rounded-md bg-muted border border-border">
                            {sub.patientCode}
                          </span>
                        </td>

                        <td className="py-3 px-3.5">
                          <Badge variant="outline" className="font-semibold text-[10px] py-0">
                            {sub.submissionType}
                          </Badge>
                        </td>

                        <td className="py-3 px-3.5 font-mono text-muted-foreground text-[11px]">
                          {sub.localTransactionNo || "—"}
                        </td>

                        <td className="py-3 px-3.5 font-mono font-medium text-foreground text-[11px]">
                          {sub.uploadTransactionNo ? (
                            <span className="text-primary font-bold">{sub.uploadTransactionNo}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        <td className="py-3 px-3.5 font-mono text-[11px]">
                          {sub.yesReferenceNo ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">{sub.yesReferenceNo}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

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

                        <td className="py-3 px-3.5 text-muted-foreground text-[11px] whitespace-nowrap">
                          {sub.submittedAtUtc
                            ? new Date(sub.submittedAtUtc).toLocaleDateString() +
                              " " +
                              new Date(sub.submittedAtUtc).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                            : "—"}
                        </td>

                        <td className="py-3 px-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {isPending && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void handlePollStatus(sub.id)}
                                disabled={pollingId === sub.id || isPollingAll}
                                className="h-7 px-2 rounded-lg text-[11px] font-semibold gap-1"
                                title="Check latest PhilHealth status"
                              >
                                {pollingId === sub.id ? (
                                  <IconLoader className="h-3 w-3 animate-spin text-primary" />
                                ) : (
                                  <IconRefresh className="h-3 w-3 text-primary" />
                                )}
                                <span>Poll</span>
                              </Button>
                            )}

                            {isFailed && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void handleRetrySubmission(sub.id)}
                                disabled={retryingId === sub.id}
                                className="h-7 px-2 rounded-lg text-[11px] font-semibold gap-1 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                title="Retry submission"
                              >
                                {retryingId === sub.id ? (
                                  <IconLoader className="h-3 w-3 animate-spin" />
                                ) : (
                                  <IconRefresh className="h-3 w-3" />
                                )}
                                <span>Retry</span>
                              </Button>
                            )}

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
              PhilHealth validation issues for reference{" "}
              <code className="font-mono font-bold text-foreground">{inspectedSubmission?.localTransactionNo}</code>.
            </DialogDescription>
          </DialogHeader>

          {inspectedSubmission && (
            <div className="space-y-4 py-2 text-xs">
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

              {inspectedSubmission.payloadSha256Hash && (
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-foreground">Payload SHA-256 Hash</span>
                  <div className="p-2 rounded-lg bg-muted/60 font-mono text-[10px] break-all border border-border text-muted-foreground">
                    {inspectedSubmission.payloadSha256Hash}
                  </div>
                </div>
              )}

              {inspectedSubmission.lastErrorMessage && (
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-foreground">Error Summary</span>
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-800 dark:text-rose-300 text-xs">
                    {inspectedSubmission.lastErrorMessage}
                  </div>
                </div>
              )}

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
