"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconBuilding,
  IconChevronRight,
  IconExternalLink,
  IconHospital,
  IconLink,
  IconLoader,
  IconMail,
  IconMapPin,
  IconPhone,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconShieldCheck,
} from "@tabler/icons-react";
import { toast } from "sonner";
import FacilitySettingsHub, { type FacilityData } from "@/components/dashboard/FacilitySettingsHub";
import { CreateBranchDialog } from "@/components/dashboard/branches/CreateBranchDialog";
import {
  buildBranchFacilities,
  filterBranches,
  formatBranchShortAddress,
  getFacilitySlot,
  resolveConsoleUrl,
  sanitizeBranchContact,
  type BranchFilterMode,
} from "@/components/dashboard/branches/branchHelpers";
import { resolveDashboardNavHref } from "@/components/dashboard/nav-main";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorMessage } from "@/lib/apiError";
import { cn } from "@/lib/utils";
import { branchService } from "@/services/branch.service";
import { facilityService, type WorkspaceFacility } from "@/services/facility.service";

const FILTER_OPTIONS: Array<{ id: BranchFilterMode; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "accredited", label: "YAKAP Accredited" },
  { id: "unconfigured", label: "Needs Setup" },
];

export default function BranchManagementClient() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantSlug = (params?.tenant as string) || "demo-tenant";

  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<BranchFilterMode>("all");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const createBranchParam = searchParams.get("createBranch") === "true";
  const effectiveCreateOpen = isCreateOpen || createBranchParam;
  const [settingsFacility, setSettingsFacility] = useState<FacilityData | null>(null);

  // Unassigned facility quick-link state
  const [linkTargets, setLinkTargets] = useState<Record<string, string>>({});
  const [linkingFacilityId, setLinkingFacilityId] = useState<string | null>(null);

  const {
    data,
    error: swrError,
    isLoading,
    isValidating,
    mutate,
  } = useSWR(
    `branches-roster/${tenantSlug}`,
    async () => {
      const [branchList, facList] = await Promise.all([
        branchService.getBranches(tenantSlug),
        facilityService.getFacilities(tenantSlug),
      ]);
      return {
        branches: branchList || [],
        facilities: facList || [],
      };
    },
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const branches = useMemo(() => data?.branches ?? [], [data?.branches]);
  const facilities = useMemo(() => data?.facilities ?? [], [data?.facilities]);
  const loading = isLoading;
  const loadError = swrError
    ? apiErrorMessage(swrError, "Could not load branches. Please try again.")
    : null;

  const loadData = useCallback(async () => {
    await mutate();
  }, [mutate]);

  useEffect(() => {
    const handleFacilityCreated = () => {
      void mutate();
    };
    window.addEventListener("clinicez:facility-created", handleFacilityCreated);
    return () => {
      window.removeEventListener("clinicez:facility-created", handleFacilityCreated);
    };
  }, [mutate]);

  // Forward legacy ?create=<type>&branchId=<id> deep links into the target branch detail page
  useEffect(() => {
    const createType = searchParams.get("create");
    const targetBranchId = searchParams.get("branchId");
    if (
      createType &&
      targetBranchId &&
      ["clinic", "laboratory", "pharmacy", "organization"].includes(createType)
    ) {
      const detailUrl = resolveDashboardNavHref(
        tenantSlug,
        `/dashboard/branches/${targetBranchId}?create=${encodeURIComponent(createType)}&branchId=${encodeURIComponent(targetBranchId)}`,
      );
      router.replace(detailUrl);
    }
  }, [searchParams, tenantSlug, router]);

  const handleCreateOpenChange = (nextOpen: boolean) => {
    setIsCreateOpen(nextOpen);
    if (!nextOpen && createBranchParam && typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      sp.delete("createBranch");
      router.replace(
        `${window.location.pathname}${sp.toString() ? `?${sp.toString()}` : ""}`,
        { scroll: false },
      );
    }
  };

  const filteredBranches = useMemo(
    () => filterBranches(branches, search, filterMode),
    [branches, search, filterMode],
  );

  const totalFacilitiesAttached = useMemo(
    () => branches.reduce((sum, b) => sum + (b.facilities?.length || 0), 0),
    [branches],
  );
  const totalAccreditedBranches = useMemo(
    () => branches.filter((b) => b.isPhilHealthAccredited).length,
    [branches],
  );

  const unassignedFacilities = useMemo(
    () =>
      facilities.filter(
        (f) => !f.branchId || !branches.some((b) => b.id === f.branchId),
      ),
    [facilities, branches],
  );

  const handleLinkUnassigned = async (facility: WorkspaceFacility, branchId: string) => {
    if (!branchId) return;
    setLinkingFacilityId(facility.id);
    try {
      await branchService.assignFacilities(branchId, [facility.id]);
      const targetBranch = branches.find((b) => b.id === branchId);
      toast.success(
        `${facility.name} attached to "${targetBranch?.name ?? "branch"}".`,
      );
      await loadData();
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, "Failed to attach facility to branch."));
    } finally {
      setLinkingFacilityId(null);
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col gap-6 sm:gap-8 p-4 sm:p-6 md:p-8 max-w-7xl mx-auto animate-in fade-in-50 duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Branches &amp; Locations
            </h1>
            <Badge
              variant="outline"
              className="font-mono text-xs border-primary/30 text-primary bg-primary/5"
            >
              Branch-First Architecture
            </Badge>
          </div>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">
            Select a physical branch to manage its attached facilities, PhilHealth YAKAP accreditation, and location settings.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData()}
            disabled={loading || isValidating}
            className="rounded-xl h-9 text-xs font-semibold gap-1.5"
          >
            <IconRefresh className={`h-4 w-4 ${loading || isValidating ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="rounded-xl font-bold text-xs px-5 h-9 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm flex items-center justify-center gap-1.5"
          >
            <IconPlus className="h-4 w-4" />
            New Branch
          </Button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="p-4 rounded-2xl border bg-card/60 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Total Branches
            </span>
            <div className="text-2xl font-black text-foreground mt-0.5">{branches.length}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <IconBuilding className="h-5 w-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl border bg-card/60 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Facilities Attached
            </span>
            <div className="text-2xl font-black text-foreground mt-0.5">
              {totalFacilitiesAttached}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <IconHospital className="h-5 w-5" />
          </div>
        </div>

        <div className="p-4 rounded-2xl border bg-card/60 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              YAKAP Accredited
            </span>
            <div className="text-2xl font-black text-foreground mt-0.5">
              {totalAccreditedBranches}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-success/10 text-success flex items-center justify-center">
            <IconShieldCheck className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search branches by name, code, PMCC, city, or facility..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl bg-card text-xs sm:text-sm"
            aria-label="Search branches"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filter branches">
          {FILTER_OPTIONS.map((opt) => {
            const active = filterMode === opt.id;
            return (
              <Button
                key={opt.id}
                type="button"
                variant={active ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterMode(opt.id)}
                className={cn(
                  "h-8 rounded-xl text-xs font-semibold",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Branch Roster (4-State Completion) */}
      {loading ? (
        <Card className="rounded-2xl border bg-card p-4 space-y-3" aria-label="Loading branches">
          {[1, 2, 3].map((row) => (
            <div
              key={row}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-border/60"
            >
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-72" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-8 w-24 rounded-xl" />
              </div>
            </div>
          ))}
        </Card>
      ) : loadError && branches.length === 0 ? (
        <Card className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center flex flex-col items-center gap-3">
          <div className="p-3 rounded-full bg-destructive/10 text-destructive">
            <IconAlertCircle className="h-6 w-6" />
          </div>
          <div className="space-y-1 max-w-md">
            <h3 className="text-sm font-bold text-foreground">Unable to load branches</h3>
            <p className="text-xs text-muted-foreground">{loadError}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadData()}
            className="rounded-xl text-xs font-semibold gap-1.5"
          >
            <IconRefresh className="h-3.5 w-3.5" />
            Retry
          </Button>
        </Card>
      ) : branches.length === 0 ? (
        <Card className="border-dashed border-2 p-12 text-center flex flex-col items-center justify-center gap-4 bg-muted/20 rounded-2xl">
          <div className="p-4 rounded-full bg-primary/10 text-primary">
            <IconMapPin className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-base font-bold">No physical branches found</h3>
            <p className="text-xs text-muted-foreground max-w-md mt-1">
              Create your first physical branch to anchor Clinics, Laboratories, and Pharmacies with independent Philippine regulatory credentials.
            </p>
          </div>
          <Button
            onClick={() => setIsCreateOpen(true)}
            size="sm"
            className="rounded-xl font-bold text-xs gap-1.5"
          >
            <IconPlus className="h-4 w-4" />
            Create First Branch
          </Button>
        </Card>
      ) : filteredBranches.length === 0 ? (
        <Card className="border-dashed border-2 p-10 text-center flex flex-col items-center justify-center gap-3 bg-muted/20 rounded-2xl">
          <IconSearch className="h-6 w-6 text-muted-foreground" />
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-foreground">No matching branches</h3>
            <p className="text-xs text-muted-foreground">
              Adjust your search term or clear active filters to view all branches.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSearch("");
              setFilterMode("all");
            }}
            className="rounded-xl text-xs font-semibold"
          >
            Clear Filters
          </Button>
        </Card>
      ) : (
        <>
          {/* Desktop Table Roster */}
          <Card className="hidden md:block rounded-2xl border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b bg-muted/30 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="py-3 px-4">Branch</th>
                    <th className="py-3 px-4">Location &amp; Contact</th>
                    <th className="py-3 px-4">Facilities</th>
                    <th className="py-3 px-4">PhilHealth YAKAP</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70 text-xs">
                  {filteredBranches.map((branch) => {
                    const branchFacilities = buildBranchFacilities(branch, facilities);
                    const shortAddress = formatBranchShortAddress(branch);
                    const { phone, email } = sanitizeBranchContact(branch);
                    const branchHref = resolveDashboardNavHref(
                      tenantSlug,
                      `/dashboard/branches/${branch.id}`,
                    );

                    return (
                      <tr
                        key={branch.id}
                        className="group hover:bg-muted/35 transition-colors cursor-pointer"
                        onClick={(e) => {
                          const target = e.target as HTMLElement;
                          if (target.closest("a,button")) return;
                          router.push(branchHref);
                        }}
                      >
                        {/* Column 1: Branch */}
                        <td className="py-3.5 px-4 align-top">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link
                              href={branchHref}
                              className="text-sm font-bold text-foreground group-hover:text-primary transition-colors"
                            >
                              {branch.name}
                            </Link>
                            {branch.code && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] font-mono px-1.5 py-0 shrink-0"
                              >
                                {branch.code}
                              </Badge>
                            )}
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px] font-semibold px-1.5 py-0 shrink-0",
                                branch.isActive
                                  ? "bg-success/10 text-success border-success/25"
                                  : "bg-muted text-muted-foreground border-border",
                              )}
                            >
                              {branch.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                        </td>

                        {/* Column 2: Location & Contact */}
                        <td className="py-3.5 px-4 align-top max-w-xs">
                          <div className="flex items-start gap-1.5 text-foreground/90">
                            <IconMapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                            <span className="line-clamp-1" title={shortAddress}>
                              {shortAddress}
                            </span>
                          </div>
                          {(phone || email) && (
                            <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                              {phone && (
                                <span className="inline-flex items-center gap-1 truncate">
                                  <IconPhone className="h-3 w-3 shrink-0" />
                                  {phone}
                                </span>
                              )}
                              {email && (
                                <span className="inline-flex items-center gap-1 truncate">
                                  <IconMail className="h-3 w-3 shrink-0" />
                                  {email}
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Column 3: Facilities */}
                        <td className="py-3.5 px-4 align-top">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[11px] font-semibold text-muted-foreground mr-1">
                              {branchFacilities.length}/4
                            </span>
                            {branchFacilities.length === 0 ? (
                              <span className="text-[11px] text-muted-foreground italic">
                                No facilities yet
                              </span>
                            ) : (
                              branchFacilities.map((fac) => {
                                const slot = getFacilitySlot(fac.facilityType);
                                const SlotIcon = slot.icon;
                                return (
                                  <Badge
                                    key={fac.id}
                                    variant="outline"
                                    title={`${fac.name} (${slot.label})`}
                                    className="text-[10px] font-semibold gap-1 px-2 py-0.5 bg-card"
                                  >
                                    <SlotIcon className={cn("h-3 w-3", slot.color)} />
                                    <span className="truncate max-w-28">{fac.name}</span>
                                  </Badge>
                                );
                              })
                            )}
                          </div>
                        </td>

                        {/* Column 4: PhilHealth YAKAP */}
                        <td className="py-3.5 px-4 align-top">
                          {branch.isPhilHealthAccredited ? (
                            <div className="space-y-0.5">
                              <Badge
                                variant="outline"
                                className="text-[10px] font-bold bg-success/10 text-success border-success/25"
                              >
                                Accredited
                              </Badge>
                              <div className="text-[11px] font-mono text-muted-foreground">
                                {branch.philHealthPmccNumber
                                  ? `PMCC ${branch.philHealthPmccNumber}`
                                  : branch.philHealthAccreditationNumber || "Configured"}
                              </div>
                            </div>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-semibold bg-muted text-muted-foreground border-border"
                            >
                              Unconfigured
                            </Badge>
                          )}
                        </td>

                        {/* Column 5: Action */}
                        <td className="py-3.5 px-4 align-top text-right">
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-xl text-xs font-semibold gap-1"
                          >
                            <Link href={branchHref}>
                              <span>Manage</span>
                              <IconChevronRight className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile Card Roster */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filteredBranches.map((branch) => {
              const branchFacilities = buildBranchFacilities(branch, facilities);
              const shortAddress = formatBranchShortAddress(branch);
              const branchHref = resolveDashboardNavHref(
                tenantSlug,
                `/dashboard/branches/${branch.id}`,
              );

              return (
                <Link
                  key={branch.id}
                  href={branchHref}
                  className="block rounded-2xl border bg-card p-4 shadow-xs hover:border-primary/40 transition-colors space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-bold text-foreground truncate">
                          {branch.name}
                        </span>
                        {branch.code && (
                          <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                            {branch.code}
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-semibold px-1.5 py-0",
                            branch.isActive
                              ? "bg-success/10 text-success border-success/25"
                              : "bg-muted text-muted-foreground border-border",
                          )}
                        >
                          {branch.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <IconMapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{shortAddress}</span>
                      </p>
                    </div>
                    <IconChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60 text-[11px]">
                    <span className="font-medium text-muted-foreground">
                      <span className="font-mono font-bold text-foreground">
                        {branchFacilities.length}/4
                      </span>{" "}
                      facilities
                    </span>

                    {branch.isPhilHealthAccredited ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] font-bold bg-success/10 text-success border-success/25"
                      >
                        YAKAP {branch.philHealthPmccNumber ? `• ${branch.philHealthPmccNumber}` : ""}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[10px] font-semibold bg-muted text-muted-foreground border-border"
                      >
                        PhilHealth Unconfigured
                      </Badge>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {/* Unassigned / Legacy Facilities Section */}
      {unassignedFacilities.length > 0 && (
        <Card className="rounded-2xl border-warning/30 bg-warning/5 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <IconAlertTriangle className="h-5 w-5 text-warning" />
                <h3 className="text-sm font-bold text-foreground">Unassigned Facilities</h3>
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono border-warning/30 text-warning"
                >
                  {unassignedFacilities.length} Not Linked
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                These facilities are not yet linked to a physical branch location. Assign them to a branch or open facility settings directly.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {unassignedFacilities.map((uf) => {
              const slot = getFacilitySlot(uf.facilityType);
              const Icon = slot.icon;
              const resolvedUrl = resolveConsoleUrl(uf, tenantSlug);
              const eligibleBranches = branches.filter(
                (b) =>
                  !(b.facilities ?? []).some(
                    (f) => f.facilityType.toLowerCase() === uf.facilityType.toLowerCase(),
                  ),
              );
              const selectedBranchId =
                linkTargets[uf.id] ?? (eligibleBranches[0]?.id || "");
              const isLinking = linkingFacilityId === uf.id;

              return (
                <div
                  key={uf.id}
                  className="p-3.5 rounded-xl border bg-card shadow-2xs flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={cn("p-1.5 rounded-lg shrink-0", slot.bg, slot.color)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs truncate" title={uf.name}>
                          {uf.name}
                        </div>
                        <span className="text-[10px] text-muted-foreground">{slot.label}</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSettingsFacility(uf as FacilityData)}
                      className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground shrink-0"
                      title={`Settings for ${uf.name}`}
                    >
                      <IconSettings className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {eligibleBranches.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <SelectField
                        ariaLabel={`Assign ${uf.name} to branch`}
                        value={selectedBranchId}
                        onValueChange={(v) =>
                          setLinkTargets((prev) => ({ ...prev, [uf.id]: v }))
                        }
                        size="sm"
                        className="flex-1 min-w-0 rounded-lg text-[11px]"
                        options={eligibleBranches.map((eb) => ({
                          value: eb.id,
                          label: eb.name,
                        }))}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!selectedBranchId || isLinking}
                        onClick={() => void handleLinkUnassigned(uf, selectedBranchId)}
                        className="h-8 rounded-lg text-[11px] font-semibold gap-1 shrink-0"
                      >
                        {isLinking ? (
                          <IconLoader className="h-3 w-3 animate-spin" />
                        ) : (
                          <IconLink className="h-3 w-3" />
                        )}
                        <span>Assign</span>
                      </Button>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-border/40 text-[10px]">
                    <span className="font-mono text-muted-foreground truncate">{uf.slug}</span>
                    {resolvedUrl && (
                      <a
                        href={resolvedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-bold text-primary hover:underline"
                      >
                        <span>Launch</span>
                        <IconExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Facility Settings Hub Modal */}
      {settingsFacility && (
        <FacilitySettingsHub
          facility={settingsFacility}
          open={Boolean(settingsFacility)}
          onOpenChange={(open) => !open && setSettingsFacility(null)}
          onSaved={() => void loadData()}
        />
      )}

      {/* Create New Physical Branch Modal */}
      <CreateBranchDialog
        tenantSlug={tenantSlug}
        open={effectiveCreateOpen}
        onOpenChange={handleCreateOpenChange}
        onCreated={(created) => {
          handleCreateOpenChange(false);
          if (created?.id) {
            router.push(
              resolveDashboardNavHref(tenantSlug, `/dashboard/branches/${created.id}`),
            );
          } else {
            void loadData();
          }
        }}
      />
    </div>
  );
}
