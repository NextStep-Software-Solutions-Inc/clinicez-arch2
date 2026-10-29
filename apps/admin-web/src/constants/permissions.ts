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
  MANAGE_PLANS: "manage:plans",
} as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[keyof typeof ADMIN_PERMISSIONS];

export interface PermissionDefinition {
  token: AdminPermission;
  label: string;
  description: string;
  category: "Analytics" | "Tenants" | "Billing" | "Content" | "Administration" | "System";
}

export const ALL_ADMIN_PERMISSIONS: readonly AdminPermission[] = Object.values(ADMIN_PERMISSIONS);
