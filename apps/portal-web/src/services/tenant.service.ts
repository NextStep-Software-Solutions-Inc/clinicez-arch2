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

/** Portal sign-in policy (mirrors `WorkspaceSecurityDto`). 0 idle timeout = off; empty domain list = any domain. */
export interface WorkspaceSecurity {
  requireMfa: boolean;
  idleTimeoutMinutes: number;
  allowedInviteDomains: string[];
}

/** DPO and privacy notice (mirrors `WorkspaceComplianceDto`). */
export interface WorkspaceCompliance {
  dpoName?: string | null;
  dpoEmail?: string | null;
  privacyNoticeUrl?: string | null;
}

/** Mirrors `WorkspaceSettingsDto`; later sections are added as new properties. */
export interface WorkspaceSettingsDto {
  tenantSlug: string;
  tenantType: string;
  general: WorkspaceGeneral;
  branding: WorkspaceBranding;
  security: WorkspaceSecurity;
  compliance: WorkspaceCompliance;
}

/** What every signed-in member needs to honour the policy (mirrors `WorkspaceSessionPolicyDto`). */
export interface WorkspaceSessionPolicy {
  requireMfa: boolean;
  idleTimeoutMinutes: number;
}

export type FacilityDeploymentMode = "SharedCloud" | "OnPremise";

/** Mirrors `FacilityDeploymentDto`. */
export interface FacilityDeployment {
  facilityId: string;
  deploymentMode: FacilityDeploymentMode;
  consoleBaseUrl?: string | null;
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
  dpoName?: string | null;
  dpoEmail?: string | null;
  privacyNoticeUrl?: string | null;
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

  /** Replaces the Security section (MFA requirement, idle timeout, invite domain allow-list). */
  updateSecurity: async (tenantSlug: string, payload: WorkspaceSecurity): Promise<WorkspaceSecurity> => {
    const response = await apiClient.put<WorkspaceSecurity>(
      `/tenants/${encodeURIComponent(tenantSlug)}/settings/security`,
      payload,
    );
    return response.data;
  },

  /** Replaces the Compliance section (DPO, privacy notice URL). */
  updateCompliance: async (tenantSlug: string, payload: WorkspaceCompliance): Promise<WorkspaceCompliance> => {
    const response = await apiClient.put<WorkspaceCompliance>(
      `/tenants/${encodeURIComponent(tenantSlug)}/settings/compliance`,
      payload,
    );
    return response.data;
  },

  /**
   * MFA requirement + idle timeout for the signed-in member (any active member may read it).
   * Returns null on failure so a policy lookup problem never locks people out of the dashboard.
   */
  getSessionPolicy: async (tenantSlug: string, token?: string | null): Promise<WorkspaceSessionPolicy | null> => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const response = await apiClient.get<WorkspaceSessionPolicy>(
        `/tenants/${encodeURIComponent(tenantSlug)}/session-policy`,
        { headers },
      );
      return response.data;
    } catch {
      return null;
    }
  },

  /** Sets where a facility service runs and, for on-premise, its https console address. */
  updateFacilityDeployment: async (
    tenantSlug: string,
    facilityId: string,
    payload: { deploymentMode: FacilityDeploymentMode; consoleBaseUrl?: string | null },
  ): Promise<FacilityDeployment> => {
    const response = await apiClient.put<FacilityDeployment>(
      `/tenants/${encodeURIComponent(tenantSlug)}/facilities/${encodeURIComponent(facilityId)}/deployment`,
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
