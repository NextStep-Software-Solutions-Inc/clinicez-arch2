"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconClipboardCheck,
  IconRefresh,
  IconSearch,
  IconShieldCheck,
  IconShieldLock,
} from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatVerificationTimestamp } from "@/lib/verificationStatus";
import {
  canViewVerifications,
  verificationService,
  type ReviewerProfile,
  type VerificationQueueItemDto,
  type VerificationQueueResponse,
} from "@/services/verification.service";
import { VerificationReviewDrawer } from "./VerificationReviewDrawer";
import {
  VerificationKindBadge,
  VerificationStatusBadge,
} from "./VerificationStatusBadge";

export type QueueStatusTab =
  | "pending"
  | "in_review"
  | "awaiting_confirmation"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "all";

export type QueueKindFilter = "all" | "facility" | "practitioner";

const STATUS_TABS: ReadonlyArray<{ value: QueueStatusTab; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "in_review", label: "In Review" },
  { value: "awaiting_confirmation", label: "Awaiting Confirmation" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "all", label: "All" },
];

const KIND_FILTERS: ReadonlyArray<{ value: QueueKindFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "facility", label: "Facilities" },
  { value: "practitioner", label: "Practitioners" },
];

export function statusTabToApiQuery(tab: QueueStatusTab): string | undefined {
  switch (tab) {
    case "in_review":
      return "PendingReview";
    case "awaiting_confirmation":
      return "AwaitingOtp";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "withdrawn":
      return "Withdrawn";
    case "pending":
    case "all":
    default:
      return undefined;
  }
}

export function filterQueueItemsForTab(
  items: ReadonlyArray<VerificationQueueItemDto>,
  tab: QueueStatusTab,
): VerificationQueueItemDto[] {
  switch (tab) {
    case "pending":
      return items.filter(
        (i) =>
          i.status === "PendingReview" ||
          i.status === "Pending" ||
          i.status === "AwaitingOtp" ||
          i.status === "AwaitingConfirmation",
      );
    case "in_review":
      return items.filter((i) => i.status === "PendingReview" || i.status === "InReview");
    case "awaiting_confirmation":
      return items.filter(
        (i) => i.status === "AwaitingOtp" || i.status === "AwaitingConfirmation",
      );
    case "approved":
      return items.filter((i) => i.status === "Approved");
    case "rejected":
      return items.filter((i) => i.status === "Rejected");
    case "withdrawn":
      return items.filter((i) => i.status === "Withdrawn");
    case "all":
    default:
      return [...items];
  }
}

export function summarizeQueueItemSpecialtySchedule(item: VerificationQueueItemDto): string {
  if (item.kind.toLowerCase() === "facility") {
    const count = item.bundledPractitionerCount ?? 0;
    return count > 0
      ? `${item.requestKind} • ${count} clinician${count === 1 ? "" : "s"}`
      : `${item.requestKind} • Clinic profile`;
  }
  const role = item.professionKind || "Clinician";
  return item.requestKind ? `${role} • ${item.requestKind}` : role;
}

