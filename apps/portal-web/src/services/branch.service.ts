import { apiClient } from "@/transport/apiClient";

export interface BranchFacilitySummary {
  id: string;
  name: string;
  facilityType: string;
  status: string;
}

export interface BranchDto {
  id: string;
  tenantId: string;
  name: string;
  code?: string;
  isActive: boolean;
  streetAddress?: string;
  barangay?: string;
  city?: string;
  province?: string;
  region?: string;
  zipCode?: string;
  contactNumber?: string;
  contactEmail?: string;
  philHealthAccreditationNumber?: string;
  philHealthPmccNumber?: string;
  philHealthSoftwareCertificateId?: string;
  philHealthKonsultaEndpoint?: string;
  isPhilHealthAccredited: boolean;
  facilities: BranchFacilitySummary[];
}

export interface CreateBranchPayload {
  tenantId: string;
  name: string;
  code?: string;
  streetAddress?: string;
  barangay?: string;
  city?: string;
  province?: string;
  region?: string;
  zipCode?: string;
  contactNumber?: string;
  contactEmail?: string;
  facilityIds?: string[];
}

export interface UpdateBranchPayload {
  name: string;
  code?: string;
  streetAddress?: string;
  barangay?: string;
  city?: string;
  province?: string;
  region?: string;
  zipCode?: string;
  contactNumber?: string;
  contactEmail?: string;
  isActive?: boolean;
}

export interface ConfigureBranchPhilHealthPayload {
  accreditationNumber: string;
  pmccNumber?: string;
  softwareCertificateId?: string;
  username?: string;
  password?: string;
  cipherKey?: string;
  konsultaEndpoint?: string;
  isPhilHealthAccredited?: boolean;
}

export const branchService = {
  getBranches: async (tenantSlug: string, token?: string | null): Promise<BranchDto[]> => {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    const response = await apiClient.get<any>(`/branches?tenantSlug=${encodeURIComponent(tenantSlug)}`, { headers });
    const data = response.data;
    if (data?.data && Array.isArray(data.data)) {
      return data.data;
    }
    if (Array.isArray(data)) {
      return data;
    }
    return [];
  },

  getBranchById: async (id: string, token?: string | null): Promise<BranchDto> => {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    const response = await apiClient.get<any>(`/branches/${id}`, { headers });
    return response.data?.data || response.data;
  },

  createBranch: async (payload: CreateBranchPayload, token?: string | null): Promise<BranchDto> => {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    const response = await apiClient.post<any>("/branches", payload, { headers });
    return response.data?.data || response.data;
  },

  updateBranch: async (id: string, payload: UpdateBranchPayload, token?: string | null): Promise<boolean> => {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    const response = await apiClient.put<any>(`/branches/${id}`, payload, { headers });
    return response.data?.success ?? true;
  },

  configurePhilHealth: async (id: string, payload: ConfigureBranchPhilHealthPayload, token?: string | null): Promise<boolean> => {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    const response = await apiClient.put<any>(`/branches/${id}/philhealth-config`, payload, { headers });
    return response.data?.success ?? true;
  },

  assignFacilities: async (id: string, facilityIds: string[], token?: string | null): Promise<boolean> => {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    const response = await apiClient.post<any>(`/branches/${id}/facilities`, facilityIds, { headers });
    return response.data?.success ?? true;
  },

  unlinkFacility: async (branchId: string, facilityId: string, token?: string | null): Promise<boolean> => {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    const response = await apiClient.delete<any>(`/branches/${branchId}/facilities/${facilityId}`, { headers });
    return response.data?.success ?? true;
  },

  deleteBranch: async (id: string, token?: string | null): Promise<boolean> => {
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    const response = await apiClient.delete<any>(`/branches/${id}`, { headers });
    return response.data?.success ?? true;
  }
};
