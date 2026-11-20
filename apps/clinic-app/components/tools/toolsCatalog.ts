import type { IconName } from '../ui/Icon';
import { PERMISSIONS, type PermissionKey } from '../../constants/permissions';

export type ClinicToolsTab = 'directory' | 'yakap' | 'calculators' | 'lookups' | 'operations';

export type YakapSubTool = 'pin-checker' | 'gamot' | 'masterlist';
export type CalculatorSubTool = 'bmi-bsa' | 'philpen' | 'pediatric-zscore' | 'ob-edd' | 'dosing-egfr';
export type LookupSubTool = 'icd10' | 'services' | 'psgc';
export type OperationsSubTool = 'share-import' | 'waiting-tv' | 'reception-placard';

export type ClinicToolId =
  | YakapSubTool
  | CalculatorSubTool
  | LookupSubTool
  | OperationsSubTool;

export type ToolCategoryKey = Exclude<ClinicToolsTab, 'directory'>;

export interface ClinicToolsTabSpec {
  key: ClinicToolsTab;
  label: string;
  icon: IconName;
  /** Optional permission gating the entire tab (when all tools under it share a permission). */
  permission?: PermissionKey;
  roles?: readonly string[];
}

export interface ClinicToolDefinition {
  id: ClinicToolId;
  tab: ToolCategoryKey;
  title: string;
  shortTitle: string;
  description: string;
  icon: IconName;
  categoryLabel: string;
  badgeLabel: string;
  keywords: readonly string[];
  permission?: PermissionKey;
  roles?: readonly string[];
}

export interface ToolAccessSubject {
  user?: { role?: string } | null;
  permissions?: readonly string[] | null;
  can?: (permission: string) => boolean;
}

export const CLINIC_TOOLS_TABS: readonly ClinicToolsTabSpec[] = [
  { key: 'directory', label: 'Directory', icon: 'grid' },
  {
    key: 'yakap',
    label: 'PhilHealth Yakap',
    icon: 'yakap',
    permission: PERMISSIONS.yakapRead,
    roles: ['Doctor', 'Admin'],
  },
  { key: 'calculators', label: 'Calculators', icon: 'calculator' },
  { key: 'lookups', label: 'Lookups', icon: 'bookOpen' },
  { key: 'operations', label: 'Operations', icon: 'qrCode' },
];

export const ALL_TOOLS_TABS: readonly ClinicToolsTab[] = CLINIC_TOOLS_TABS.map((t) => t.key);

