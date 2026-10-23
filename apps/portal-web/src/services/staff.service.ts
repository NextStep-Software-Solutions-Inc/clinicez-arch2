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

export interface ResetPortalPasswordResultDto {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  temporaryPassword: string;
  message: string;
  resetToken?: string | null;
  resetUrl?: string | null;
  emailSent?: boolean;
}

export interface PortalPasswordResetDetailsDto {
  fullName: string;
  email: string;
  role: string;
  scopeName: string;
  isExpired: boolean;
  expiresAt?: string | null;
}

export interface PendingSelfInvitationDto {
  invitationType: "Workspace" | "Admin";
  token: string;
  tenantSlug?: string | null;
  workspaceName?: string | null;
  role: string;
  email: string;
  expiresAt?: string | null;
  redirectUrl: string;
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

  resetStaffMemberPassword: async (
    id: string,
    tenantSlug: string,
    options?: {
      temporaryPassword?: string;
      sendResetEmail?: boolean;
      generateResetLink?: boolean;
      deliveryMode?: "email" | "link" | "password";
    }
  ): Promise<ResetPortalPasswordResultDto> => {
    const sendResetEmail = options?.sendResetEmail ?? options?.deliveryMode === "email";
    const generateResetLink = options?.generateResetLink ?? options?.deliveryMode === "link";
    const res = await apiClient.post<ResetPortalPasswordResultDto>(
      `/staff/${id}/reset-password?tenantSlug=${encodeURIComponent(tenantSlug)}`,
      {
        temporaryPassword: options?.temporaryPassword || undefined,
        sendResetEmail,
        generateResetLink,
        deliveryMode: options?.deliveryMode,
      }
    );
    return res.data;
  },

  getPasswordResetDetails: async (token: string): Promise<PortalPasswordResetDetailsDto> => {
    const res = await apiClient.get<PortalPasswordResetDetailsDto>(`/public/password-reset/${encodeURIComponent(token)}`);
    return res.data;
  },

  completePasswordReset: async (token: string, newPassword: string): Promise<{ message: string }> => {
    const res = await apiClient.post<{ message: string }>(`/public/password-reset/${encodeURIComponent(token)}`, {
      newPassword,
    });
    return res.data;
  },

  getPendingSelfInvitation: async (token?: string | null): Promise<PendingSelfInvitationDto | null> => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const res = await apiClient.get<PendingSelfInvitationDto>("/staff/invitations/pending-self", { headers });
      return res.data;
    } catch (err: unknown) {
      if ((err as { response?: { status?: number } }).response?.status === 404) {
        return null;
      }
      throw err;
    }
  },
};
