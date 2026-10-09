import { apiClient } from "@/transport/apiClient";
import type { FacilityDeploymentMode } from "@/services/tenant.service";

export type FacilityKind = "Clinic" | "Organization" | "Laboratory" | "Pharmacy";
export type FacilityVisibility = "Private" | "Network" | "Public";

/** Mirrors `FacilityDto`. Visibility fields are always present on responses of the current API. */
export interface WorkspaceFacility {
  id: string;
  name: string;
  facilityType: FacilityKind;
  status: string;
  createdAt: string;
  slug: string;
  consoleUrl?: string | null;
  city?: string | null;
  deploymentMode?: FacilityDeploymentMode;
  consoleBaseUrl?: string | null;
  visibility?: FacilityVisibility;
  acceptsExternalRequests?: boolean;
}

/** One hub client. The secret is shown once; the hub keeps only a hash. */
export interface HubClientSecret {
  clientId: string;
  clientSecret: string;
}

/** Mirrors `HubEdgeCredentials`: everything an on-premise workspace needs to join the hub. Returned once. */
export interface HubEdgeCredentials {
  hubUrl: string;
  upstream: HubClientSecret | null;
  services: Record<string, HubClientSecret>;
}

/** Mirrors `HubRotatedCredentials`: the new secret of a single hub client. Returned once. */
export interface HubRotatedCredentials extends HubClientSecret {
  hubUrl: string;
  service: string;
}

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

export interface CreateFacilityResult {
  success: boolean;
  message: string;
  /** Only for the first on-premise facility of a workspace; never returned again. */
  hubCredentials: HubEdgeCredentials | null;
  /** The facility exists but the hub was unreachable: issue credentials from the facility's rotate action. */
  hubOnboardingPending: boolean;
}

export const facilityService = {
  getFacilities: async (tenantSlug: string): Promise<WorkspaceFacility[]> => {
    const res = await apiClient.get<WorkspaceFacility[]>(`/facilities?tenantSlug=${encodeURIComponent(tenantSlug)}`);
    return res.data;
  },

  createFacility: async (payload: CreateFacilityPayload): Promise<CreateFacilityResult> => {
    const res = await apiClient.post<CreateFacilityResult>("/facilities", payload);
    return {
      ...res.data,
      hubCredentials: res.data.hubCredentials ?? null,
      hubOnboardingPending: res.data.hubOnboardingPending ?? false,
    };
  },

  /** Issues a new secret for one hub client; the old one stops working. The result must never be persisted. */
  rotateHubCredentials: async (
    tenantSlug: string,
    facilityId: string,
    service: HubRotatableService,
  ): Promise<HubRotatedCredentials> => {
    const res = await apiClient.post<{ success: boolean; hubCredentials: HubRotatedCredentials }>(
      `/facilities/${encodeURIComponent(facilityId)}/hub-credentials/rotate?tenantSlug=${encodeURIComponent(tenantSlug)}&service=${encodeURIComponent(service)}`,
    );
    return res.data.hubCredentials;
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