export const CLINIC_TOOLS_CATALOG: readonly ClinicToolDefinition[] = [
  // ── PhilHealth Yakap ──────────────────────────────────────────────────────
  {
    id: 'pin-checker',
    tab: 'yakap',
    title: 'PhilHealth PIN Check',
    shortTitle: 'PIN check',
    description: 'Validate a 12-digit PhilHealth Identification Number via PCAPI and Mod-11 check digit.',
    icon: 'yakap',
    categoryLabel: 'PhilHealth Yakap',
    badgeLabel: 'PhilHealth',
    keywords: ['philhealth', 'pin', 'yakap', 'mod-11', 'verify', 'member', 'validator'],
    permission: PERMISSIONS.yakapRead,
    roles: ['Doctor', 'Admin'],
  },
  {
    id: 'gamot',
    tab: 'yakap',
    title: 'GAMOT Balance, UPSC & Formulary',
    shortTitle: 'GAMOT and UPSC',
    description: 'Check annual outpatient medicine balances, verify UPSC codes, and browse the approved formulary.',
    icon: 'pill',
    categoryLabel: 'PhilHealth Yakap',
    badgeLabel: 'PhilHealth',
    keywords: ['gamot', 'upsc', 'formulary', 'benefit', 'balance', 'dispense', 'prescription', 'philhealth', 'yakap'],
    permission: PERMISSIONS.yakapRead,
    roles: ['Doctor', 'Admin'],
  },
  {
    id: 'masterlist',
    tab: 'yakap',
    title: 'Catchment Masterlist Sync',
    shortTitle: 'Masterlist',
    description: 'Extract and inspect beneficiaries assigned to this facility under PhilHealth Yakap.',
    icon: 'patients',
    categoryLabel: 'PhilHealth Yakap',
    badgeLabel: 'PhilHealth',
    keywords: ['masterlist', 'catchment', 'beneficiaries', 'hci', 'accreditation', 'sync', 'philhealth', 'yakap'],
    permission: PERMISSIONS.yakapRead,
    roles: ['Doctor', 'Admin'],
  },

  // ── Clinical Calculators ──────────────────────────────────────────────────
  {
    id: 'bmi-bsa',
    tab: 'calculators',
    title: 'BMI & Body Surface Area (BSA)',
    shortTitle: 'BMI & BSA',
    description: 'Compute BMI (WHO Global & Asia-Pacific cutoffs), Mosteller/Du Bois BSA, and Devine ideal weight.',
    icon: 'scale',
    categoryLabel: 'Calculators',
    badgeLabel: 'Calculator',
    keywords: ['bmi', 'bsa', 'mosteller', 'dubois', 'body mass index', 'ideal weight', 'devine', 'anthropometry'],
  },
  {
    id: 'philpen',
    tab: 'calculators',
    title: 'PHILPEN 10-Year CVD Risk',
    shortTitle: 'PHILPEN CVD',
    description: 'Estimate 10-year cardiometabolic risk band (A–E) aligned with DOH PHILPEN & WHO/ISH protocol.',
    icon: 'heartPulse',
    categoryLabel: 'Calculators',
    badgeLabel: 'Calculator',
    keywords: ['philpen', 'cvd', 'cardiovascular', 'risk', 'who', 'ncd', 'hypertension', 'cholesterol', 'band'],
  },
  {
    id: 'pediatric-zscore',
    tab: 'calculators',
    title: 'Pediatric Growth Z-Score (WHO)',
    shortTitle: 'Pediatric Z-Score',
    description: 'Calculate WHO Weight-for-Age, Height-for-Age, and Weight-for-Height Z-scores for children under 5.',
    icon: 'baby',
    categoryLabel: 'Calculators',
    badgeLabel: 'Calculator',
    keywords: ['pediatric', 'z-score', 'zscore', 'who', 'growth', 'infant', 'stunting', 'wasting', 'child'],
    permission: PERMISSIONS.patientsRead,
    roles: ['Doctor', 'Nurse', 'Receptionist', 'Admin'],
  },
  {
    id: 'ob-edd',
    tab: 'calculators',
    title: 'OB EDD & Gestational Age (AOG)',
    shortTitle: 'OB EDD / AOG',
    description: 'Calculate estimated due date via Naegele’s rule, current AOG, trimester, and prenatal milestones.',
    icon: 'calendar',
    categoryLabel: 'Calculators',
    badgeLabel: 'Calculator',
    keywords: ['ob', 'edd', 'aog', 'lmp', 'pregnancy', 'gestational', 'trimester', 'naegele', 'prenatal'],
  },
  {
    id: 'dosing-egfr',
    tab: 'calculators',
    title: 'Pediatric Dosing & Renal eGFR',
    shortTitle: 'Dosing & eGFR',
    description: 'Weight-based pediatric suspension dosing with max-cap checks plus CKD-EPI 2021 eGFR & Cockcroft-Gault.',
    icon: 'syringe',
    categoryLabel: 'Calculators',
    badgeLabel: 'Calculator',
    keywords: ['pediatric', 'dosing', 'mg/kg', 'suspension', 'egfr', 'ckd-epi', 'creatinine', 'renal', 'cockcroft'],
  },

  // ── Medical & Reference Lookups ───────────────────────────────────────────
  {
    id: 'icd10',
    tab: 'lookups',
    title: 'ICD-10 Diagnosis Lookup',
    shortTitle: 'ICD-10',
    description: 'Search official ICD-10 diagnosis codes and descriptions with one-click code copy.',
    icon: 'search',
    categoryLabel: 'Lookups',
    badgeLabel: 'Lookup',
    keywords: ['icd10', 'icd-10', 'diagnosis', 'code', 'disease', 'clinical', 'reference'],
    permission: PERMISSIONS.consultationsRead,
    roles: ['Doctor', 'Nurse', 'Admin'],
  },
  {
    id: 'services',
    tab: 'lookups',
    title: 'Clinic Services & Pricing',
    shortTitle: 'Services & Pricing',
    description: 'Quick-reference directory of active clinic fees, lab codes, procedures, and PhilHealth coverage.',
    icon: 'tag',
    categoryLabel: 'Lookups',
    badgeLabel: 'Lookup',
    keywords: ['services', 'pricing', 'fees', 'catalog', 'laboratory', 'procedure', 'tariff', 'rate'],
    permission: PERMISSIONS.servicesRead,
    roles: ['Doctor', 'Nurse', 'Cashier', 'Receptionist', 'Admin'],
  },
  {
    id: 'psgc',
    tab: 'lookups',
    title: 'PSGC Philippine Address Lookup',
    shortTitle: 'PSGC Address',
    description: 'Search or browse Regions, Provinces, Cities, and Barangays with official 10-digit PSGC codes.',
    icon: 'mapPin',
    categoryLabel: 'Lookups',
    badgeLabel: 'Lookup',
    keywords: ['psgc', 'address', 'barangay', 'municipality', 'city', 'province', 'region', 'philippines'],
  },

  // ── Front-Desk & Operations Utilities ─────────────────────────────────────
  {
    id: 'share-import',
    tab: 'operations',
    title: 'Scan Patient Share QR / Code',
    shortTitle: 'Scan Share QR',
    description: 'Redeem a patient’s ClinicEZ share QR token or one-time code to import their record or check them in.',
    icon: 'scan',
    categoryLabel: 'Operations',
    badgeLabel: 'Front Desk',
    keywords: ['qr', 'scan', 'share', 'import', 'patient', 'one-time code', 'token', 'intake', 'reception'],
    permission: PERMISSIONS.patientsWrite,
    roles: ['Doctor', 'Nurse', 'Receptionist', 'Admin'],
  },
  {
    id: 'waiting-tv',
    tab: 'operations',
    title: 'Waiting Area TV Display',
    shortTitle: 'Waiting Area TV',
    description: 'Launch or copy the Local LAN and Cloud waiting-room queue display board links.',
    icon: 'tv',
    categoryLabel: 'Operations',
    badgeLabel: 'Front Desk',
    keywords: ['tv', 'queue', 'display', 'waiting area', 'kiosk', 'monitor', 'lobby', 'screen'],
  },
  {
    id: 'reception-placard',
    tab: 'operations',
    title: 'Reception QR Check-In Placard',
    shortTitle: 'Reception QR',
    description: 'Preview, copy, or print the clinic’s front-desk patient check-in QR code poster.',
    icon: 'qrCode',
    categoryLabel: 'Operations',
    badgeLabel: 'Front Desk',
    keywords: ['placard', 'poster', 'qr', 'check-in', 'join link', 'reception', 'print', 'front desk'],
  },
];

