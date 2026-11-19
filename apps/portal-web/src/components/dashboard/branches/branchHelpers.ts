import {
  IconBuilding,
  IconHospital,
  IconPill,
  IconTestPipe,
} from "@tabler/icons-react";
import { APP_SUBDOMAINS } from "@/config/site";
import type {
  BranchDto,
  ConfigureBranchPhilHealthPayload,
  TestBranchPhilHealthPayload,
} from "@/services/branch.service";
import type { WorkspaceFacility } from "@/services/facility.service";
import { getConsoleBaseDomain } from "@/utils/domain";

export const DASHBOARD_PORTS: Record<string, number> = {
  Clinic: 8081,
  Laboratory: 8082,
  Pharmacy: 8083,
  Organization: 8084,
};

export interface FacilitySlotDefinition {
  type: "Clinic" | "Laboratory" | "Pharmacy" | "Organization";
  key: "clinic" | "laboratory" | "pharmacy" | "organization";
  label: string;
  shortLabel: string;
  description: string;
  icon: typeof IconHospital;
  color: string;
  bg: string;
  border: string;
}

export const FACILITY_SLOTS: FacilitySlotDefinition[] = [
  {
    type: "Clinic",
    key: "clinic",
    label: "Clinic",
    shortLabel: "Clinic",
    description: "Outpatient consultations, EHR & medical records",
    icon: IconHospital,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10 dark:bg-blue-500/20",
    border: "border-blue-200 dark:border-blue-800",
  },
  {
    type: "Laboratory",
    key: "laboratory",
    label: "Laboratory",
    shortLabel: "Lab",
    description: "Diagnostic orders, specimen tracking & LIS",
    icon: IconTestPipe,
    color: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-500/10 dark:bg-purple-500/20",
    border: "border-purple-200 dark:border-purple-800",
  },
  {
    type: "Pharmacy",
    key: "pharmacy",
    label: "Pharmacy",
    shortLabel: "Pharmacy",
    description: "Drug dispensing, inventory & prescription fulfillment",
    icon: IconPill,
    color: "text-success",
    bg: "bg-success/10",
    border: "border-success/25",
  },
  {
    type: "Organization",
    key: "organization",
    label: "Organization",
    shortLabel: "Org",
    description: "Hospital networks, HMOs & provider administration",
    icon: IconBuilding,
    color: "text-warning",
    bg: "bg-warning/10",
    border: "border-warning/25",
  },
];

export type BranchFilterMode = "all" | "active" | "accredited" | "unconfigured";

export function getFacilitySlot(facilityType: string): FacilitySlotDefinition {
  const normalized = facilityType.trim().toLowerCase();
  return FACILITY_SLOTS.find((s) => s.key === normalized) ?? FACILITY_SLOTS[0];
}

export function resolveConsoleUrl(
  fac: Pick<WorkspaceFacility, "consoleUrl" | "facilityType" | "slug">,
  tenantSlug: string,
): string | null {
  if (fac.consoleUrl) return fac.consoleUrl;
  const baseDomain = getConsoleBaseDomain();
  if (baseDomain) {
    const sub = APP_SUBDOMAINS[fac.facilityType] || "clinic";
    const targetSlug = fac.slug || tenantSlug;
    return `https://${targetSlug}.${sub}.${baseDomain}`;
  }
  const isLocal =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  if (isLocal) {
    const port = DASHBOARD_PORTS[fac.facilityType] || 8081;
    return `http://localhost:${port}`;
  }
  return null;
}

export function formatBranchShortAddress(
  branch: Pick<BranchDto, "streetAddress" | "barangay" | "city" | "province">,
): string {
  const parts = [branch.streetAddress, branch.barangay, branch.city, branch.province]
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(", ") : "No street address configured";
}

export function formatBranchFullAddress(
  branch: Pick<BranchDto, "streetAddress" | "barangay" | "city" | "province" | "region" | "zipCode">,
): string {
  const main = [branch.streetAddress, branch.barangay, branch.city, branch.province, branch.region]
    .map((p) => p?.trim())
    .filter((p): p is string => Boolean(p))
    .join(", ");
  if (!main) return "No physical address configured";
  return branch.zipCode?.trim() ? `${main} ${branch.zipCode.trim()}` : main;
}

export function sanitizeBranchContact(
  branch: Pick<BranchDto, "contactNumber" | "contactEmail">,
): { phone: string | null; email: string | null } {
  const rawPhone = branch.contactNumber?.trim();
  const rawEmail = branch.contactEmail?.trim();
  const phone = rawPhone ? rawPhone.replace(/^tel:\s*/i, "").trim() || null : null;
  const email = rawEmail ? rawEmail.replace(/^email:\s*/i, "").trim() || null : null;
  return { phone, email };
}