export function VerificationQueueClient({
  initialProfile,
  initialQueue,
}: {
  initialProfile?: ReviewerProfile | null;
  initialQueue?: VerificationQueueResponse | null;
} = {}) {
  const [profile, setProfile] = useState<ReviewerProfile | null | undefined>(initialProfile);
  const [profileLoading, setProfileLoading] = useState(initialProfile === undefined);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [statusTab, setStatusTab] = useState<QueueStatusTab>("pending");
  const [kindFilter, setKindFilter] = useState<QueueKindFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [queueData, setQueueData] = useState<VerificationQueueResponse | null>(initialQueue ?? null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (initialProfile !== undefined) return;
    let cancelled = false;
    setProfileLoading(true);
    setProfileError(null);
    verificationService
      .getReviewerProfile()
      .then((res) => {
        if (!cancelled) setProfile(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setProfile(null);
          setProfileError(err instanceof Error ? err.message : "Failed to verify reviewer access.");
        }
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialProfile]);

  const hasAccess = canViewVerifications(profile);

  const fetchQueue = useCallback(async () => {
    if (!hasAccess) return;
    setQueueLoading(true);
    setQueueError(null);
    try {
      const res = await verificationService.getVerificationQueue({
        kind: kindFilter,
        status: statusTabToApiQuery(statusTab),
        q: debouncedSearch || undefined,
      });
      setQueueData(res);
    } catch (err: unknown) {
      setQueueError(err instanceof Error ? err.message : "Failed to load verification queue.");
    } finally {
      setQueueLoading(false);
    }
  }, [hasAccess, kindFilter, statusTab, debouncedSearch]);

  useEffect(() => {
    if (hasAccess && initialQueue === undefined) {
      void fetchQueue();
    }
  }, [hasAccess, fetchQueue, initialQueue]);

  useEffect(() => {
    if (hasAccess && initialQueue !== undefined) {
      // Re-fetch when filters change after initial hydrated render
      void fetchQueue();
    }
  }, [hasAccess, kindFilter, statusTab, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayedItems = useMemo(
    () => filterQueueItemsForTab(queueData?.items ?? [], statusTab),
    [queueData?.items, statusTab],
  );

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground p-6 max-w-7xl mx-auto space-y-6" aria-label="Loading verification queue">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    );
  }

  if (!hasAccess || !profile) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-border bg-card p-6 text-center space-y-4 shadow-sm">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center">
            <IconShieldLock className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-bold text-foreground">Directory Verification Access Required</h1>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {profileError ||
                "Your account does not have the view:verifications permission required to inspect clinic and practitioner directory requests."}
            </p>
          </div>
          <div className="flex justify-center">
            <Button asChild variant="outline" className="rounded-xl text-xs font-semibold gap-1.5">
              <Link href="/sync-auth">
                <IconArrowLeft className="h-3.5 w-3.5" />
                <span>Return to Workspace Portal</span>
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-[1440px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Top Portal Header */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border pb-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <IconClipboardCheck className="h-5 w-5" />
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
                Directory Verification Queue
              </h1>
              <Badge variant="outline" className="text-[11px] font-semibold bg-primary/10 text-primary border-primary/25">
                {profile.roleName}
              </Badge>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Verify clinic DOH License to Operate (LTO) documents and clinician PRC licenses before publishing to the Patient App directory.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border bg-card text-xs">
              <IconShieldCheck className="h-4 w-4 text-primary" />
              <span className="font-semibold text-foreground">{profile.fullName}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={queueLoading}
              onClick={() => void fetchQueue()}
              className="h-9 rounded-xl text-xs font-semibold gap-1.5"
            >
              <IconRefresh className={cn("h-3.5 w-3.5", queueLoading && "animate-spin")} />
              <span>Refresh</span>
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-9 rounded-xl text-xs font-semibold gap-1.5">
              <Link href="/sync-auth">
                <IconArrowLeft className="h-3.5 w-3.5" />
                <span>Portal</span>
              </Link>
            </Button>
          </div>
        </header>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-border bg-card p-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Pending Action
              </div>
              <div className="text-2xl font-black text-foreground mt-0.5">
                {queueData?.pendingCount ?? 0}
              </div>
            </div>
            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/25 text-xs font-semibold">
              Open Queue
            </Badge>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Pending Facilities
              </div>
              <div className="text-2xl font-black text-foreground mt-0.5">
                {queueData?.pendingFacilityCount ?? 0}
              </div>
            </div>
            <Badge variant="outline" className="text-xs font-semibold">
              DOH LTO Review
            </Badge>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Pending Practitioners
              </div>
              <div className="text-2xl font-black text-foreground mt-0.5">
                {queueData?.pendingPractitionerCount ?? 0}
              </div>
            </div>
            <Badge variant="outline" className="text-xs font-semibold">
              PRC &amp; Affiliation
            </Badge>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="space-y-3">
          <Tabs
            value={statusTab}
            onValueChange={(value) => setStatusTab(value as QueueStatusTab)}
          >
            <TabsList className="bg-muted p-1 rounded-xl h-auto flex-wrap justify-start gap-1">
              {STATUS_TABS.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1 rounded-xl bg-muted p-1 self-start" role="group" aria-label="Filter by request kind">
              {KIND_FILTERS.map((kind) => (
                <Button
                  key={kind.value}
                  type="button"
                  size="sm"
                  variant={kindFilter === kind.value ? "default" : "ghost"}
                  onClick={() => setKindFilter(kind.value)}
                  className="h-8 rounded-lg px-3 text-xs font-semibold"
                >
                  {kind.label}
                </Button>
              ))}
            </div>

            <div className="relative flex-1 max-w-md">
              <IconSearch className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search clinic, clinician, PRC #, DOH LTO #, or workspace..."
                aria-label="Search verification requests"
                className="pl-9 h-9 rounded-xl text-xs"
              />
            </div>
          </div>
        </div>

        {/* Split-Pane Queue + Review Drawer */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className={cn(selectedRequestId ? "lg:col-span-7" : "lg:col-span-12")}>
            {queueLoading && !queueData ? (
              <div className="space-y-2.5" aria-label="Loading verification requests">
                {[1, 2, 3, 4].map((row) => (
                  <Skeleton key={row} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : queueError ? (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center space-y-3">
                <div className="text-sm font-bold text-destructive">Unable to load verification queue</div>
                <p className="text-xs text-destructive/90">{queueError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void fetchQueue()}
                  className="rounded-xl text-xs font-semibold"
                >
                  Try Again
                </Button>
              </div>
            ) : displayedItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-10 text-center space-y-3">
                <div className="mx-auto h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <IconClipboardCheck className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-sm font-bold text-foreground">No verification requests found</h2>
                  <p className="text-xs text-muted-foreground">
                    No facility or practitioner submissions match the selected status, kind, or search query.
                  </p>
                </div>
                {(statusTab !== "all" || kindFilter !== "all" || searchInput.trim()) ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setStatusTab("all");
                      setKindFilter("all");
                      setSearchInput("");
                    }}
                    className="rounded-xl text-xs font-semibold"
                  >
                    Show All Requests
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-3 whitespace-nowrap">Submission #</th>
                        <th className="px-4 py-3 whitespace-nowrap">Kind</th>
                        <th className="px-4 py-3 whitespace-nowrap">Facility / Clinician</th>
                        <th className="px-4 py-3 whitespace-nowrap">PRC / LTO #</th>
                        <th className="px-4 py-3 whitespace-nowrap">Specialty / Schedule</th>
                        <th className="px-4 py-3 whitespace-nowrap">Submitted</th>
                        <th className="px-4 py-3 whitespace-nowrap">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {displayedItems.map((item) => {
                        const isSelected = selectedRequestId === item.id;
                        const primaryName =
                          item.kind.toLowerCase() === "facility"
                            ? item.facilityName
                            : item.practitionerName || item.facilityName;
                        const secondaryName =
                          item.kind.toLowerCase() === "facility"
                            ? `${item.tenantName} (${item.tenantSlug})`
                            : `${item.facilityName} • ${item.tenantSlug}`;
                        const licenseNumber =
                          item.kind.toLowerCase() === "facility"
                            ? item.dohLtoNumber || "No LTO #"
                            : item.normalizedPrcLicenseNo || item.prcLicenseNo || "—";

                        return (
                          <tr
                            key={item.id}
                            onClick={() => setSelectedRequestId(item.id)}
                            className={cn(
                              "cursor-pointer transition-colors hover:bg-muted/40",
                              isSelected && "bg-primary/5",
                            )}
                          >
                            <td className="px-4 py-3 whitespace-nowrap font-mono font-bold text-foreground">
                              #{item.submissionNumber}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <VerificationKindBadge kind={item.kind} />
                            </td>
                            <td className="px-4 py-3 min-w-[190px]">
                              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                                <span className="truncate max-w-[200px]">{primaryName}</span>
                                {item.hasNameMismatch ? (
                                  <span
                                    title="PRC name mismatch detected"
                                    className="inline-flex items-center text-warning shrink-0"
                                  >
                                    <IconAlertTriangle className="h-3.5 w-3.5" />
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-[11px] text-muted-foreground truncate max-w-[220px]">
                                {secondaryName}
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap font-mono text-foreground">
                              <div>{licenseNumber}</div>
                              {item.prcExpiryDate ? (
                                <div className="text-[10px] font-sans text-muted-foreground">
                                  Exp {item.prcExpiryDate}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                              {summarizeQueueItemSpecialtySchedule(item)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                              {formatVerificationTimestamp(item.submittedAtUtc)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <VerificationStatusBadge status={item.status} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Desktop Split-Pane Detail Drawer */}
          {selectedRequestId ? (
            <div className="hidden lg:block lg:col-span-5 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)]">
              <VerificationReviewDrawer
                requestId={selectedRequestId}
                profile={profile}
                onClose={() => setSelectedRequestId(null)}
                onActionCompleted={() => void fetchQueue()}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* Mobile / Tablet Slide-Over Review Sheet */}
      <div className="lg:hidden">
        <Sheet
          open={Boolean(selectedRequestId)}
          onOpenChange={(open) => {
            if (!open) setSelectedRequestId(null);
          }}
        >
          <SheetContent side="right" className="w-full sm:max-w-xl p-0 overflow-hidden">
            <SheetHeader className="sr-only">
              <SheetTitle>Verification Review</SheetTitle>
              <SheetDescription>Inspect credentials and record decision</SheetDescription>
            </SheetHeader>
            {selectedRequestId ? (
              <VerificationReviewDrawer
                requestId={selectedRequestId}
                profile={profile}
                onClose={() => setSelectedRequestId(null)}
                onActionCompleted={() => void fetchQueue()}
              />
            ) : null}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
