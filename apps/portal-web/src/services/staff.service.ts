import { apiClient } from "@/transport/apiClient";

export interface StaffMemberDto {
  id: string;
  userId?: string | null;
  email: string;
  fullName: string;
  role: string;
  status: string;
  facilityId?: string | null;
  facilityName?: string | null;
  joinedAt?: string | null;
  createdAt: string;
}

export interface StaffQuotaDto {
  currentCount: number;
  maxAllowed: number;
  planTitle: string;
  isQuotaReached: boolean;
}

export interface TenantStaffResultDto {
  members: StaffMemberDto[];
  quota: StaffQuotaDto;
}

export interface InviteStaffRequest {
  tenantSlug: string;
  email: string;
  fullName: string;
  role: string;
  facilityId?: string;
}

export const staffService = {
  getTenantStaff: async (tenantSlug: string): Promise<TenantStaffResultDto> => {
    const res = await apiClient.get<TenantStaffResultDto>(`/staff?tenantSlug=${tenantSlug}`);
    return res.data;
  },

  inviteStaffMember: async (payload: InviteStaffRequest): Promise<StaffMemberDto> => {
    const res = await apiClient.post<StaffMemberDto>("/staff/invite", payload);
    return res.data;
  },

  revokeStaffMember: async (id: string, tenantSlug: string): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.delete<{ success: boolean; message: string }>(`/staff/${id}?tenantSlug=${tenantSlug}`);
    return res.data;
  },
};