export function buildBranchFacilities(
  branch: BranchDto,
  allFacilities: WorkspaceFacility[],
): WorkspaceFacility[] {
  const byId = new Map<string, WorkspaceFacility>();
  const orderedIds: string[] = [];

  for (const bf of branch.facilities ?? []) {
    const full = allFacilities.find((f) => f.id === bf.id);
    const hydrated: WorkspaceFacility = full ?? {
      id: bf.id,
      name: bf.name,
      facilityType: bf.facilityType,
      status: bf.status,
      slug: bf.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      consoleUrl: null,
      createdAt: "",
      classification: null,
      licenseToOperate: null,
      ltoExpiryDate: null,
      philHealthAccreditationNumber: null,
      taxIdentificationNumber: null,
      operatingHours: null,
      region: branch.region ?? null,
      province: branch.province ?? null,
      city: branch.city ?? null,
      barangay: branch.barangay ?? null,
      zipCode: branch.zipCode ?? null,
      streetAddress: branch.streetAddress ?? null,
      contactNumber: branch.contactNumber ?? null,
      contactEmail: branch.contactEmail ?? null,
      deploymentMode: "SharedCloud",
      consoleBaseUrl: null,
      visibility: "Private",
      acceptsExternalRequests: false,
      branchId: branch.id,
      isPatientDiscoveryEligible: false,
      platformVerificationStatus: "Unverified",
      rejectionReason: null,
      ltoEvidenceObjectKey: null,
      verifiedAtUtc: null,
    };
    byId.set(hydrated.id, hydrated);
    orderedIds.push(hydrated.id);
  }

  for (const f of allFacilities) {
    if (f.branchId === branch.id && !byId.has(f.id)) {
      byId.set(f.id, f);
      orderedIds.push(f.id);
    }
  }

  return orderedIds.map((id) => byId.get(id)!);
}

export function getAvailableSlots(
  branchFacilities: Array<Pick<WorkspaceFacility, "facilityType">>,
): FacilitySlotDefinition[] {
  const occupied = new Set(branchFacilities.map((f) => f.facilityType.toLowerCase()));
  return FACILITY_SLOTS.filter((slot) => !occupied.has(slot.key));
}

export function getLinkableUnassignedFacilities(
  unassignedFacilities: WorkspaceFacility[],
  branchFacilities: Array<Pick<WorkspaceFacility, "facilityType">>,
): WorkspaceFacility[] {
  const occupied = new Set(branchFacilities.map((f) => f.facilityType.toLowerCase()));
  return unassignedFacilities.filter((f) => !occupied.has(f.facilityType.toLowerCase()));
}

export function filterBranches(
  branches: BranchDto[],
  search: string,
  filterMode: BranchFilterMode = "all",
): BranchDto[] {
  const q = search.trim().toLowerCase();
  return branches.filter((b) => {
    if (filterMode === "active" && !b.isActive) return false;
    if (filterMode === "accredited" && !b.isPhilHealthAccredited) return false;
    if (filterMode === "unconfigured" && b.isPhilHealthAccredited) return false;

    if (!q) return true;
    const facilityMatch = (b.facilities ?? []).some((f) =>
      f.name.toLowerCase().includes(q) || f.facilityType.toLowerCase().includes(q),
    );
    return (
      b.name.toLowerCase().includes(q) ||
      Boolean(b.code && b.code.toLowerCase().includes(q)) ||
      Boolean(b.city && b.city.toLowerCase().includes(q)) ||
      Boolean(b.province && b.province.toLowerCase().includes(q)) ||
      Boolean(b.philHealthPmccNumber && b.philHealthPmccNumber.toLowerCase().includes(q)) ||
      Boolean(b.philHealthAccreditationNumber && b.philHealthAccreditationNumber.toLowerCase().includes(q)) ||
      facilityMatch
    );
  });
}

export function resolvePhilHealthPlaceholders(branch: Partial<BranchDto> | null): {
  secretKey: string;
  cipherKey: string;
} {
  return {
    secretKey: branch?.hasSecretKey
      ? "•••••••••••••••• (Leave blank to keep existing)"
      : "Enter PCAPI Secret Key",
    cipherKey: branch?.hasCipherKey
      ? "•••••••••••••••• (Leave blank to keep existing)"
      : "Enter AES-256-CBC Cipher Key",
  };
}

export interface PhilHealthFormInputs {
  accreditationNumber: string;
  pmccNumber: string;
  softwareCertificateId: string;
  secretKey: string;
  cipherKey: string;
  baseUrl: string;
}

export function buildPhilHealthTestPayload(
  inputs: PhilHealthFormInputs,
): TestBranchPhilHealthPayload {
  return {
    accreditationNumber: inputs.accreditationNumber.trim() || undefined,
    pmccNumber: inputs.pmccNumber.trim() || undefined,
    softwareCertificateId: inputs.softwareCertificateId.trim() || undefined,
    secretKey: inputs.secretKey.trim() || undefined,
    cipherKey: inputs.cipherKey.trim() || undefined,
    baseUrl: inputs.baseUrl.trim() || undefined,
  };
}

export function buildPhilHealthConfigurePayload(
  inputs: PhilHealthFormInputs,
): ConfigureBranchPhilHealthPayload {
  return {
    accreditationNumber: inputs.accreditationNumber.trim(),
    pmccNumber: inputs.pmccNumber.trim() || undefined,
    softwareCertificateId: inputs.softwareCertificateId.trim() || undefined,
    secretKey: inputs.secretKey.trim() || undefined,
    cipherKey: inputs.cipherKey.trim() || undefined,
    baseUrl: inputs.baseUrl.trim() || undefined,
    isPhilHealthAccredited: true,
  };
}
