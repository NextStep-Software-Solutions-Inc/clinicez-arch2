import { apiClient } from "@/transport/apiClient";

export type StaffMemberStatus = "Active" | "Invited" | "Expired" | "Suspended" | "Revoked";

export interface StaffMemberDto {
  id: string;
  userId?: string | null;
  email: string;
  fullName: string;
  /** Job title for a plain member with a profile, otherwise the workspace role name. */
  role: string;
  status: StaffMemberStatus;
  facilityId?: string | null;
  facilityName?: string | null;
  joinedAt?: string | null;
  createdAt: string;
  invitationToken?: string | null;
  invitationExpiresAt?: string | null;
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
  sendEmail?: boolean;
}

export interface UpdateStaffRequest {
  fullName: string;
  role: string;
  facilityId?: string | null;
}

export interface InvitationDetailsDto {
  id: string;
  tenantName: string;
  tenantSlug: string;
  inviteeFullName: string;
  inviteeEmail: string;
  role: string;
  facilityName?: string | null;
  isExpired: boolean;
  isAlreadyAccepted: boolean;
  expiresAt?: string | null;
  isRevoked?: boolean;
  isSuspended?: boolean;
}

export interface AcceptInvitationResultDto {
  tenantSlug: string;
  workspaceName: string;
  role: string;
  fullName: string;
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

  deleteStaffMemberPermanently: async (id: string, tenantSlug: string): Promise<{ success: boolean; message: string }> => {
    const res = await apiClient.delete<{ success: boolean; message: string }>(`/staff/${id}/permanent?tenantSlug=${tenantSlug}`);
    return res.data;
  },

  resendInvitation: async (id: string, tenantSlug: string): Promise<StaffMemberDto> => {
    const res = await apiClient.post<StaffMemberDto>(`/staff/invitations/${id}/resend?tenantSlug=${tenantSlug}`);
    return res.data;
  },

  suspendStaffMember: async (id: string, tenantSlug: string): Promise<StaffMemberDto> => {
    const res = await apiClient.post<StaffMemberDto>(`/staff/${id}/suspend?tenantSlug=${tenantSlug}`);
    return res.data;
  },

  reactivateStaffMember: async (id: string, tenantSlug: string): Promise<StaffMemberDto> => {
    const res = await apiClient.post<StaffMemberDto>(`/staff/${id}/reactivate?tenantSlug=${tenantSlug}`);
    return res.data;
  },

  updateStaffMember: async (id: string, tenantSlug: string, payload: UpdateStaffRequest): Promise<StaffMemberDto> => {
    const res = await apiClient.put<StaffMemberDto>(`/staff/${id}?tenantSlug=${tenantSlug}`, payload);
    return res.data;
  },

  getInvitationDetails: async (token: string): Promise<InvitationDetailsDto> => {
    const res = await apiClient.get<InvitationDetailsDto>(`/staff/invitations/${token}`);
    return res.data;
  },

  acceptInvitation: async (token: string): Promise<AcceptInvitationResultDto> => {
    const res = await apiClient.post<AcceptInvitationResultDto>(`/staff/invitations/${token}/accept`);
    return res.data;
  },
};
