import { z } from "zod";
import { apiClient } from "@/transport/apiClient";
import { ownershipTransferStatusSchema, parseWire } from "@/lib/wire";
import type { FacilityDeploymentMode, WorkspaceRole } from "@/lib/wire";

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
  /** Role of the signed-in viewer ("Owner" | "Admin"); owner-only controls are shown for "Owner". */
  viewerRole: string;
}

/** What every signed-in member needs to honour the policy (mirrors `WorkspaceSessionPolicyDto`). */
export interface WorkspaceSessionPolicy {
  requireMfa: boolean;
  idleTimeoutMinutes: number;
}

export type { FacilityDeploymentMode };

/** Mirrors `FacilityDeploymentDto`. */
export interface FacilityDeployment {
  facilityId: string;
  deploymentMode: FacilityDeploymentMode;
  consoleBaseUrl?: string | null;
}

/** One settings change (mirrors `WorkspaceAuditEntryDto`). `changes` maps field name to { old, new }. */
export interface WorkspaceAuditEntry {
  id: string;
  occurredAt: string;
  actorName: string;
  actorRole: string;
  section: string;
  action: string;
  changes: Record<string, { old: unknown; new: unknown }>;
}

export interface WorkspaceAuditLogPage {
  items: WorkspaceAuditEntry[];
  nextCursor?: string | null;
}

const ownershipTransferSchema = z.object({
  id: z.string(),
  targetMemberId: z.string(),
  targetName: z.string(),
  targetEmail: z.string(),
  status: ownershipTransferStatusSchema,
  expiresAt: z.string(),
  createdAt: z.string(),
});

/** Mirrors `OwnershipTransferDto`: the open offer. Status is "Pending" while it waits for an answer. */
export type OwnershipTransfer = z.infer<typeof ownershipTransferSchema>;

export interface OwnershipTransferResult {
  newOwnerName: string;
  newOwnerEmail: string;
  previousOwnerNewRole: string;
}

export interface ArchiveWorkspaceResult {
  archivedAt: string;
  facilitiesSuspended: number;
}

/** Mirrors `ApiKeyDto`. The key itself is never returned except once, by `createApiKey`. */
export interface WorkspaceApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  createdByName: string;
  createdAt: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
}

export interface CreatedApiKey {
  apiKey: WorkspaceApiKey;
  key: string;
}

/** Mirrors `WebhookEndpointDto`. The signing secret is never returned except once, by `createWebhook`. */
export interface WorkspaceWebhook {
  id: string;
  url: string;
  description?: string | null;
  events: string[];
  isActive: boolean;
  createdAt: string;
}

export interface CreatedWebhook {
  endpoint: WorkspaceWebhook;
  secret: string;
}

export interface WebhookDelivery {
  id: string;
  eventType: string;
  status: "Pending" | "Succeeded" | "Failed";
  attemptCount: number;
  createdAt: string;
  lastAttemptAt?: string | null;
  nextAttemptAt?: string | null;
  responseStatusCode?: number | null;
  lastError?: string | null;
}

export interface WorkspaceIntegrations {
  apiKeys: WorkspaceApiKey[];
  webhooks: WorkspaceWebhook[];
  availableScopes: string[];
  availableEvents: string[];
  maxActiveApiKeys: number;
  maxWebhookEndpoints: number;
}

