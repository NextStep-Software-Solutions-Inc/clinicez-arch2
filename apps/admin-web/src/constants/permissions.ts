/**
 * Canonical Administrative Permissions Constants
 * 
 * Mirrors ClinicEz.Portal.Domain.Constants.Permissions in the backend.
 */

export const ADMIN_PERMISSIONS = {
  VIEW_ANALYTICS: "view:analytics",
  VIEW_TENANTS: "view:tenants",
  MANAGE_TENANTS: "manage:tenants",
  TOGGLE_SUBSCRIPTION: "toggle:subscription",
  MANAGE_BLOGS: "manage:blogs",
  MANAGE_ROLES: "manage:roles",
  MANAGE_ADMINS: "manage:admins",
  MANAGE_SETTINGS: "manage:settings",
  MANAGE_MIGRATIONS: "manage:migrations",
  MANAGE_PLANS: "manage:plans",
  VIEW_VERIFICATIONS: "view:verifications",
  VERIFY_DIRECTORY: "verify:directory",
  REVOKE_DIRECTORY_VERIFICATION: "verify:revoke",
} as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[keyof typeof ADMIN_PERMISSIONS];

export interface PermissionDefinition {
  token: AdminPermission;
  label: string;
  description: string;
  category:
    | "Analytics"
    | "Tenants"
    | "Billing"
    | "Content"
    | "Administration"
    | "System"
    | "Directory";
}

export const ALL_ADMIN_PERMISSIONS: readonly AdminPermission[] = Object.values(ADMIN_PERMISSIONS);

export function hasAdminPermission(
  profile: { permissions?: readonly string[] | null } | null | undefined,
  permission: string,
): boolean {
  if (!profile || !Array.isArray(profile.permissions)) return false;
  return profile.permissions.includes(permission);
}

export function canViewVerifications(
  profile: { permissions?: readonly string[] | null } | null | undefined,
): boolean {
  return hasAdminPermission(profile, ADMIN_PERMISSIONS.VIEW_VERIFICATIONS);
}

export function canVerifyDirectory(
  profile: { permissions?: readonly string[] | null } | null | undefined,
): boolean {
  return hasAdminPermission(profile, ADMIN_PERMISSIONS.VERIFY_DIRECTORY);
}

export function canRevokeDirectoryVerification(
  profile: { permissions?: readonly string[] | null } | null | undefined,
): boolean {
  return hasAdminPermission(profile, ADMIN_PERMISSIONS.REVOKE_DIRECTORY_VERIFICATION);
}

export function canManageMigrations(
  profile: { permissions?: readonly string[] | null; isSuperAdmin?: boolean } | null | undefined,
): boolean {
  if (profile?.isSuperAdmin) return true;
  return hasAdminPermission(profile, ADMIN_PERMISSIONS.MANAGE_MIGRATIONS);
}