export const ALL_TOOL_IDS: readonly ClinicToolId[] = CLINIC_TOOLS_CATALOG.map((t) => t.id);

export const LEGACY_YAKAP_TAB_IDS: ReadonlySet<string> = new Set([
  'pin-checker',
  'gamot',
  'masterlist',
]);

/**
 * Evaluates whether the signed-in staff member can access a given tool or tab.
 * Tools without `permission` and `roles` are open to every clinic staff member.
 */
export function canAccessTool(
  spec: { permission?: PermissionKey; roles?: readonly string[] },
  auth: ToolAccessSubject,
): boolean {
  if (!spec.permission && !spec.roles) return true;
  if (!auth.user) return true;
  if (auth.user.role === 'Admin') return true;
  if (spec.permission && auth.can?.(spec.permission)) return true;

  const hasExplicitPermissions = Array.isArray(auth.permissions) && auth.permissions.length > 0;
  if (!hasExplicitPermissions && spec.roles && auth.user.role && spec.roles.includes(auth.user.role)) {
    return true;
  }
  return false;
}

/**
 * Returns the subset of catalog tools the current user is allowed to access.
 */
export function getAccessibleTools(auth: ToolAccessSubject): ClinicToolDefinition[] {
  return CLINIC_TOOLS_CATALOG.filter((tool) => canAccessTool(tool, auth));
}

