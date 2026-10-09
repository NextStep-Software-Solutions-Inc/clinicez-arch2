import { z } from "zod";
import { apiClient } from "@/transport/apiClient";
import {
  facilityKindSchema,
  facilityVisibilitySchema,
  linkDirectionSchema,
  linkScopeSchema,
  linkStatusSchema,
  parseWire,
  type FacilityKind,
  type FacilityVisibility,
  type LinkDirection,
  type LinkScope,
  type LinkStatus,
} from "@/lib/wire";

export type { LinkDirection, LinkScope, LinkStatus };

export const LINK_SCOPES = linkScopeSchema.options;

const nullableText = z.string().nullish().transform((v) => v ?? null);

/** Mirrors `FacilityLinkDto`: a cross-tenant link as the workspace sees it. */
const facilityLinkSchema = z.object({
  id: z.string(),
  direction: linkDirectionSchema,
  status: linkStatusSchema,
  scopes: z.array(linkScopeSchema),
  sourceFacilityId: z.string(),
  sourceFacilityName: z.string(),
  sourceCity: nullableText,
  targetFacilityId: z.string(),
  targetFacilityName: z.string(),
  targetCity: nullableText,
  createdAt: z.string(),
  updatedAt: nullableText,
});
export type FacilityLink = z.infer<typeof facilityLinkSchema>;

/** One hit of the hub directory search. */
const directoryFacilitySchema = z.object({
  tenantId: z.string(),
  facilityId: z.string(),
  facilityType: facilityKindSchema,
  displayName: z.string(),
  city: nullableText,
  visibility: facilityVisibilitySchema,
  acceptsExternalRequests: z.boolean(),
  isOwnWorkspace: z.boolean(),
  /** Link between the searching workspace and this facility, if any. */
  linkStatus: linkStatusSchema.nullish().transform((v) => v ?? null),
});
export type DirectoryFacility = z.infer<typeof directoryFacilitySchema>;

const facilityVisibilityResultSchema = z.object({
  facilityId: z.string(),
  visibility: facilityVisibilitySchema,
  acceptsExternalRequests: z.boolean(),
});
export type FacilityVisibilityResult = z.infer<typeof facilityVisibilityResultSchema>;

export interface DirectoryQuery {
  type?: FacilityKind;
  q?: string;
  city?: string;
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
    const res = await apiClient.get<unknown>(`${slugPath(tenantSlug)}/directory/facilities${qs ? `?${qs}` : ""}`);
    return parseWire(z.array(directoryFacilitySchema), res.data, "directory result");
  },

  getLinks: async (tenantSlug: string): Promise<FacilityLink[]> => {
    const res = await apiClient.get<unknown>(`${slugPath(tenantSlug)}/links`);
    return parseWire(z.array(facilityLinkSchema), res.data, "links");
  },

  /** Active at once when the target accepts external requests, otherwise Pending until the target's admin approves. */
  requestLink: async (
    tenantSlug: string,
    payload: { sourceFacilityId: string; targetFacilityId: string; scopes: LinkScope[] },
  ): Promise<FacilityLink> => {
    const res = await apiClient.post<unknown>(`${slugPath(tenantSlug)}/links`, payload);
    return parseWire(facilityLinkSchema, res.data, "link");
  },

  approveLink: async (tenantSlug: string, linkId: string, scopes?: LinkScope[]): Promise<FacilityLink> => {
    const res = await apiClient.post<unknown>(`${slugPath(tenantSlug)}/links/${encodeURIComponent(linkId)}/approve`, { scopes });
    return parseWire(facilityLinkSchema, res.data, "link");
  },

  rejectLink: async (tenantSlug: string, linkId: string): Promise<FacilityLink> => {
    const res = await apiClient.post<unknown>(`${slugPath(tenantSlug)}/links/${encodeURIComponent(linkId)}/reject`);
    return parseWire(facilityLinkSchema, res.data, "link");
  },

  /** Either side may end a pending or active link, whatever the plan. */
  revokeLink: async (tenantSlug: string, linkId: string): Promise<FacilityLink> => {
    const res = await apiClient.delete<unknown>(`${slugPath(tenantSlug)}/links/${encodeURIComponent(linkId)}`);
    return parseWire(facilityLinkSchema, res.data, "link");
  },

  /** Anything above Private needs `feature.cross_tenant_interop`; accepting external requests needs Public. */
  setVisibility: async (
    tenantSlug: string,
    facilityId: string,
    payload: { visibility: FacilityVisibility; acceptsExternalRequests: boolean },
  ): Promise<FacilityVisibilityResult> => {
    const res = await apiClient.put<unknown>(
      `${slugPath(tenantSlug)}/facilities/${encodeURIComponent(facilityId)}/visibility`,
      payload,
    );
    return parseWire(facilityVisibilityResultSchema, res.data, "visibility");
  },
};
