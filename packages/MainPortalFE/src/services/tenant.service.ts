import { apiClient } from "@/transport/apiClient";

export interface RegisterTenantPayload {
  firstName: string;
  lastName: string;
  email: string;
  password?: string;
  clinicName: string;
  tenantSlug: string;
  facilityType: string;
}

export interface TenantDto {
  tenantSlug: string;
  clinicName: string;
  facilityType: string;
}

export const tenantService = {
  /**
   * Registers a new tenant and provisions the owner's Clerk account.
   */
  registerTenant: async (payload: RegisterTenantPayload) => {
    // URL relative to the baseURL configured in apiClient ("https://localhost:5000/api")
    const response = await apiClient.post<{ clerkUserId: string }>("/tenants/register", payload);
    return response.data;
  },

  /**
   * Fetches the tenant associated with a given Clerk user ID.
   */
  getTenantByOwner: async (ownerId: string, token?: string | null): Promise<TenantDto | null> => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const response = await apiClient.get<TenantDto>(`/users/${ownerId}/tenant`, { headers });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) return null;
      throw error;
    }
  }
};
