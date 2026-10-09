import { apiClient } from "@/transport/apiClient";

export interface RegisterTenantPayload {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  name: string;
  tenantSlug: string;
  tenantType?: string;
}

export interface CreateTenantPayload {
  name: string;
  tenantSlug: string;
  tenantType?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

/** General section: identity, contacts and locale defaults (mirrors `WorkspaceGeneralDto`). */
export interface WorkspaceGeneral {
  name: string;
  representativeName?: string | null;
  email: string;
  phoneNumber?: string | null;
  timeZoneId: string;
  locale: string;
  dateFormat: string;
  currencyCode: string;
}

/** Brand identity override (mirrors `WorkspaceBrandingDto`). Null = not customised, inherit defaults. */
export interface WorkspaceBranding {
  brandName?: string | null;
  logoUrl?: string | null;
  accentColorHex?: string | null;
}

/** Mirrors `WorkspaceSettingsDto`; later sections are added as new properties. */
export interface WorkspaceSettingsDto {
  tenantSlug: string;
  tenantType: string;
  general: WorkspaceGeneral;
  branding: WorkspaceBranding;
}

/** Anonymous facility-facing projection of the workspace identity (mirrors `WorkspaceProfileDto`). */
export interface WorkspaceProfile {
  tenantSlug: string;
  version: number;
  displayName: string;
  logoUrl?: string | null;
  accentColorHex?: string | null;
  timeZoneId: string;
  locale: string;
  dateFormat: string;
  currencyCode: string;
}

export interface TenantDto {
  tenantSlug: string;
  name: string;
  tenantType: string;
  clinicName?: string;
  facilityType?: string;
  role?: "Owner" | "Admin" | "Biller" | "Viewer" | string;
  status?: string;
}

export const tenantService = {
  /**
   * Registers a new tenant and provisions the owner's Clerk account (unauthenticated).
   */
  registerTenant: async (payload: RegisterTenantPayload) => {
    const response = await apiClient.post<{ clerkUserId: string }>("/tenants/register", {
      ...payload,
      tenantType: payload.tenantType || "Workplace",
    });
    return response.data;
  },

  /**
   * Provisions a new workplace/entity tenant for an already authenticated user.
   */
  createTenant: async (payload: CreateTenantPayload, token?: string | null): Promise<TenantDto> => {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    const response = await apiClient.post<TenantDto>("/tenants", {
      ...payload,
      tenantType: payload.tenantType || "Workplace",
    }, { headers });
    
    const data = response.data;
    return {
      ...data,
      name: data.name || data.clinicName || "",
      tenantType: data.tenantType || data.facilityType || "Workplace",
      clinicName: data.name || data.clinicName || "",
      facilityType: data.tenantType || data.facilityType || "Workplace",
      role: data.role || "Owner",
      status: data.status || "Active"
    };
  },

  /**
   * Fetches the tenant associated with a given Clerk user ID and optional target workspace slug.
   * Resolves whether the user is the primary Owner or an invited active staff member (Admin, Biller, Viewer).
   */
  getTenantByOwner: async (ownerId: string, token?: string | null, tenantSlug?: string): Promise<TenantDto | null> => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const url = tenantSlug 
        ? `/users/${ownerId}/tenant?tenantSlug=${encodeURIComponent(tenantSlug)}` 
        : `/users/${ownerId}/tenant`;
      const response = await apiClient.get<TenantDto>(url, { headers });
      const data = response.data;
      return {
        ...data,
        name: data.name || data.clinicName || "",
        tenantType: data.tenantType || data.facilityType || "Workplace",
        clinicName: data.name || data.clinicName || "",
        facilityType: data.tenantType || data.facilityType || "Workplace",
        role: data.role || "Owner",
        status: data.status || "Active"
      };
    } catch (error: any) {
      if (error.response?.status === 404) return null;
      throw error;
    }
  },

  /**
   * Fetches all workspace settings, grouped by section. Requires workspace Owner/Admin.
   */
  getWorkspaceSettings: async (tenantSlug: string): Promise<WorkspaceSettingsDto> => {
    const response = await apiClient.get<WorkspaceSettingsDto>(`/tenants/${encodeURIComponent(tenantSlug)}/settings`);
    return response.data;
  },

  /**
   * Replaces the General section (identity, contacts, locale defaults). Returns the saved section.
   */
  updateGeneral: async (tenantSlug: string, payload: WorkspaceGeneral): Promise<WorkspaceGeneral> => {
    const response = await apiClient.put<WorkspaceGeneral>(
      `/tenants/${encodeURIComponent(tenantSlug)}/settings/general`,
      payload,
    );
    return response.data;
  },

  /**
   * Replaces the Branding section (display name, https logo URL, accent color).
   */
  updateBranding: async (tenantSlug: string, payload: WorkspaceBranding): Promise<WorkspaceBranding> => {
    const response = await apiClient.put<WorkspaceBranding>(
      `/tenants/${encodeURIComponent(tenantSlug)}/settings/branding`,
      payload,
    );
    return response.data;
  },

  /**
   * Public workspace identity (brand + regional defaults). Needs no token; returns null when the call
   * fails, so branding can never block the dashboard from rendering.
   */
  getWorkspaceProfile: async (tenantSlug: string): Promise<WorkspaceProfile | null> => {
    try {
      const response = await apiClient.get<WorkspaceProfile>(
        `/tenants/${encodeURIComponent(tenantSlug)}/workspace-profile`,
      );
      return response.data;
    } catch {
      return null;
    }
  },
};