export interface WebhookInput {
  url: string;
  description?: string | null;
  events: string[];
  isActive?: boolean;
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
  role?: WorkspaceRole;
  status?: "Active" | "Archived";
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
    } catch (error: unknown) {
      if ((error as { response?: { status?: number } }).response?.status === 404) return null;
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

  /** Newest-first page of the settings audit trail. Pass the returned `nextCursor` as `before` for the next page. */
  getAuditLog: async (
    tenantSlug: string,
    opts: { take?: number; before?: string | null; section?: string | null } = {},
  ): Promise<WorkspaceAuditLogPage> => {
    const params = new URLSearchParams();
    if (opts.take) params.set("take", String(opts.take));
    if (opts.before) params.set("before", opts.before);
    if (opts.section) params.set("section", opts.section);
    const qs = params.toString();
    const response = await apiClient.get<WorkspaceAuditLogPage>(
      `/tenants/${encodeURIComponent(tenantSlug)}/settings/audit-log${qs ? `?${qs}` : ""}`,
    );
    return response.data;
  },

  /**
   * Owner only. Step one: offers ownership to an active member who owns no workspace (409
   * `target_already_owns_workspace` otherwise). Nothing changes until they accept; the offer lapses after 7 days.
   */
  offerOwnershipTransfer: async (
    tenantSlug: string,
    payload: { targetStaffMemberId: string; confirmSlug: string },
  ): Promise<OwnershipTransfer> => {
    const response = await apiClient.post<unknown>(
      `/tenants/${encodeURIComponent(tenantSlug)}/settings/ownership-transfer`,
      payload,
    );
    return parseWire(ownershipTransferSchema, response.data, "ownership transfer");
  },

  /** The open offer, visible to the owner who made it and the member it is addressed to; null otherwise (204). */
  getOwnershipTransfer: async (tenantSlug: string): Promise<OwnershipTransfer | null> => {
    const response = await apiClient.get<unknown>(
      `/tenants/${encodeURIComponent(tenantSlug)}/settings/ownership-transfer`,
    );
    return response.status === 204 || response.data === "" ? null : parseWire(ownershipTransferSchema, response.data, "ownership transfer");
  },

  /** Step two, by the member the offer is addressed to. The previous owner becomes an Admin. */
  acceptOwnershipTransfer: async (tenantSlug: string): Promise<OwnershipTransferResult> => {
    const response = await apiClient.post<OwnershipTransferResult>(
      `/tenants/${encodeURIComponent(tenantSlug)}/settings/ownership-transfer/accept`,
    );
    return response.data;
  },

  declineOwnershipTransfer: async (tenantSlug: string): Promise<void> => {
    await apiClient.post(`/tenants/${encodeURIComponent(tenantSlug)}/settings/ownership-transfer/decline`);
  },

  /** Owner only. Withdraws the open offer before it is answered. */
  cancelOwnershipTransfer: async (tenantSlug: string): Promise<void> => {
    await apiClient.delete(`/tenants/${encodeURIComponent(tenantSlug)}/settings/ownership-transfer`);
  },

  /** Owner only. Closes the workspace in the portal and suspends its facilities. */
  archiveWorkspace: async (tenantSlug: string, confirmSlug: string): Promise<ArchiveWorkspaceResult> => {
    const response = await apiClient.post<ArchiveWorkspaceResult>(
      `/tenants/${encodeURIComponent(tenantSlug)}/settings/archive`,
      { confirmSlug },
    );
    return response.data;
  },

  /** API keys and webhook endpoints of the workspace. Never contains a key or signing secret. */
  getIntegrations: async (tenantSlug: string): Promise<WorkspaceIntegrations> => {
    const response = await apiClient.get<WorkspaceIntegrations>(`/tenants/${encodeURIComponent(tenantSlug)}/integrations`);
    return response.data;
  },

  /** The plain key is in this response only. */
  createApiKey: async (tenantSlug: string, payload: { name: string; scopes: string[] }): Promise<CreatedApiKey> => {
    const response = await apiClient.post<CreatedApiKey>(`/tenants/${encodeURIComponent(tenantSlug)}/integrations/api-keys`, payload);
    return response.data;
  },

  revokeApiKey: async (tenantSlug: string, apiKeyId: string): Promise<void> => {
    await apiClient.delete(`/tenants/${encodeURIComponent(tenantSlug)}/integrations/api-keys/${apiKeyId}`);
  },

  /** The signing secret is in this response only. */
  createWebhook: async (tenantSlug: string, payload: WebhookInput): Promise<CreatedWebhook> => {
    const response = await apiClient.post<CreatedWebhook>(`/tenants/${encodeURIComponent(tenantSlug)}/integrations/webhooks`, payload);
    return response.data;
  },

  updateWebhook: async (tenantSlug: string, id: string, payload: Required<WebhookInput>): Promise<WorkspaceWebhook> => {
    const response = await apiClient.put<WorkspaceWebhook>(`/tenants/${encodeURIComponent(tenantSlug)}/integrations/webhooks/${id}`, payload);
    return response.data;
  },

  deleteWebhook: async (tenantSlug: string, id: string): Promise<void> => {
    await apiClient.delete(`/tenants/${encodeURIComponent(tenantSlug)}/integrations/webhooks/${id}`);
  },

  /** Queues a webhook.ping; it is delivered by the next delivery run (about a minute). */
  sendTestWebhook: async (tenantSlug: string, id: string): Promise<void> => {
    await apiClient.post(`/tenants/${encodeURIComponent(tenantSlug)}/integrations/webhooks/${id}/test`);
  },

  getWebhookDeliveries: async (tenantSlug: string, id: string): Promise<WebhookDelivery[]> => {
    const response = await apiClient.get<WebhookDelivery[]>(`/tenants/${encodeURIComponent(tenantSlug)}/integrations/webhooks/${id}/deliveries`);
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
