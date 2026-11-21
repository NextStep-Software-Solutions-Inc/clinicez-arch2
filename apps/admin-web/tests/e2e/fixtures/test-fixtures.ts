/**
 * Test Fixtures & Shared Validators for ClinicEZ Admin Web E2E Test Suites
 * Authoritative derivations from ORIGINAL_REQUEST.md & PROJECT.md
 */

export const QUANTITATIVE_LIMITS = [
  { key: "limit.clinics", label: "Max Clinics / Facilities", min: 1 },
  { key: "limit.laboratories", label: "Max Laboratory Centers", min: 0 },
  { key: "limit.pharmacies", label: "Max Dispensary Pharmacies", min: 0 },
  { key: "limit.organizations", label: "Max Network Organizations", min: 1 },
  { key: "limit.branches", label: "Max Satellite Branches", min: 0 },
  { key: "limit.members", label: "Max Active Staff / Clinicians", min: 1 },
  { key: "limit.staff", label: "Max Auxiliary Staff", min: 1 },
  { key: "limit.storage_gb", label: "Encrypted Vault Storage (GB)", min: 1 },
  { key: "limit.terminals", label: "Max Concurrent POS Terminals", min: 1 },
  { key: "limit.beds", label: "Max Inpatient Beds", min: 0 },
  { key: "limit.analyzers", label: "Max LIS Hardware Analyzers", min: 0 },
  { key: "limit.monthly_consultations", label: "Monthly Clinical Consultations", min: 10 },
  { key: "limit.api_requests_monthly", label: "Monthly External API Calls", min: 100 },
  { key: "limit.patients", label: "Max Active Patients", min: 50 },
] as const;

export const CAPABILITY_FLAGS = [
  { key: "feature.cross_tenant_interop", label: "Cross-Tenant Interop Hub Messaging" },
  { key: "feature.teleconsultation", label: "Integrated Video Teleconsultation" },
  { key: "feature.electronic_prescriptions", label: "PDEA / S2 Electronic Prescriptions" },
  { key: "feature.lis_integration", label: "Direct Laboratory Instrument Interfacing" },
  { key: "feature.inventory_management", label: "FEFO Pharmacy Batch & Lot Tracking" },
  { key: "feature.philhealth_konsulta", label: "PhilHealth Yakap DTD Transmittals" },
  { key: "feature.multi_terminal_sync", label: "Real-Time Multi-Cashier Sync" },
  { key: "feature.advanced_analytics", label: "Executive Governance & MRR Analytics" },
  { key: "feature.custom_letterhead", label: "Institutional PDF Stamp & Letterhead" },
  { key: "feature.on_prem", label: "Edge Gateway LAN Hybrid Sync" },
] as const;

export const ADMIN_PERMISSIONS = {
  VIEW_ANALYTICS: "view:analytics",
  VIEW_TENANTS: "view:tenants",
  MANAGE_TENANTS: "manage:tenants",
  TOGGLE_SUBSCRIPTION: "toggle:subscription",
  MANAGE_BLOGS: "manage:blogs",
  MANAGE_ROLES: "manage:roles",
  MANAGE_ADMINS: "manage:admins",
  MANAGE_SETTINGS: "manage:settings",
  MANAGE_PLANS: "manage:plans",
} as const;

export const PAYMENT_METHODS = [
  "Bank Transfer",
  "GCash/Maya",
  "Check",
  "Cash",
  "Promotional",
] as const;

export interface PlatformBankAccount {
  id: string;
  institution: string;
  accountName: string;
  accountNumber: string;
  copyValue: string;
  branch?: string;
  type: "bank" | "ewallet";
  badge: string;
  isActive: boolean;
}

export const DEFAULT_BANK_ACCOUNTS: PlatformBankAccount[] = [
  {
    id: "bdo",
    institution: "BDO Unibank",
    accountName: "Nextstep Software Corporation",
    accountNumber: "0012-3456-7890",
    copyValue: "0012-3456-7890",
    branch: "BGC Corporate Center",
    type: "bank",
    badge: "Commercial Bank",
    isActive: true,
  },
  {
    id: "bpi",
    institution: "Bank of the Philippine Islands (BPI)",
    accountName: "Nextstep Software Corporation",
    accountNumber: "4321-8765-09",
    copyValue: "4321-8765-09",
    branch: "Ayala Triangle",
    type: "bank",
    badge: "Commercial Bank",
    isActive: true,
  },
  {
    id: "gcash-maya",
    institution: "GCash / Maya",
    accountName: "Nextstep Software Corporation",
    accountNumber: "0917-123-EZPH (0917-123-3974)",
    copyValue: "0917-123-3974",
    branch: "Merchant QR / Mobile Wallet",
    type: "ewallet",
    badge: "Instant E-Wallet",
    isActive: true,
  },
];

