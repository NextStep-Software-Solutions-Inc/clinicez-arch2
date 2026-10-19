"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";

export function forceReleaseBodyScrollLock(): void {
  if (typeof document === "undefined") return;
  document.body.style.pointerEvents = "";
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
  document.body.style.marginRight = "";
  document.body.removeAttribute("data-radix-scroll-lock");
  if (document.documentElement) {
    document.documentElement.removeAttribute("data-radix-scroll-lock");
  }
}
import {
  IconSearch,
  IconSearchOff,
  IconX,
  IconDashboard,
  IconBuilding,
  IconFileCertificate,
  IconUsers,
  IconUser,
  IconUserPlus,
  IconArrowsExchange,
  IconReportMoney,
  IconSettings,
  IconGauge,
  IconCrown,
  IconCreditCard,
  IconMapPin,
  IconHospital,
  IconTestPipe,
  IconPill,
  IconCornerDownLeft,
  IconLoader,
} from "@tabler/icons-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { branchService, type BranchDto } from "@/services/branch.service";
import { staffService, type StaffMemberDto } from "@/services/staff.service";
import { cn } from "@/lib/utils";
import { universalSearchRegistry } from "@shared/safe";
import { registerPortalSearchContributors } from "@/services/portalSearchContributors";

export type SearchCategory = "actions" | "navigation" | "branches" | "facilities" | "team";

export interface SearchItem {
  id: string;
  title: string;
  subtitle?: string;
  category: SearchCategory | string;
  categoryLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  url: string;
  keywords?: string[];
  badge?: string;
  badgeClass?: string;
  isSuggested?: boolean;
  onSelect?: () => void;
  _corpus?: string;
}

export interface WorkspaceSearchDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  tenantSlug?: string;
  initialBranches?: BranchDto[];
  initialStaff?: StaffMemberDto[];
}

export const CATEGORY_ORDER: SearchCategory[] = [
  "actions",
  "navigation",
  "branches",
  "facilities",
  "team",
];

export const CATEGORY_LABELS: Record<SearchCategory, string> = {
  actions: "Quick Actions",
  navigation: "Pages & Navigation",
  branches: "Branches & Locations",
  facilities: "Facilities",
  team: "Workspace Team",
};

