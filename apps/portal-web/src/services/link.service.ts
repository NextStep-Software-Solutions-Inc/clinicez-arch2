import { apiClient } from "@/transport/apiClient";
import type { FacilityKind, FacilityVisibility } from "@/services/facility.service";

export const LINK_SCOPES = ["LabOrder", "Prescription", "Referral", "Result"] as const;
export type LinkScope = (typeof LINK_SCOPES)[number];

export type LinkStatus = "Pending" | "Active" | "Rejected" | "Revoked";
export type LinkDirection = "outgoing" | "incoming";

/** Mirrors `FacilityLinkDto`: a cross-tenant link as the workspace sees it. */
export interface FacilityLink {
  id: string;
  direction: LinkDirection;
  status: LinkStatus;
  scopes: LinkScope[];
  sourceFacilityId: string;
  sourceFacilityName: string;
  sourceCity?: string | null;
  targetFacilityId: string;
  targetFacilityName: string;
  targetCity?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

/** One hit of the hub directory search, with enums normalised to their names. */
export interface DirectoryFacility {
  tenantId: string;
  facilityId: string;
  facilityType: FacilityKind;
  displayName: string;
  city: string | null;
  visibility: FacilityVisibility;
  acceptsExternalRequests: boolean;
  isOwnWorkspace: boolean;
  /** Link between the searching workspace and this facility, if any. */
  linkStatus: LinkStatus | null;
}

export interface DirectoryQuery {
  type?: FacilityKind;
  q?: string;
  city?: string;
}

export interface FacilityVisibilityResult {
  facilityId: string;
  visibility: FacilityVisibility;
  acceptsExternalRequests: boolean;
}

const VISIBILITY_BY_NUMBER: readonly FacilityVisibility[] = ["Private", "Network", "Public"];
const LINK_STATUS_BY_NUMBER: readonly LinkStatus[] = ["Pending", "Active", "Rejected", "Revoked"];

/** The directory endpoint serialises these two enums as numbers; accept the names too in case that changes. */
function enumName<T extends string>(value: number | string | null, names: readonly T[]): T | null {
  if (value === null) return null;
  if (typeof value === "number") return names[value] ?? null;
  return names.find((n) => n.toLowerCase() === value.toLowerCase()) ?? null;
}

interface RawDirectoryFacility extends Omit<DirectoryFacility, "visibility" | "linkStatus"> {
  visibility: number | string;
  linkStatus: number | string | null;
}

function slugPath(tenantSlug: string): string {
  return `/tenants/${encodeURIComponent(tenantSlug)}`;
}

export const linkService = {
  /** Answers 502 when the hub is unreachable. */
  searchDirectory: async (tenantSlug: string, query: DirectoryQuery): Promise<DirectoryFacility[]> => {
    const params = new URLSearchParams();
    if (query.type) params.set("type", query.type);
    if (query.q?.trim()) params.set("q", query.q.trim());
    if (query.city?.trim()) params.set("city", query.city.trim());
    const qs = params.toString();
    const res = await apiClient.get<RawDirectoryFacility[]>(`${slugPath(tenantSlug)}/directory/facilities${qs ? `?${qs}` : ""}`);
    return res.data.map((f) => ({
      ...f,
      visibility: enumName(f.visibility, VISIBILITY_BY_NUMBER) ?? "Private",
      linkStatus: enumName(f.linkStatus ?? null, LINK_STATUS_BY_NUMBER),
    }));
  },

  getLinks: async (tenantSlug: string): Promise<FacilityLink[]> => {
    const res = await apiClient.get<FacilityLink[]>(`${slugPath(tenantSlug)}/links`);
    return res.data;
  },

  /** Active at once when the target accepts external requests, otherwise Pending until the target's admin approves. */
  requestLink: async (
    tenantSlug: string,
    payload: { sourceFacilityId: string; targetFacilityId: string; scopes: LinkScope[] },
  ): Promise<FacilityLink> => {
    const res = await apiClient.post<FacilityLink>(`${slugPath(tenantSlug)}/links`, payload);
    return res.data;
  },

  approveLink: async (tenantSlug: string, linkId: string, scopes?: LinkScope[]): Promise<FacilityLink> => {
    const res = await apiClient.post<FacilityLink>(`${slugPath(tenantSlug)}/links/${encodeURIComponent(linkId)}/approve`, { scopes });
    return res.data;
  },

  rejectLink: async (tenantSlug: string, linkId: string): Promise<FacilityLink> => {
    const res = await apiClient.post<FacilityLink>(`${slugPath(tenantSlug)}/links/${encodeURIComponent(linkId)}/reject`);
    return res.data;
  },

  /** Either side may end a pending or active link, whatever the plan. */
  revokeLink: async (tenantSlug: string, linkId: string): Promise<FacilityLink> => {
    const res = await apiClient.delete<FacilityLink>(`${slugPath(tenantSlug)}/links/${encodeURIComponent(linkId)}`);
    return res.data;
  },

  /** Anything above Private needs `feature.cross_tenant_interop`; accepting external requests needs Public. */
  setVisibility: async (
    tenantSlug: string,
    facilityId: string,
    payload: { visibility: FacilityVisibility; acceptsExternalRequests: boolean },
  ): Promise<FacilityVisibilityResult> => {
    const res = await apiClient.put<FacilityVisibilityResult>(
      `${slugPath(tenantSlug)}/facilities/${encodeURIComponent(facilityId)}/visibility`,
      payload,
    );
    return res.data;
  },
};