export const SETTINGS_CATEGORIES = [
  "Licensing",
  "Billing",
  "Storage",
  "Mailer",
  "Contact",
  "Lifecycle",
] as const;

export const CLEAN_ROOT_ROUTES = [
  "/",
  "/tenants",
  "/tenants/$slug",
  "/plans",
  "/leads",
  "/blog",
  "/subscribers",
  "/roles",
  "/users",
  "/settings",
  "/invitations/$token",
  "/reset-password/$token",
  "/sign-in",
  "/sign-up",
  "/sync-auth",
] as const;

export const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "dev",
  "portal",
  "localhost",
]);

// ── Pure Domain Utilities Derived Strictly from Specification ─────────────

/**
 * Resolves tenant workspace destination URL.
 * Never targets port 3001 or admin domain.
 */
export function getTenantWorkspaceUrl(slug: string, path: string = "/dashboard", baseDomain: string = "localhost"): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (baseDomain === "localhost" || baseDomain.includes("localhost") || baseDomain.includes("127.0.0.1")) {
    return `http://localhost:3000/${slug}${cleanPath}`;
  }
  return `https://${slug}.${baseDomain}${cleanPath}`;
}

/**
 * Resolves public site destination URL.
 * Never targets port 3001 or admin domain.
 */
export function getPublicSiteUrl(path: string = "/", baseDomain: string = "localhost"): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (baseDomain === "localhost" || baseDomain.includes("localhost") || baseDomain.includes("127.0.0.1")) {
    return `http://localhost:3000${cleanPath}`;
  }
  return `https://${baseDomain}${cleanPath}`;
}

/**
 * Resolves AdminBaseUrl from configuration or domain name.
 */
export function resolveAdminBaseUrl(configUrl?: string, baseDomain: string = "clinicez.com", isDev: boolean = false): string {
  if (configUrl && configUrl.trim()) {
    return configUrl.trim().replace(/\/+$/, "");
  }
  if (isDev) {
    return "http://localhost:3001";
  }
  const cleanDomain = baseDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://admin.${cleanDomain}`;
}

/**
 * Resolves administrative display status with expiration calculation.
 */
export function resolveAdminDisplayStatus(u: {
  status?: string;
  displayStatus?: string;
  invitationExpiresAt?: string | null;
  isActive?: boolean;
}): string {
  if (u.displayStatus) return u.displayStatus;
  if (u.status === "Invited" && u.invitationExpiresAt && new Date(u.invitationExpiresAt) < new Date()) {
    return "Expired";
  }
  return u.status || (u.isActive ? "Active" : "Suspended");
}

/**
 * Self-action guard evaluation for admin users.
 */
export interface CurrentAdminIdentity {
  userId?: string | null;
  email?: string | null;
  emails?: (string | null | undefined)[];
}

export function isSelfAdminUser(
  adminUser: { clerkUserId?: string | null; email?: string | null } | null | undefined,
  currentAdmin: CurrentAdminIdentity | null | undefined
): boolean {
  if (!adminUser || !currentAdmin) return false;
  const currentUserId = currentAdmin.userId?.trim();
  const targetClerkId = adminUser.clerkUserId?.trim();
  if (currentUserId && targetClerkId && targetClerkId === currentUserId) {
    return true;
  }
  const targetEmail = adminUser.email?.trim().toLowerCase();
  if (!targetEmail) return false;

  const candidateEmails = new Set<string>();
  if (currentAdmin.email?.trim()) candidateEmails.add(currentAdmin.email.trim().toLowerCase());
  for (const e of currentAdmin.emails ?? []) {
    if (e?.trim()) candidateEmails.add(e.trim().toLowerCase());
  }
  return candidateEmails.has(targetEmail);
}