export function normalizeSearchString(str: string): string {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function matchesSearchTerm(corpus: string, term: string): boolean {
  const normTerm = normalizeSearchString(term);
  if (!normTerm) return true;
  if (corpus.includes(normTerm)) return true;
  // Clean surrounding punctuation (parentheses, commas, colons, brackets, quotes)
  const cleanTerm = normTerm.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (cleanTerm && corpus.includes(cleanTerm)) return true;
  return false;
}

export function buildItemCorpus(item: Partial<SearchItem>): string {
  return normalizeSearchString(
    [
      item.title || "",
      item.subtitle || "",
      item.categoryLabel || "",
      item.badge || "",
      ...(item.keywords || []),
    ].join(" ")
  );
}

export function getNavigationItems(tenant: string): SearchItem[] {
  const items: SearchItem[] = [
    {
      id: "nav-overview",
      title: "Overview",
      subtitle: "Dashboard summary, telemetry & workspace health",
      category: "navigation",
      categoryLabel: "Pages & Navigation",
      icon: IconDashboard,
      url: `/${tenant}/dashboard/overview`,
      keywords: ["overview", "dashboard", "home", "stats", "telemetry"],
      badge: "Page",
      badgeClass: "bg-muted text-muted-foreground",
      isSuggested: true,
    },
    {
      id: "nav-branches",
      title: "Branches",
      subtitle: "Physical branch foundations, clinics, labs & pharmacies",
      category: "navigation",
      categoryLabel: "Pages & Navigation",
      icon: IconBuilding,
      url: `/${tenant}/dashboard/branches`,
      keywords: [
        "branches",
        "branch",
        "locations",
        "facilities",
        "clinic",
        "laboratory",
        "lab",
        "pharmacy",
        "facility",
      ],
      badge: "Page",
      badgeClass: "bg-muted text-muted-foreground",
      isSuggested: true,
    },
    {
      id: "nav-yakap",
      title: "PhilHealth YAKAP",
      subtitle: "Statutory accreditation, PMCC credentials & claims",
      category: "navigation",
      categoryLabel: "Pages & Navigation",
      icon: IconFileCertificate,
      url: `/${tenant}/dashboard/yakap`,
      keywords: [
        "philhealth",
        "yakap",
        "pmcc",
        "accreditation",
        "insurance",
        "statutory",
        "claims",
      ],
      badge: "Page",
      badgeClass: "bg-muted text-muted-foreground",
      isSuggested: true,
    },
    {
      id: "nav-team",
      title: "Workspace Team",
      subtitle: "Staff members, clinical roles & permissions",
      category: "navigation",
      categoryLabel: "Pages & Navigation",
      icon: IconUsers,
      url: `/${tenant}/dashboard/team`,
      keywords: [
        "team",
        "workspace team",
        "staff",
        "members",
        "users",
        "roles",
        "doctors",
        "permissions",
        "admin",
      ],
      badge: "Page",
      badgeClass: "bg-muted text-muted-foreground",
      isSuggested: true,
    },
    {
      id: "nav-network",
      title: "Network",
      subtitle: "Interop hub, external referrals & health facilities",
      category: "navigation",
      categoryLabel: "Pages & Navigation",
      icon: IconArrowsExchange,
      url: `/${tenant}/dashboard/network`,
      keywords: ["network", "interop", "referrals", "external", "partners", "hub", "mailboxes"],
      badge: "Page",
      badgeClass: "bg-muted text-muted-foreground",
      isSuggested: false,
    },
    {
      id: "nav-finance",
      title: "Finance",
      subtitle: "Revenue analytics, billing transactions & receipts",
      category: "navigation",
      categoryLabel: "Pages & Navigation",
      icon: IconReportMoney,
      url: `/${tenant}/dashboard/finance`,
      keywords: ["finance", "revenue", "money", "billing", "payments", "receipts"],
      badge: "Page",
      badgeClass: "bg-muted text-muted-foreground",
      isSuggested: true,
    },
    {
      id: "nav-settings",
      title: "Settings",
      subtitle: "Workspace preferences, security & session policies",
      category: "navigation",
      categoryLabel: "Pages & Navigation",
      icon: IconSettings,
      url: `/${tenant}/dashboard/settings`,
      keywords: ["settings", "preferences", "security", "session", "mfa", "config"],
      badge: "Page",
      badgeClass: "bg-muted text-muted-foreground",
      isSuggested: true,
    },
    {
      id: "nav-plan",
      title: "Plan & Usage",
      subtitle: "Subscription tier, quotas & feature entitlements",
      category: "navigation",
      categoryLabel: "Pages & Navigation",
      icon: IconGauge,
      url: `/${tenant}/dashboard/plan`,
      keywords: ["plan", "usage", "quotas", "tier", "subscription", "entitlements", "and"],
      badge: "Page",
      badgeClass: "bg-muted text-muted-foreground",
      isSuggested: false,
    },
    {
      id: "nav-ownership",
      title: "Ownership",
      subtitle: "Workspace legal transfer & primary ownership",
      category: "navigation",
      categoryLabel: "Pages & Navigation",
      icon: IconCrown,
      url: `/${tenant}/dashboard/ownership`,
      keywords: ["ownership", "owner", "transfer", "legal", "delegation"],
      badge: "Page",
      badgeClass: "bg-muted text-muted-foreground",
      isSuggested: false,
    },
    {
      id: "nav-billing",
      title: "Billing",
      subtitle: "Payment methods, tax invoices & checkout receipts",
      category: "navigation",
      categoryLabel: "Pages & Navigation",
      icon: IconCreditCard,
      url: `/${tenant}/dashboard/billing`,
      keywords: ["billing", "invoices", "payment methods", "checkout", "receipts", "finance", "subscription", "payments"],
      badge: "Page",
      badgeClass: "bg-muted text-muted-foreground",
      isSuggested: false,
    },
  ];

  for (const item of items) {
    item._corpus = buildItemCorpus(item);
  }

  return items;
}

export function getQuickActionItems(tenant: string): SearchItem[] {
  const items: SearchItem[] = [
    {
      id: "action-create-branch",
      title: "New Branch",
      subtitle: "Establish a physical branch location with Philippine address",
      category: "actions",
      categoryLabel: "Quick Actions",
      icon: IconMapPin,
      url: `/${tenant}/dashboard/branches?createBranch=true`,
      keywords: [
        "create branch",
        "new branch",
        "add branch",
        "establish branch",
        "branch",
        "location",
      ],
      badge: "Action",
      badgeClass: "bg-primary/10 text-primary border-primary/20",
      isSuggested: true,
    },
    {
      id: "action-provision-clinic",
      title: "Provision Clinic",
      subtitle: "Outpatient consultations, clinical queue & EHR records",
      category: "actions",
      categoryLabel: "Quick Actions",
      icon: IconHospital,
      url: `/${tenant}/dashboard/branches?create=clinic`,
      keywords: [
        "provision clinic",
        "add clinic",
        "create clinic",
        "clinic",
        "outpatient",
        "ehr",
        "facility",
      ],
      badge: "Action",
      badgeClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      isSuggested: true,
    },
    {
      id: "action-provision-laboratory",
      title: "Provision Laboratory",
      subtitle: "Diagnostic orders, specimen accessioning & LIS results",
      category: "actions",
      categoryLabel: "Quick Actions",
      icon: IconTestPipe,
      url: `/${tenant}/dashboard/branches?create=laboratory`,
      keywords: [
        "provision laboratory",
        "provision lab",
        "add laboratory",
        "add lab",
        "lab",
        "laboratory",
        "diagnostics",
        "lis",
        "facility",
      ],
      badge: "Action",
      badgeClass: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
      isSuggested: true,
    },
    {
      id: "action-provision-pharmacy",
      title: "Provision Pharmacy",
      subtitle: "Drug inventory, e-prescription fulfillment & dispensing",
      category: "actions",
      categoryLabel: "Quick Actions",
      icon: IconPill,
      url: `/${tenant}/dashboard/branches?create=pharmacy`,
      keywords: [
        "provision pharmacy",
        "add pharmacy",
        "pharmacy",
        "dispensing",
        "prescriptions",
        "drugs",
        "pharma",
        "facility",
      ],
      badge: "Action",
      badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      isSuggested: true,
    },
    {
      id: "action-invite-staff",
      title: "Invite Staff Member",
      subtitle: "Add doctors, administrators, pharmacists, or finance billers",
      category: "actions",
      categoryLabel: "Quick Actions",
      icon: IconUserPlus,
      url: `/${tenant}/dashboard/team?invite=true`,
      keywords: [
        "invite staff",
        "invite team",
        "add staff",
        "invite member",
        "team",
        "staff",
        "user",
      ],
      badge: "Action",
      badgeClass: "bg-primary/10 text-primary border-primary/20",
      isSuggested: true,
    },
  ];

  for (const item of items) {
    item._corpus = buildItemCorpus(item);
  }

  return items;
}

export function getBranchItems(branches: BranchDto[], tenant: string): SearchItem[] {
  if (!Array.isArray(branches)) return [];
  const items: SearchItem[] = [];

  for (const b of branches) {
    if (!b) continue;
    const addressParts = [b.streetAddress, b.barangay, b.city, b.province].filter(Boolean);
    const addressStr =
      addressParts.length > 0 ? addressParts.join(", ") : b.city || "Branch Location";
    const philHealthTag = b.isPhilHealthAccredited
      ? `PhilHealth Accredited${b.philHealthPmccNumber ? ` (${b.philHealthPmccNumber})` : ""}`
      : undefined;

    const branchItem: SearchItem = {
      id: `branch-${b.id || Math.random().toString(36).substring(2, 7)}`,
      title: b.name || "Branch Location",
      subtitle: `${addressStr}${b.code ? ` • Code: ${b.code}` : ""}${
        philHealthTag ? ` • ${philHealthTag}` : ""
      }`,
      category: "branches",
      categoryLabel: "Branches & Locations",
      icon: IconBuilding,
      url: `/${tenant}/dashboard/branches`,
      keywords: [
        "branch",
        "branches",
        b.name || "",
        b.code || "",
        b.city || "",
        b.province || "",
        b.region || "",
        b.streetAddress || "",
        b.barangay || "",
        b.philHealthPmccNumber || "",
        b.philHealthAccreditationNumber || "",
        b.isPhilHealthAccredited ? "philhealth accredited yakap pmcc" : "",
      ],
      badge: b.isPhilHealthAccredited ? "YAKAP" : "Branch",
      badgeClass: b.isPhilHealthAccredited
        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
        : "bg-muted text-muted-foreground",
    };
    branchItem._corpus = buildItemCorpus(branchItem);
    items.push(branchItem);

    if (b.facilities && Array.isArray(b.facilities)) {
      for (const fac of b.facilities) {
        if (!fac) continue;
        let facIcon = IconHospital;
        let badgeClass = "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
        const rawType = fac.facilityType || "Facility";
        const fType = rawType.toLowerCase();

        if (fType.includes("lab")) {
          facIcon = IconTestPipe;
          badgeClass = "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
        } else if (fType.includes("pharm")) {
          facIcon = IconPill;
          badgeClass = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
        } else if (fType.includes("org")) {
          facIcon = IconBuilding;
          badgeClass = "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
        }

        const facItem: SearchItem = {
          id: `facility-${fac.id || Math.random().toString(36).substring(2, 7)}`,
          title: fac.name || rawType,
          subtitle: `${rawType} in ${b.name || "Branch"} • Status: ${fac.status || "Active"}`,
          category: "facilities",
          categoryLabel: "Facilities",
          icon: facIcon,
          url: `/${tenant}/dashboard/branches`,
          keywords: [
            "facility",
            rawType,
            fType,
            fType === "laboratory" ? "lab" : "",
            fType === "pharmacy" ? "pharma" : "",
            fac.name || "",
            b.name || "",
            b.city || "",
            fac.status || "",
          ],
          badge: rawType,
          badgeClass,
        };
        facItem._corpus = buildItemCorpus(facItem);
        items.push(facItem);
      }
    }
  }

  return items;
}

export function getStaffItems(staff: StaffMemberDto[], tenant: string): SearchItem[] {
  if (!Array.isArray(staff)) return [];
  return staff.filter(Boolean).map((m) => {
    const roleDesc = m.role || "Member";
    const facilityDesc = m.facilityName ? ` • ${m.facilityName}` : "";
    const emailDesc = m.email ? ` • ${m.email}` : "";
    const roleLower = (m.role || "").toLowerCase();

    let badgeClass = "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300";
    if (roleLower.includes("owner") || roleLower.includes("admin")) {
      badgeClass = "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    } else if (roleLower.includes("physician") || roleLower.includes("doctor")) {
      badgeClass = "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20";
    } else if (roleLower.includes("technologist")) {
      badgeClass = "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20";
    } else if (roleLower.includes("pharmacist")) {
      badgeClass = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    } else if (roleLower.includes("biller") || roleLower.includes("finance")) {
      badgeClass = "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
    }

    const item: SearchItem = {
      id: `staff-${m.id || Math.random().toString(36).substring(2, 7)}`,
      title: m.fullName || "Staff Member",
      subtitle: `${roleDesc}${facilityDesc}${emailDesc}`,
      category: "team",
      categoryLabel: "Workspace Team",
      icon: IconUser,
      url: `/${tenant}/dashboard/team`,
      keywords: [
        "staff",
        "team",
        "member",
        "user",
        m.fullName || "",
        m.email || "",
        m.role || "",
        m.status || "",
        m.facilityName || "",
        roleLower.includes("physician") ? "doctor md physician" : "",
        roleLower.includes("technologist") ? "medtech lab technologist" : "",
        roleLower.includes("pharmacist") ? "pharmacy pharma pharmacist" : "",
        roleLower.includes("admin") ? "administrator admin" : "",
        roleLower.includes("bill") ? "finance biller cashier" : "",
      ],
      badge: m.role || "Member",
      badgeClass,
    };
    item._corpus = buildItemCorpus(item);
    return item;
  });
}

export function filterSearchItems(
  items: SearchItem[],
  query: string,
  limit?: number
): SearchItem[] {
  if (!Array.isArray(items)) return [];
  const trimmed = (query || "").trim();
  if (!trimmed) {
    // Zero-state: return items marked as suggested
    const suggested = items.filter((item) => item?.isSuggested);
    return typeof limit === "number" && limit > 0 ? suggested.slice(0, limit) : suggested;
  }

  const terms = trimmed.split(/\s+/).filter(Boolean);

  const matched = items.filter((item) => {
    if (!item) return false;
    const corpus = item._corpus || buildItemCorpus(item);
    return terms.every((term) => matchesSearchTerm(corpus, term));
  });

  // Relevance ranking within results:
  // 1. Exact title match
  // 2. Title starts with query
  // 3. Title contains query
  const normalizedQuery = normalizeSearchString(trimmed);
  matched.sort((a, b) => {
    const aTitle = normalizeSearchString(a.title || "");
    const bTitle = normalizeSearchString(b.title || "");

    const aExact = aTitle === normalizedQuery;
    const bExact = bTitle === normalizedQuery;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;

    const aStarts = aTitle.startsWith(normalizedQuery);
    const bStarts = bTitle.startsWith(normalizedQuery);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;

    const aIncludes = aTitle.includes(normalizedQuery);
    const bIncludes = bTitle.includes(normalizedQuery);
    if (aIncludes && !bIncludes) return -1;
    if (!aIncludes && bIncludes) return 1;

    return 0;
  });

  return typeof limit === "number" && limit > 0 ? matched.slice(0, limit) : matched;
}

export function groupSearchResults(
  visibleResults: SearchItem[]
): Map<string, { items: SearchItem[]; startIndex: number; label: string }> {
  const map = new Map<string, { items: SearchItem[]; startIndex: number; label: string }>();
  const visibleCategories = Array.from(new Set(visibleResults.map((i) => i.category)));
  const sortedCategories = [
    ...CATEGORY_ORDER.filter((cat) => visibleCategories.includes(cat)),
    ...visibleCategories.filter((cat) => !CATEGORY_ORDER.includes(cat as SearchCategory)),
  ];
  let runningIndex = 0;
  for (const cat of sortedCategories) {
    const itemsInCat = visibleResults.filter((item) => item.category === cat);
    if (itemsInCat.length > 0) {
      const label =
        CATEGORY_LABELS[cat as SearchCategory] ||
        itemsInCat[0]?.categoryLabel ||
        cat.charAt(0).toUpperCase() + cat.slice(1);
      map.set(cat, { items: itemsInCat, startIndex: runningIndex, label });
      runningIndex += itemsInCat.length;
    }
  }
  return map;
}

export default function WorkspaceSearchDialog({
  open: openProp,
  onOpenChange,
  trigger,
  tenantSlug: tenantSlugProp,
  initialBranches,
  initialStaff,
}: WorkspaceSearchDialogProps) {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const rawTenant = tenantSlugProp || params?.tenant || "demo-tenant";
  const tenantSlug = Array.isArray(rawTenant) ? rawTenant[0] : (rawTenant as string);

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const isOpen = isControlled ? openProp : internalOpen;

  const isOpenRef = useRef(isOpen);
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const [branches, setBranches] = useState<BranchDto[]>(initialBranches || []);
  const [staff, setStaff] = useState<StaffMemberDto[]>(initialStaff || []);
  const [loadingData, setLoadingData] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const selectedItemNavigatedRef = useRef(false);
  const isMountedRef = useRef(true);
  const focusTimerRef = useRef<NodeJS.Timeout | number | null>(null);

  // Component unmount and body scroll lock safety
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      forceReleaseBodyScrollLock();
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (initialBranches && initialBranches.length > 0) {
      setBranches(initialBranches);
    }
  }, [initialBranches]);

  useEffect(() => {
    if (initialStaff && initialStaff.length > 0) {
      setStaff(initialStaff);
    }
  }, [initialStaff]);

  // Register portal search contributors in universalSearchRegistry on mount/update and unregister on unmount
  useEffect(() => {
    const unregister = registerPortalSearchContributors({
      tenantSlug,
      branches,
      staff,
    });
    return () => {
      unregister();
    };
  }, [tenantSlug, branches, staff]);

  const setOpen = useCallback(
    (nextOpen: boolean | ((prev: boolean) => boolean)) => {
      const current = isOpenRef.current;
      const resolved = typeof nextOpen === "function" ? nextOpen(current) : nextOpen;
      if (!isControlled) {
        setInternalOpen(resolved);
      }
      onOpenChange?.(resolved);
      if (!resolved) {
        forceReleaseBodyScrollLock();
      }
    },
    [isControlled, onOpenChange]
  );

  // Close search dialog on route pathname change (ISSUE-8)
  useEffect(() => {
    setOpen(false);
    forceReleaseBodyScrollLock();
  }, [pathname, setOpen]);

  // Close search dialog on browser Back/Forward (popstate) navigation (ISSUE-8)
  useEffect(() => {
    const handlePopState = () => {
      setOpen(false);
      forceReleaseBodyScrollLock();
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [setOpen]);

  // Global shortcut: Cmd+K / Ctrl+K in capture phase to reliably override input defaults & stop bubbling
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        if (e.repeat) return;
        e.preventDefault();
        e.stopPropagation();
        setOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown, true);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown, true);
  }, [setOpen]);

  // Load live branches and staff when dialog opens or tenantSlug changes
  const loadWorkspaceData = useCallback(async () => {
    if (!tenantSlug) return;
    setLoadingData(true);
    try {
      const [branchRes, staffRes] = await Promise.allSettled([
        branchService.getBranches(tenantSlug),
        staffService.getTenantStaff(tenantSlug),
      ]);

      if (!isMountedRef.current) return;

      if (branchRes.status === "fulfilled" && Array.isArray(branchRes.value)) {
        setBranches(branchRes.value);
      }
      if (staffRes.status === "fulfilled") {
        if (Array.isArray(staffRes.value)) {
          setStaff(staffRes.value);
        } else if (staffRes.value?.members && Array.isArray(staffRes.value.members)) {
          setStaff(staffRes.value.members);
        }
      }
    } catch (err) {
      console.warn("Failed to load workspace search index:", err);
    } finally {
      if (isMountedRef.current) {
        setLoadingData(false);
      }
    }
  }, [tenantSlug]);

  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement as HTMLElement | null;
      setQuery("");
      setActiveIndex(0);
      loadWorkspaceData();
      if (listboxRef.current) {
        listboxRef.current.scrollTop = 0;
      }
      // Auto-focus input with timer cleanup
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
      }
      focusTimerRef.current = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
    }
  }, [isOpen, loadWorkspaceData]);

  // Build complete item index with precomputed search corpus
  const allIndexItems = useMemo<SearchItem[]>(() => {
    const navItems = getNavigationItems(tenantSlug);
    const actionItems = getQuickActionItems(tenantSlug);
    const branchItems = getBranchItems(branches, tenantSlug);
    const staffItems = getStaffItems(staff, tenantSlug);

    return [...actionItems, ...navItems, ...branchItems, ...staffItems];
  }, [tenantSlug, branches, staff]);

  const [universalResults, setUniversalResults] = useState<SearchItem[] | null>(null);

  // Execute queries through universalSearchRegistry.search(query, { signal }) when available
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setUniversalResults(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    universalSearchRegistry
      .search(trimmed, { signal: controller.signal })
      .then((items) => {
        if (cancelled) return;
        const localIdSet = new Set(allIndexItems.map((i) => i.id));
        const externalItems = (items || []).filter((item) => !localIdSet.has(item.id));
        if (externalItems.length > 0) {
          const mappedExternal: SearchItem[] = externalItems.map((uItem) => ({
            id: uItem.id,
            title: uItem.title,
            subtitle: uItem.subtitle,
            category: uItem.category || "navigation",
            categoryLabel: (uItem as any).categoryLabel || uItem.category || "General",
            icon: IconSearch,
            url: uItem.targetRoute || `/${tenantSlug}/dashboard/overview`,
            badge: uItem.badgeText || uItem.badge?.text,
            badgeClass:
              uItem.badgeVariant === "emergency"
                ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
                : uItem.badgeVariant === "urgent"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : uItem.badgeVariant === "routine"
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/60 bg-muted text-muted-foreground",
            onSelect: uItem.onSelect,
          }));
          setUniversalResults(mappedExternal);
        } else {
          setUniversalResults(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn("[WorkspaceSearchDialog] Universal search query error:", err);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [query, allIndexItems, tenantSlug]);

  // Filtered results
  const filteredResults = useMemo<SearchItem[]>(() => {
    const localMatches = filterSearchItems(allIndexItems, query);
    if (universalResults && universalResults.length > 0) {
      return [...localMatches, ...universalResults];
    }
    return localMatches;
  }, [allIndexItems, query, universalResults]);

  // High-volume performance optimization: cap rendered DOM elements to 60 items
  const MAX_RENDERED_RESULTS = 60;
  const visibleResults = useMemo(() => {
    return filteredResults.slice(0, MAX_RENDERED_RESULTS);
  }, [filteredResults]);

  // Group visible results by category for clear visual hierarchy
  const groupedResults = useMemo(() => {
    return groupSearchResults(visibleResults);
  }, [visibleResults]);

  // Derive synchronized flattened results matching visual DOM render order
  const flattenedResults = useMemo(() => {
    return Array.from(groupedResults.values()).flatMap((g) => g.items);
  }, [groupedResults]);

  // Keep active index within bounds of flattenedResults
  useEffect(() => {
    if (activeIndex >= flattenedResults.length) {
      setActiveIndex(Math.max(0, flattenedResults.length - 1));
    }
  }, [flattenedResults.length, activeIndex]);

  const activeOptionId = flattenedResults[activeIndex]
    ? `workspace-search-opt-${(flattenedResults[activeIndex].id || "").replace(/[^\w-]/g, "_")}`
    : undefined;

  // Scroll active item into view reliably using its unique activeOptionId
  useEffect(() => {
    if (!activeOptionId) return;
    const el = document.getElementById(activeOptionId);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [activeOptionId]);

  const handleSelectItem = useCallback(
    (item: SearchItem) => {
      const isSameRoute = pathname ? item.url === pathname : false;
      // If navigating to the exact same route, allow focus to restore to the trigger button;
      // otherwise, let the destination page manage focus.
      selectedItemNavigatedRef.current = !isSameRoute;
      inputRef.current?.blur();
      setOpen(false);
      forceReleaseBodyScrollLock();
      item.onSelect?.();
      router.push(item.url);
    },
    [router, setOpen, pathname]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (flattenedResults.length === 0) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % flattenedResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + flattenedResults.length) % flattenedResults.length);
    } else if (e.key === "PageDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(flattenedResults.length - 1, prev + 5));
    } else if (e.key === "PageUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(0, prev - 5));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = flattenedResults[activeIndex];
      if (selected) {
        handleSelectItem(selected);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  const isZeroState = !query.trim();

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
        onCloseAutoFocus={(e) => {
          if (selectedItemNavigatedRef.current) {
            e.preventDefault();
            selectedItemNavigatedRef.current = false;
            return;
          }
          e.preventDefault();
          if (
            previousActiveElementRef.current &&
            typeof previousActiveElementRef.current.focus === "function" &&
            document.body.contains(previousActiveElementRef.current)
          ) {
            previousActiveElementRef.current.focus();
          } else {
            const triggerEl = document.getElementById("workspace-search-trigger");
            if (triggerEl && typeof triggerEl.focus === "function") {
              triggerEl.focus();
            }
          }
        }}
        className="sm:max-w-2xl max-w-[calc(100%-1.5rem)] w-full p-0 gap-0 overflow-hidden rounded-2xl border shadow-2xl bg-card text-card-foreground top-4 sm:top-[16%] translate-y-0 translate-x-[-50%] duration-150"
      >
        <DialogTitle className="sr-only">Workspace Search Dialog</DialogTitle>
        <DialogDescription className="sr-only">
          Search across workspace pages, physical branches, facilities, and staff members.
        </DialogDescription>

        {/* Search Input Bar */}
        <DialogHeader className="p-0 border-b border-border/50">
          <div className="flex items-center px-4 py-3 gap-3">
            <IconSearch className="size-5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={isOpen}
              aria-haspopup="listbox"
              aria-autocomplete="list"
              aria-controls="workspace-search-results"
              aria-activedescendant={activeOptionId}
              aria-label="Search workspace"
              placeholder="Search workspace (⌘K) — pages, branches, staff, actions..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-base outline-none text-foreground placeholder:text-muted-foreground border-none focus:ring-0"
            />
            {loadingData && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0"
              >
                <IconLoader className="size-4 animate-spin text-primary" />
                <span className="sr-only">Loading workspace directory...</span>
              </div>
            )}
            {query.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setActiveIndex(0);
                  inputRef.current?.focus();
                }}
                className="p-1.5 sm:p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted text-xs transition-colors cursor-pointer touch-manipulation"
                aria-label="Clear search"
              >
                <IconX className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="sm:hidden px-2 py-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors cursor-pointer touch-manipulation"
                aria-label="Cancel search"
              >
                Cancel
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-mono font-medium px-2 py-0.5 rounded-md border border-border/80 bg-muted/50 text-muted-foreground">
              ESC
            </kbd>
          </div>
        </DialogHeader>

        {/* Results Body */}
        <div
          ref={listboxRef}
          id="workspace-search-results"
          role="listbox"
          aria-label="Search results"
          className="max-h-[min(50vh,380px)] sm:max-h-[380px] overflow-y-auto overscroll-contain touch-pan-y p-2 space-y-4"
          onTouchStart={() => {
            // Dismiss software keyboard when user starts scrolling search results on touch devices
            if (inputRef.current && document.activeElement === inputRef.current) {
              inputRef.current.blur();
            }
          }}
        >
          {visibleResults.length === 0 ? (
            loadingData ? (
              /* Loading / Searching State */
              <div
                role="status"
                aria-live="polite"
                className="py-12 px-4 text-center flex flex-col items-center justify-center animate-in fade-in-50 duration-200"
              >
                <div className="p-3.5 rounded-2xl bg-muted/60 text-primary mb-3">
                  <IconLoader className="size-6 animate-spin text-primary" />
                </div>
                <p className="text-sm font-semibold text-foreground">
                  Searching workspace...
                </p>
                <p className="text-xs text-muted-foreground max-w-sm mt-1 leading-relaxed">
                  Fetching branches, facilities, and staff members...
                </p>
              </div>
            ) : (
              /* Empty State */
              <div
                role="status"
                aria-live="polite"
                className="py-12 px-4 text-center flex flex-col items-center justify-center animate-in fade-in-50 duration-200"
              >
                <div className="p-3.5 rounded-2xl bg-muted/60 text-muted-foreground mb-3">
                  <IconSearchOff className="size-6 text-muted-foreground/70" />
                </div>
                <p className="text-sm font-semibold text-foreground">
                  No results found for &ldquo;{query.trim()}&rdquo;
                </p>
                <p className="text-xs text-muted-foreground max-w-sm mt-1 leading-relaxed">
                  Check your spelling or try querying pages, branches, facilities (clinic, lab, pharmacy), or team members.
                </p>
              </div>
            )
          ) : (
            <>
              {/* Grouped Results with WAI-ARIA role="group" */}
              {Array.from(groupedResults.entries()).map(([category, categoryData]) => {
                const { items, startIndex } = categoryData;
                // aria-label={categoryData.label || CATEGORY_LABELS[category as SearchCategory] || categoryTitle}
                const categoryTitle =
                  categoryData.label || CATEGORY_LABELS[category as SearchCategory] || category;

                return (
                  <div
                    key={category}
                    role="group"
                    aria-label={categoryTitle}
                    className="space-y-1"
                  >
                    <div
                      role="presentation"
                      aria-hidden="true"
                      className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70 flex items-center justify-between select-none"
                    >
                      <span>{categoryData.label || CATEGORY_LABELS[category as SearchCategory] || category}</span>
                      {isZeroState && category === "actions" && (
                        <span className="text-[10px] lowercase font-normal text-muted-foreground/50">
                          Suggested
                        </span>
                      )}
                    </div>

                    <div className="space-y-0.5">
                      {items.map((item, localIdx) => {
                        const globalIdx = startIndex + localIdx;
                        const isSelected = globalIdx === activeIndex;
                        const Icon = item.icon;
                        const optionId = `workspace-search-opt-${(item.id || "").replace(/[^\w-]/g, "_")}`;

                        return (
                          <button
                            key={item.id}
                            id={optionId}
                            type="button"
                            role="option"
                            tabIndex={-1}
                            aria-selected={isSelected}
                            onClick={() => handleSelectItem(item)}
                            onPointerMove={(e) => {
                              // Only track hover for mouse devices; ignore touch scrolling
                              if (e.pointerType !== "mouse") {
                                return;
                              }
                              // Ignore mouse move if pointer is stationary (e.g. scrolling under mouse)
                              if (
                                typeof e.movementX === "number" &&
                                typeof e.movementY === "number" &&
                                e.movementX === 0 &&
                                e.movementY === 0
                              ) {
                                return;
                              }
                              if (activeIndex !== globalIdx) {
                                setActiveIndex(globalIdx);
                              }
                            }}
                            className={cn(
                              "w-full group flex items-center justify-between p-2.5 rounded-xl text-left cursor-pointer transition-all duration-150 min-w-0 border border-transparent touch-manipulation",
                              isSelected
                                ? "bg-primary/10 text-primary border-primary/20 shadow-xs"
                                : "hover:bg-muted/50 text-foreground"
                            )}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div
                                className={cn(
                                  "p-2 rounded-lg shrink-0 transition-colors",
                                  isSelected
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted/70 text-muted-foreground group-hover:bg-muted"
                                )}
                              >
                                <Icon className="size-4 shrink-0" />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className={cn(
                                      "font-semibold text-xs sm:text-sm truncate",
                                      isSelected
                                        ? "text-primary font-bold"
                                        : "text-foreground group-hover:text-foreground"
                                    )}
                                  >
                                    {item.title}
                                  </span>
                                  {item.badge && (
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "text-[10px] font-semibold px-1.5 py-0 shrink-0",
                                        item.badgeClass || "border-border/60"
                                      )}
                                    >
                                      {item.badge}
                                    </Badge>
                                  )}
                                </div>
                                {item.subtitle && (
                                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                    {item.subtitle}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="shrink-0 flex items-center ml-2">
                              {isSelected ? (
                                <span className="flex items-center gap-1 text-[11px] font-bold text-primary animate-in fade-in-50 duration-150">
                                  <span className="hidden sm:inline text-[10px]">Select</span>
                                  <IconCornerDownLeft className="size-3.5" />
                                </span>
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Truncation notice if results exceed MAX_RENDERED_RESULTS */}
              {filteredResults.length > visibleResults.length && (
                <div className="py-2.5 px-3 text-center text-xs text-muted-foreground border-t border-border/40 mt-2 bg-muted/10 rounded-lg">
                  Showing top {visibleResults.length} of {filteredResults.length} matches. Type more characters to narrow results.
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer with Keyboard Hints */}
        <div className="border-t border-border/40 px-4 py-2.5 bg-muted/20 text-[11px] text-muted-foreground flex items-center justify-between select-none">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="font-mono bg-muted/70 px-1.5 py-0.5 rounded text-[10px] border border-border/50">
                ↑
              </kbd>
              <kbd className="font-mono bg-muted/70 px-1.5 py-0.5 rounded text-[10px] border border-border/50">
                ↓
              </kbd>
              <span className="text-[10px]">Navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="font-mono bg-muted/70 px-1.5 py-0.5 rounded text-[10px] border border-border/50">
                ↵
              </kbd>
              <span className="text-[10px]">Select</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="font-mono bg-muted/70 px-1.5 py-0.5 rounded text-[10px] border border-border/50">
                esc
              </kbd>
              <span className="text-[10px]">Close</span>
            </span>
          </div>

          <span className="hidden sm:inline text-[10px] text-muted-foreground/80 font-mono">
            ClinicEZ Search
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
