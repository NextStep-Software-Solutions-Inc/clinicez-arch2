import { joinApiUrl } from "@shared/safe";
import type { ClinicItem, OrganizationItem, HpItem } from "@/components/Shell";

export interface PublicDirectoryClinicDto {
  id: string;
  slug: string;
  tenantSlug: string;
  name: string;
  description: string;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  region?: string | null;
  contactNumber?: string | null;
  contactEmail?: string | null;
  operatingHours?: string | null;
  classification?: string | null;
  isPhilHealthAccredited: boolean;
  providerCount: number;
  privacyPolicyUrl: string;
  termsUrl: string;
}

export interface PublicDirectoryOrganizationDto {
  id: string;
  slug: string;
  tenantSlug: string;
  name: string;
  description: string;
  city?: string | null;
  province?: string | null;
  memberCount: number;
  facilityCount: number;
  privacyPolicyUrl: string;
  termsUrl: string;
}

export interface PublicDirectoryProviderDto {
  id: string;
  name: string;
  role: string;
  specialty: string;
  facilityId?: string | null;
  facilityName?: string | null;
  facilitySlug?: string | null;
  tenantSlug: string;
  city?: string | null;
  facilityCount: number;
  privacyPolicyUrl: string;
  termsUrl: string;
}

function resolvePortalApiUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.PORTAL_API_URL ||
    "http://localhost:5238/api/v1"
  ).replace(/\/+$/, "");
}

export const directoryService = {
  getClinics: async (q?: string, city?: string): Promise<ClinicItem[]> => {
    const params = new URLSearchParams();
    if (q?.trim()) params.set("q", q.trim());
    if (city?.trim()) params.set("city", city.trim());
    const qs = params.toString() ? `?${params.toString()}` : "";
    const targetUrl = joinApiUrl(resolvePortalApiUrl(), `/public/directory/clinics${qs}`);

    try {
      const res = await fetch(targetUrl, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return [];
      const json = await res.json().catch(() => ({}));
      const items: PublicDirectoryClinicDto[] = Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json)
          ? json
          : [];

      return items.map((c) => ({
        id: c.id,
        slug: c.slug,
        tenantSlug: c.tenantSlug,
        type: "clinic" as const,
        title: c.name,
        description: c.description || c.address || "Accredited Outpatient Clinic",
        image: {
          src: "/placeholder.svg",
          alt: c.name,
        },
        count: c.providerCount ?? 1,
        privacyPolicyUrl: c.privacyPolicyUrl || "/privacy",
        termsUrl: c.termsUrl || "/terms",
      }));
    } catch {
      return [];
    }
  },

  getOrganizations: async (q?: string, city?: string): Promise<OrganizationItem[]> => {
    const params = new URLSearchParams();
    if (q?.trim()) params.set("q", q.trim());
    if (city?.trim()) params.set("city", city.trim());
    const qs = params.toString() ? `?${params.toString()}` : "";
    const targetUrl = joinApiUrl(resolvePortalApiUrl(), `/public/directory/organizations${qs}`);

    try {
      const res = await fetch(targetUrl, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return [];
      const json = await res.json().catch(() => ({}));
      const items: PublicDirectoryOrganizationDto[] = Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json)
          ? json
          : [];

      return items.map((o) => ({
        id: o.id,
        slug: o.slug,
        tenantSlug: o.tenantSlug,
        type: "organization" as const,
        title: o.name,
        description: o.description,
        image: {
          src: "/placeholder.svg",
          alt: o.name,
        },
        count: o.memberCount ?? o.facilityCount ?? 1,
        privacyPolicyUrl: o.privacyPolicyUrl || "/privacy",
        termsUrl: o.termsUrl || "/terms",
      }));
    } catch {
      return [];
    }
  },

  getProviders: async (q?: string, facilitySlug?: string): Promise<HpItem[]> => {
    const params = new URLSearchParams();
    if (q?.trim()) params.set("q", q.trim());
    if (facilitySlug?.trim()) params.set("facilitySlug", facilitySlug.trim());
    const qs = params.toString() ? `?${params.toString()}` : "";
    const targetUrl = joinApiUrl(resolvePortalApiUrl(), `/public/directory/providers${qs}`);

    try {
      const res = await fetch(targetUrl, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return [];
      const json = await res.json().catch(() => ({}));
      const items: PublicDirectoryProviderDto[] = Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json)
          ? json
          : [];

      return items.map((p) => ({
        id: p.id,
        slug: p.facilitySlug || p.tenantSlug,
        tenantSlug: p.tenantSlug,
        facilitySlug: p.facilitySlug || undefined,
        type: "hp" as const,
        title: p.name,
        description: p.specialty || p.role,
        image: {
          src: "/placeholder.svg",
          alt: p.name,
        },
        count: p.facilityCount ?? 1,
        privacyPolicyUrl: p.privacyPolicyUrl || "/privacy",
        termsUrl: p.termsUrl || "/terms",
      }));
    } catch {
      return [];
    }
  },
};
