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

export const DEFAULT_PERMISSION_DEFINITIONS: readonly PermissionDefinition[] = [
  {
    token: ADMIN_PERMISSIONS.VIEW_ANALYTICS,
    label: "View Analytics",
    description: "Allows viewing high-level dashboard charts, stats, and estimated MRR.",
    category: "Analytics",
  },
  {
    token: ADMIN_PERMISSIONS.VIEW_TENANTS,
    label: "View Tenants & Leads",
    description: "Allows viewing lists of registered tenants and conversion leads.",
    category: "Tenants",
  },
  {
    token: ADMIN_PERMISSIONS.MANAGE_TENANTS,
    label: "Manage Tenant Details",
    description: "Allows modifying organization files and onboarding status.",
    category: "Tenants",
  },
  {
    token: ADMIN_PERMISSIONS.TOGGLE_SUBSCRIPTION,
    label: "Adjust Subscription Plan",
    description: "Allows manually upgrading/downgrading tenant billing active states and recording offline payments.",
    category: "Billing",
  },
  {
    token: ADMIN_PERMISSIONS.MANAGE_BLOGS,
    label: "Manage Blogs (CRM)",
    description: "Allows creating, updating, and deleting marketing blog posts.",
    category: "Content",
  },
  {
    token: ADMIN_PERMISSIONS.MANAGE_ROLES,
    label: "Manage Roles & Access",
    description: "Allows viewing, creating, and editing roles and permissions configurations.",
    category: "Administration",
  },
  {
    token: ADMIN_PERMISSIONS.MANAGE_ADMINS,
    label: "Manage Admin Users",
    description: "Allows full control to invite, edit, or delete other administrative profiles.",
    category: "Administration",
  },
  {
    token: ADMIN_PERMISSIONS.MANAGE_SETTINGS,
    label: "Manage Platform Settings",
    description: "Allows configuring platform-wide system settings and environment parameters.",
    category: "System",
  },
  {
    token: ADMIN_PERMISSIONS.MANAGE_PLANS,
    label: "Manage Commercial Plans",
    description: "Allows creating, updating, and managing commercial subscription tiers, limits, and feature entitlements.",
    category: "Billing",
  },
] as const;