export function getAdminUserActionRestriction(
  adminUser: { clerkUserId?: string | null; email?: string | null; status?: string | null; displayStatus?: string | null } | null | undefined,
  currentAdmin: CurrentAdminIdentity | null | undefined
) {
  const isSelf = isSelfAdminUser(adminUser, currentAdmin);
  const effectiveStatus = adminUser?.displayStatus || adminUser?.status;
  const isInvite = effectiveStatus === "Invited" || effectiveStatus === "Expired";
  return {
    isSelf,
    canRevoke: !isSelf,
    canSuspend: !isSelf,
    canDelete: !isSelf,
    revokeTooltip: isSelf
      ? "You cannot revoke your own admin account."
      : isInvite
        ? effectiveStatus === "Expired"
          ? "Revoke Expired Invitation"
          : "Revoke Invitation"
        : "Revoke Admin Access",
    suspendTooltip: isSelf ? "You cannot suspend your own account." : "Suspend Account",
    deleteTooltip: isSelf ? "You cannot delete your own admin account." : "Permanently Delete Admin Profile",
  };
}

/**
 * BIR 12% Value-Added Tax (VAT) Calculator for Philippine Commercial Invoices.
 * Gross = Net + 12% VAT -> Net = Gross / 1.12, VAT = Gross - Net.
 */
export function calculateBirVat(grossAmount: number, isVatInclusive: boolean = true) {
  if (grossAmount <= 0) {
    return { netAmount: 0, vatAmount: 0, grossAmount: 0 };
  }
  if (isVatInclusive) {
    const netAmount = Math.round((grossAmount / 1.12) * 100) / 100;
    const vatAmount = Math.round((grossAmount - netAmount) * 100) / 100;
    return { netAmount, vatAmount, grossAmount };
  } else {
    const vatAmount = Math.round(grossAmount * 0.12 * 100) / 100;
    const totalGross = Math.round((grossAmount + vatAmount) * 100) / 100;
    return { netAmount: grossAmount, vatAmount, grossAmount: totalGross };
  }
}

/**
 * Validates N-Bank Accounts JSON payload.
 */
export function validateBankAccountsJson(jsonStr: string): { valid: boolean; accounts: PlatformBankAccount[]; error?: string } {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) {
      return { valid: false, accounts: [], error: "Root must be an array of bank accounts" };
    }
    const accounts: PlatformBankAccount[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      if (!item.institution || typeof item.institution !== "string") {
        return { valid: false, accounts: [], error: `Account at index ${i} missing institution` };
      }
      if (!item.accountNumber || typeof item.accountNumber !== "string") {
        return { valid: false, accounts: [], error: `Account at index ${i} missing accountNumber` };
      }
      accounts.push({
        id: String(item.id || `bank-${i + 1}`),
        institution: String(item.institution),
        accountName: String(item.accountName || ""),
        accountNumber: String(item.accountNumber),
        copyValue: String(item.copyValue || item.accountNumber),
        branch: item.branch ? String(item.branch) : "",
        type: item.type === "ewallet" ? "ewallet" : "bank",
        badge: String(item.badge || (item.type === "ewallet" ? "Instant E-Wallet" : "Commercial Bank")),
        isActive: item.isActive !== false,
      });
    }
    return { valid: true, accounts };
  } catch (err: any) {
    return { valid: false, accounts: [], error: err.message };
  }
}

/**
 * Escapes CSV field value per RFC 4180.
 */
export function escapeCsvField(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * Simulates Idle Session Guard state.
 */
export function evaluateIdleSessionState(
  lastActiveAtMs: number,
  nowMs: number,
  timeoutMinutes: number = 15,
  warningSeconds: number = 60
) {
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const warningMs = (timeoutMinutes * 60 - warningSeconds) * 1000;
  const elapsedMs = nowMs - lastActiveAtMs;

  if (elapsedMs >= timeoutMs) {
    return { isExpired: true, showWarning: false, remainingSeconds: 0 };
  }
  if (elapsedMs >= warningMs) {
    const remainingSeconds = Math.max(0, Math.ceil((timeoutMs - elapsedMs) / 1000));
    return { isExpired: false, showWarning: true, remainingSeconds };
  }
  return { isExpired: false, showWarning: false, remainingSeconds: Math.ceil((timeoutMs - elapsedMs) / 1000) };
}

/**
 * Evaluates MFA Gate requirement.
 */
export function evaluateMfaGate(requireMfaEnv: string | boolean | undefined, user2FaEnabled: boolean) {
  const isMfaRequired = String(requireMfaEnv).toLowerCase() === "true";
  if (!isMfaRequired) {
    return { canAccess: true, promptEnrollment: false, badge: "MFA Inactive" };
  }
  if (user2FaEnabled) {
    return { canAccess: true, promptEnrollment: false, badge: "MFA Active" };
  }
  return { canAccess: false, promptEnrollment: true, badge: "MFA Enforced" };
}
