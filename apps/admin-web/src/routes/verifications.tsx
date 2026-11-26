import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoute, useNavigate } from "@tanstack/react-router";
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconArrowLeft,
  IconChevronRight,
  IconClipboardCheck,
  IconRefresh,
  IconSearch,
  IconShieldLock,
} from "@tabler/icons-react";
import { Route as authRoute } from "./_auth";
import {
  formatVerificationTimestamp,
  getLicenseExpiryDisplay,
  isDistinctTimestamp,
  parseVerificationQueueSearch,
  resolveHumanActorDisplay,
  serializeVerificationQueueSearch,
  type QueueKindFilter,
  type QueueStatusTab,
  type VerificationQueueSearch,
} from "@/lib/verificationStatus";
import {
  canViewVerifications,
  verificationService,
  type ReviewerProfile,
  type VerificationQueueItemDto,
  type VerificationQueueResponse,
} from "@/services/verification.service";
import {
  VerificationKindBadge,
  VerificationStatusBadge,
} from "@/components/verifications/VerificationStatusBadge";
import { Button, Chip, Tabs, Text } from "@/components/ui";

export type { QueueStatusTab, QueueKindFilter, VerificationQueueSearch };
export { parseVerificationQueueSearch, serializeVerificationQueueSearch };

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

export function buildVerificationDetailHref(
  requestId: string,
  search?: VerificationQueueSearch,
): string {
  const base = `/verifications/${encodeURIComponent(requestId)}`;
  if (!search) return base;
  const params = new URLSearchParams();
  if (search.status && search.status !== "pending") params.set("status", search.status);
  if (search.kind && search.kind !== "all") params.set("kind", search.kind);
  if (search.q?.trim()) params.set("q", search.q.trim());
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

function readWindowQueueSearch(): VerificationQueueSearch {
  if (typeof window === "undefined") return {};
  return parseVerificationQueueSearch(
    Object.fromEntries(new URLSearchParams(window.location.search).entries()),
  );
}

export function VerificationQueueView({
  initialProfile,
  initialQueue,
  initialSearch,
}: {
  initialProfile?: ReviewerProfile | null;
  initialQueue?: VerificationQueueResponse | null;
  initialSearch?: VerificationQueueSearch;
} = {}) {
  let navigate: ReturnType<typeof useNavigate> | null = null;
  try {
    navigate = useNavigate();
  } catch {
    // Outside RouterProvider in unit tests
  }

  const resolvedInitialSearch = useMemo(
    () => initialSearch ?? readWindowQueueSearch(),
    [initialSearch],
  );

  const [profile, setProfile] = useState<ReviewerProfile | null | undefined>(initialProfile);
  const [profileLoading, setProfileLoading] = useState(initialProfile === undefined);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [statusTab, setStatusTab] = useState<QueueStatusTab>(
    () => resolvedInitialSearch.status ?? "pending",
  );
  const [kindFilter, setKindFilter] = useState<QueueKindFilter>(
    () => resolvedInitialSearch.kind ?? "all",
  );
  const [searchInput, setSearchInput] = useState(() => resolvedInitialSearch.q ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(() => resolvedInitialSearch.q ?? "");

  const [queueData, setQueueData] = useState<VerificationQueueResponse | null>(initialQueue ?? null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);

  const lastSyncedSearchRef = useRef<string>(
    JSON.stringify(
      serializeVerificationQueueSearch({
        statusTab: resolvedInitialSearch.status ?? "pending",
        kindFilter: resolvedInitialSearch.kind ?? "all",
        q: resolvedInitialSearch.q ?? "",
      }),
    ),
  );

  // Sync external URL search param updates (e.g. sidebar reset or browser Back/Forward)
  useEffect(() => {
    if (!initialSearch) return;
    const externalNormalized = serializeVerificationQueueSearch({
      statusTab: initialSearch.status ?? "pending",
      kindFilter: initialSearch.kind ?? "all",
      q: initialSearch.q ?? "",
    });
    const externalKey = JSON.stringify(externalNormalized);
    if (externalKey !== lastSyncedSearchRef.current) {
      lastSyncedSearchRef.current = externalKey;
      setStatusTab(externalNormalized.status ?? "pending");
      setKindFilter(externalNormalized.kind ?? "all");
      setSearchInput(externalNormalized.q ?? "");
      setDebouncedSearch(externalNormalized.q ?? "");
    }
  }, [initialSearch]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Persist active status, kind, and search query into URL search params
  useEffect(() => {
    if (!navigate) return;
    const nextSearch = serializeVerificationQueueSearch({
      statusTab,
      kindFilter,
      q: debouncedSearch,
    });
    const nextKey = JSON.stringify(nextSearch);
    if (nextKey !== lastSyncedSearchRef.current) {
      lastSyncedSearchRef.current = nextKey;
      void navigate({
        to: "/verifications",
        search: nextSearch,
        replace: true,
      });
    }
  }, [navigate, statusTab, kindFilter, debouncedSearch]);

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
      void fetchQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess, kindFilter, statusTab, debouncedSearch]);

  const displayedItems = useMemo(
    () => filterQueueItemsForTab(queueData?.items ?? [], statusTab),
    [queueData?.items, statusTab],
  );

  const persistedQueueSearch = useMemo(
    () =>
      serializeVerificationQueueSearch({
        statusTab,
        kindFilter,
        q: searchInput.trim(),
      }),
    [statusTab, kindFilter, searchInput],
  );

  const handleOpenDetail = (requestId: string) => {
    if (navigate) {
      void navigate({
        to: "/verifications/$requestId",
        params: { requestId },
        search: persistedQueueSearch,
      });
    } else if (typeof window !== "undefined") {
      window.location.assign(buildVerificationDetailHref(requestId, persistedQueueSearch));
    }
  };

  if (profileLoading) {
    return (
      <div className="space-y-6 animate-pulse" aria-label="Loading verification queue">
        <div className="h-16 w-full rounded-2xl bg-surface-muted" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="h-24 rounded-2xl bg-surface-muted" />
          <div className="h-24 rounded-2xl bg-surface-muted" />
          <div className="h-24 rounded-2xl bg-surface-muted" />
        </div>
        <div className="h-80 w-full rounded-2xl bg-surface-muted" />
      </div>
    );
  }

  if (!hasAccess || !profile) {
    return (
      <div className="py-16 flex items-center justify-center">
        <div className="max-w-md w-full rounded-2xl border border-border bg-surface p-8 text-center space-y-4 shadow-sm">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center">
            <IconShieldLock className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-bold text-text">Directory Verification Access Required</h1>
            <p className="text-xs text-text-muted leading-relaxed">
              {profileError ||
                "Your administrator role does not include the view:verifications permission required to inspect clinic and practitioner directory requests."}
            </p>
          </div>
          <div className="pt-1 flex justify-center">
            <a
              href="/"
              onClick={(e) => {
                if (navigate) {
                  e.preventDefault();
                  void navigate({ to: "/" });
                }
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-text bg-surface-muted border border-border hover:bg-surface transition-colors"
            >
              <IconArrowLeft className="h-3.5 w-3.5" />
              <span>Return to Overview Dashboard</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-text">
            Directory Verifications
          </h1>
          <p className="text-xs text-text-muted">
            Verify clinic DOH License to Operate (LTO) documents and clinician PRC licenses before publishing to the Patient App directory.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="secondary"
            size="md"
            disabled={queueLoading}
            onClick={() => void fetchQueue()}
            leadingIcon={<IconRefresh className={`h-4 w-4 ${queueLoading ? "animate-spin" : ""}`} />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-surface p-5 flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
              Pending Action
            </div>
            <div className="text-2xl font-bold text-text mt-1">
              {queueData?.pendingCount ?? 0}
            </div>
          </div>
          <Chip tone="warning" size="md">
            Open Queue
          </Chip>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
              Pending Facilities
            </div>
            <div className="text-2xl font-bold text-text mt-1">
              {queueData?.pendingFacilityCount ?? 0}
            </div>
          </div>
          <Chip tone="neutral" size="md">
            DOH LTO Review
          </Chip>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
              Pending Practitioners
            </div>
            <div className="text-2xl font-bold text-text mt-1">
              {queueData?.pendingPractitionerCount ?? 0}
            </div>
          </div>
          <Chip tone="neutral" size="md">
            PRC &amp; Affiliation
          </Chip>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="p-4 rounded-2xl bg-surface border border-border space-y-3">
        <Tabs
          ariaLabel="Filter by verification status"
          items={STATUS_TABS}
          value={statusTab}
          onValueChange={setStatusTab}
        />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <Tabs
            ariaLabel="Filter by request kind"
            items={KIND_FILTERS}
            value={kindFilter}
            onValueChange={setKindFilter}
            className="self-start"
          />

          <div className="relative flex-1 max-w-md">
            <IconSearch className="h-4 w-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search clinic, clinician, PRC #, DOH LTO #, or workspace..."
              aria-label="Search verification requests"
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl bg-surface-muted border border-border text-text placeholder:text-text-muted focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      {/* Full-Width Verification Queue Table */}
      <div className="w-full">
        {queueLoading && !queueData ? (
          <div className="space-y-2.5 animate-pulse" aria-label="Loading verification requests">
            {[1, 2, 3, 4].map((row) => (
              <div key={row} className="h-16 w-full rounded-xl bg-surface-muted" />
            ))}
          </div>
        ) : queueError ? (
          <div className="p-5 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <IconAlertCircle className="h-4 w-4 shrink-0" />
              <div>
                <div className="font-bold">Unable to load verification queue</div>
                <p className="mt-0.5">{queueError}</p>
              </div>
            </div>
            <Button
              variant="dangerSubtle"
              size="xs"
              onClick={() => void fetchQueue()}
              className="shrink-0"
            >
              Try Again
            </Button>
          </div>
        ) : displayedItems.length === 0 ? (
          <div className="p-12 rounded-2xl bg-surface border border-dashed border-border text-center space-y-3">
            <div className="inline-flex p-3 rounded-2xl bg-primary-subtle text-primary">
              <IconClipboardCheck className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-text">No verification requests found</h2>
              <p className="text-xs text-text-muted max-w-sm mx-auto">
                No facility or practitioner submissions match the selected status, kind, or search query.
              </p>
            </div>
            {statusTab !== "all" || kindFilter !== "all" || searchInput.trim() ? (
              <Button
                variant="unstyled"
                size="custom"
                onClick={() => {
                  setStatusTab("all");
                  setKindFilter("all");
                  setSearchInput("");
                  setDebouncedSearch("");
                }}
                className="px-4 py-1.5 text-xs font-semibold text-primary bg-primary-subtle rounded-xl hover:bg-primary/20"
              >
                Show All Requests
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-surface-muted border-b border-border text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">Submission #</th>
                    <th className="px-4 py-3 whitespace-nowrap">Kind</th>
                    <th className="px-4 py-3 whitespace-nowrap">Facility / Clinician</th>
                    <th className="px-4 py-3 whitespace-nowrap">PRC / LTO #</th>
                    <th className="px-4 py-3 whitespace-nowrap">Specialty / Schedule</th>
                    <th className="px-4 py-3 whitespace-nowrap">Submitted</th>
                    <th className="px-4 py-3 whitespace-nowrap">Status</th>
                    <th className="px-4 py-3 whitespace-nowrap text-right">Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {displayedItems.map((item) => {
                    const primaryName =
                      item.kind.toLowerCase() === "facility"
                        ? item.facilityName
                        : item.practitionerName || item.facilityName;
                    const secondaryName =
                      item.kind.toLowerCase() === "facility"
                        ? `${item.tenantName} (${item.tenantSlug})`
                        : `${item.facilityName} • ${item.tenantSlug}`;
                    const isFacility = item.kind.toLowerCase() === "facility";
                    const licenseNumber = isFacility
                      ? item.dohLtoNumber || "No LTO #"
                      : item.normalizedPrcLicenseNo || item.prcLicenseNo || "—";
                    const licenseExpiry = getLicenseExpiryDisplay(
                      isFacility ? item.dohLtoExpiryDate : item.prcExpiryDate,
                    );
                    const submittedBy = item.submittedByDisplayName
                      ? resolveHumanActorDisplay(
                          item.submittedByDisplayName,
                          null,
                          null,
                          "Clinic Manager",
                        )
                      : null;
                    const showUpdatedAt = isDistinctTimestamp(
                      item.updatedAtUtc,
                      item.submittedAtUtc,
                    );
                    const hasReviewer = Boolean(
                      item.reviewedAtUtc ||
                        item.reviewedByDisplayName ||
                        item.reviewedByEmail ||
                        item.reviewedByAdminUserId,
                    );
                    const reviewedBy = hasReviewer
                      ? resolveHumanActorDisplay(
                          item.reviewedByDisplayName,
                          item.reviewedByEmail,
                          item.reviewedByAdminUserId,
                          "Platform Reviewer",
                        )
                      : null;
                    const detailHref = buildVerificationDetailHref(item.id, persistedQueueSearch);

                    return (
                      <tr
                        key={item.id}
                        onClick={() => handleOpenDetail(item.id)}
                        className="cursor-pointer transition-colors hover:bg-surface-muted/60"
                      >
                        <td className="px-4 py-3.5 whitespace-nowrap font-mono font-bold text-text">
                          #{item.submissionNumber}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <VerificationKindBadge kind={item.kind} />
                        </td>
                        <td className="px-4 py-3.5 min-w-[200px]">
                          <div className="flex items-center gap-1.5 font-semibold text-text">
                            <Text className="max-w-[240px]">{primaryName}</Text>
                            {item.hasNameMismatch ? (
                              <span
                                title="PRC name mismatch detected"
                                className="inline-flex items-center text-amber-600 dark:text-amber-400 shrink-0"
                              >
                                <IconAlertTriangle className="h-3.5 w-3.5" />
                              </span>
                            ) : null}
                          </div>
                          <Text as="div" className="text-[11px] text-text-muted max-w-[260px]">
                            {secondaryName}
                          </Text>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap font-mono text-text">
                          <div>{licenseNumber}</div>
                          {licenseExpiry ? (
                            <div className="flex items-center gap-1.5 text-[10px] font-sans text-text-muted mt-0.5">
                              <span>{`Exp ${licenseExpiry.dateText}`}</span>
                              {licenseExpiry.badgeLabel && licenseExpiry.badgeClassName ? (
                                <Chip
                                  tone="unstyled"
                                  size="custom"
                                  className={`px-1.5 py-0.5 text-[9px] border ${licenseExpiry.badgeClassName}`}
                                >
                                  {licenseExpiry.badgeLabel}
                                </Chip>
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-text-secondary">
                          {summarizeQueueItemSpecialtySchedule(item)}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-text-muted">
                          <div>{formatVerificationTimestamp(item.submittedAtUtc)}</div>
                          {submittedBy ? (
                            <Text
                              as="div"
                              className="text-[10px] text-text-muted max-w-[180px]"
                              title={submittedBy.tooltip}
                            >
                              {`by ${submittedBy.primary}`}
                            </Text>
                          ) : null}
                          {showUpdatedAt ? (
                            <div className="text-[10px] font-medium text-primary">
                              {`Updated ${formatVerificationTimestamp(item.updatedAtUtc)}`}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <VerificationStatusBadge status={item.status} />
                          {reviewedBy ? (
                            <Text
                              as="div"
                              className="text-[10px] text-text-muted mt-1 max-w-[180px]"
                              title={reviewedBy.tooltip}
                            >
                              {`Reviewed by ${reviewedBy.primary}`}
                            </Text>
                          ) : null}
                        </td>
                        <td
                          className="px-4 py-3.5 whitespace-nowrap text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <a
                            href={detailHref}
                            onClick={(e) => {
                              if (navigate) {
                                e.preventDefault();
                                handleOpenDetail(item.id);
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-primary hover:bg-primary-subtle transition-colors"
                          >
                            <span>Inspect</span>
                            <IconChevronRight className="h-3.5 w-3.5" />
                          </a>
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
    </div>
  );
}

function VerificationsPage() {
  const search = Route.useSearch();
  return <VerificationQueueView initialSearch={search} />;
}

export const Route = createRoute({
  getParentRoute: () => authRoute,
  path: "verifications",
  validateSearch: parseVerificationQueueSearch,
  component: VerificationsPage,
});