/**
 * Returns the visible top-level horizontal tabs for the current user.
 * A category tab is visible when at least one tool under it is accessible.
 */
export function getVisibleToolTabs(auth: ToolAccessSubject): ClinicToolsTabSpec[] {
  const accessible = getAccessibleTools(auth);
  return CLINIC_TOOLS_TABS.filter((tabSpec) => {
    if (tabSpec.key === 'directory') return true;
    if (!canAccessTool(tabSpec, auth)) return false;
    return accessible.some((t) => t.tab === tabSpec.key);
  });
}

/**
 * Returns the default sub-tool for a given category tab, preferring the first accessible tool.
 */
export function getDefaultToolForTab(
  tab: ToolCategoryKey,
  accessibleTools: readonly ClinicToolDefinition[] = CLINIC_TOOLS_CATALOG,
): ClinicToolId {
  const match = accessibleTools.find((t) => t.tab === tab);
  if (match) return match.id;
  const fallback = CLINIC_TOOLS_CATALOG.find((t) => t.tab === tab);
  return fallback ? fallback.id : 'bmi-bsa';
}

/**
 * Finds a tool definition by ID.
 */
export function findToolById(id?: string | null): ClinicToolDefinition | undefined {
  if (!id) return undefined;
  return CLINIC_TOOLS_CATALOG.find((t) => t.id === id);
}

/**
 * Filters tools for the Directory search & category chips.
 */
export function filterToolsCatalog(
  tools: readonly ClinicToolDefinition[],
  options: { query?: string; category?: 'all' | ToolCategoryKey },
): ClinicToolDefinition[] {
  const category = options.category ?? 'all';
  const normalizedQuery = (options.query ?? '').trim().toLowerCase();

  return tools.filter((tool) => {
    if (category !== 'all' && tool.tab !== category) return false;
    if (!normalizedQuery) return true;
    const haystack = [
      tool.title,
      tool.shortTitle,
      tool.description,
      tool.categoryLabel,
      tool.badgeLabel,
      ...tool.keywords,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

/**
 * Translates legacy `/yakap?tab=pin-checker|gamot|masterlist` or direct tool route params
 * into canonical `{ tab, tool }` targets for the unified Tools directory screen.
 */
export function resolveToolsRouteIntent(params?: {
  tab?: string | null;
  tool?: string | null;
  pathname?: string | null;
}): { tab?: ClinicToolsTab; tool?: ClinicToolId } {
  const rawTab = params?.tab?.trim().toLowerCase();
  const rawTool = params?.tool?.trim().toLowerCase();
  const rawPath = params?.pathname?.toLowerCase() ?? '';

  // Legacy Yakap sub-tabs passed in ?tab=
  if (rawTab && LEGACY_YAKAP_TAB_IDS.has(rawTab)) {
    return {
      tab: 'yakap',
      tool: rawTab as YakapSubTool,
    };
  }

  // Explicit directory tab ignores any stale tool param
  if (rawTab === 'directory') {
    return {
      tab: 'directory',
    };
  }

  // Direct tool ID passed in ?tool=
  const toolMatch = findToolById(rawTool);
  if (toolMatch) {
    if (
      rawTab &&
      (ALL_TOOLS_TABS as readonly string[]).includes(rawTab) &&
      rawTab !== toolMatch.tab
    ) {
      return {
        tab: rawTab as ClinicToolsTab,
      };
    }
    return {
      tab: toolMatch.tab,
      tool: toolMatch.id,
    };
  }

  // Canonical top-level tab
  if (rawTab && (ALL_TOOLS_TABS as readonly string[]).includes(rawTab)) {
    return {
      tab: rawTab as ClinicToolsTab,
    };
  }

  // Legacy `/yakap` path with no query param defaults directly to the PhilHealth Yakap tab
  if (rawPath.includes('/yakap')) {
    return {
      tab: 'yakap',
      tool: 'pin-checker',
    };
  }

  return {};
}
