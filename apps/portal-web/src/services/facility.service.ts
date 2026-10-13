import { z } from "zod";
import { apiClient } from "@/transport/apiClient";
import {
  deploymentModeSchema,
  facilityKindSchema,
  facilityStatusSchema,
  facilityVisibilitySchema,
  hubEdgeCredentialsSchema,
  hubRotatedCredentialsSchema,
  parseWire,
  type FacilityDeploymentMode,
  type FacilityKind,
  type FacilityVisibility,
  type HubClientCredentials,
  type HubEdgeCredentials,
  type HubRotatedCredentials,
} from "@/lib/wire";

export type { FacilityKind, FacilityVisibility };

const optionalText = z.string().nullish().transform((v) => v ?? null);

/** Mirrors `FacilityDto` (the fields the portal reads). */
const workspaceFacilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  facilityType: facilityKindSchema,
  status: facilityStatusSchema,
  createdAt: z.string(),
  slug: z.string(),
  consoleUrl: optionalText,
  classification: optionalText,
  licenseToOperate: optionalText,
  philHealthAccreditationNumber: optionalText,
  taxIdentificationNumber: optionalText,
  operatingHours: optionalText,
  region: optionalText,
  province: optionalText,
  city: optionalText,
  barangay: optionalText,
  zipCode: optionalText,
  streetAddress: optionalText,
  contactNumber: optionalText,
  contactEmail: optionalText,
  deploymentMode: deploymentModeSchema,
  consoleBaseUrl: optionalText,
  visibility: facilityVisibilitySchema,
  acceptsExternalRequests: z.boolean(),
  branchId: optionalText,
});
export type WorkspaceFacility = z.infer<typeof workspaceFacilitySchema>;

export type { HubClientCredentials, HubEdgeCredentials, HubRotatedCredentials };

/** Services whose hub client can be rotated (`cell` is the local hub's upstream client). */
export const HUB_ROTATABLE_SERVICES = ["cell", "clinic", "laboratory", "pharmacy", "organization", "billing"] as const;
export type HubRotatableService = (typeof HUB_ROTATABLE_SERVICES)[number];

export interface CreateFacilityPayload {
  tenantId: string;
  facilityType: FacilityKind;
  name: string;
  slug?: string;
  classification?: string;
  licenseToOperate?: string;
  philHealthAccreditationNumber?: string;
  taxIdentificationNumber?: string;
  operatingHours?: string;
  region?: string;
  province?: string;
  city?: string;
  barangay?: string;
  zipCode?: string;
  streetAddress?: string;
  contactNumber?: string;
  contactEmail?: string;
  branchId?: string;
  deploymentMode?: FacilityDeploymentMode;
  /** Required (https) when `deploymentMode` is `OnPremise`. */
  consoleBaseUrl?: string;
}

const createFacilityResultSchema = z.object({
  success: z.boolean(),
  message: z.string().nullish().transform((v) => v ?? ""),
  facilityId: z.string().nullish().transform((v) => v ?? null),
  hubCredentials: hubEdgeCredentialsSchema.nullish().transform((v) => v ?? null),
  hubOnboardingPending: z.boolean().nullish().transform((v) => v ?? false),
});

export interface CreateFacilityResult {
  success: boolean;
  message: string;
  facilityId: string | null;
  /** Only for the first on-premise facility of a workspace; never returned again. Null for cloud facilities and later on-premise ones. */
  hubCredentials: HubEdgeCredentials | null;
  /** The facility exists but the hub was unreachable: issue credentials from the facility's rotate action. */
  hubOnboardingPending: boolean;
}

const rotateHubCredentialsResultSchema = z.object({
  success: z.boolean(),
  hubCredentials: hubRotatedCredentialsSchema,
});

export const facilityService = {
  getFacilities: async (tenantSlug: string): Promise<WorkspaceFacility[]> => {
    const res = await apiClient.get<unknown>(`/facilities?tenantSlug=${encodeURIComponent(tenantSlug)}`);
    return parseWire(z.array(workspaceFacilitySchema), res.data, "facility list");
  },

  getPublicClinicFacilities: async (tenantSlug: string): Promise<WorkspaceFacility[]> => {
    const res = await apiClient.get<unknown>(`/public/join/${encodeURIComponent(tenantSlug)}/facilities`);
    return parseWire(z.array(workspaceFacilitySchema), res.data, "public clinic facilities");
  },

  createFacility: async (payload: CreateFacilityPayload): Promise<CreateFacilityResult> => {
    const res = await apiClient.post<unknown>("/facilities", payload);
    return parseWire(createFacilityResultSchema, res.data, "facility");
  },

  /** Issues a new secret and signing key for one hub client; the old ones stop working. The result must never be persisted. */
  rotateHubCredentials: async (
    tenantSlug: string,
    facilityId: string,
    service: HubRotatableService,
  ): Promise<HubRotatedCredentials> => {
    const res = await apiClient.post<unknown>(
      `/facilities/${encodeURIComponent(facilityId)}/hub-credentials/rotate?tenantSlug=${encodeURIComponent(tenantSlug)}&service=${encodeURIComponent(service)}`,
    );
    return parseWire(rotateHubCredentialsResultSchema, res.data, "hub credentials").hubCredentials;
  },
};

/** Hub client a facility of this type runs as. */
export function hubServiceFor(type: FacilityKind): HubRotatableService {
  switch (type) {
    case "Clinic":
      return "clinic";
    case "Laboratory":
      return "laboratory";
    case "Pharmacy":
      return "pharmacy";
    case "Organization":
      return "organization";
  }
}
