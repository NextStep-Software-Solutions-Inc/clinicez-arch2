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

export interface UpdateTenantSettingsPayload {
  name?: string;
  representativeName?: string;
  email?: string;
  phoneNumber?: string;
  timezone?: string;
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
   * Updates workspace settings and identity in the database.
   */
  updateTenantSettings: async (tenantSlug: string, payload: UpdateTenantSettingsPayload, token?: string | null) => {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    const response = await apiClient.put(`/tenants/${tenantSlug}/settings`, payload, { headers });
    return response.data;
  }
};
