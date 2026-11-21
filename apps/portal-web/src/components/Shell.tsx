"use client";

import SearchPaginatedList from "./SearchPaginatedList";
import ShellCard from "./ShellCard";

export interface BaseShellItem {
  id: string;
  slug?: string;
  tenantSlug?: string;
  facilitySlug?: string;
  title: string;
  description?: string;
  image?: {
    src: string;
    alt?: string;
  };
  count: number;
  privacyPolicyUrl?: string;
  termsUrl?: string;
}

export interface ClinicItem extends BaseShellItem {
  type: "clinic";
}

export interface OrganizationItem extends BaseShellItem {
  type: "organization";
}

export interface HpItem extends BaseShellItem {
  type: "hp";
}

export type ShellItem = ClinicItem | OrganizationItem | HpItem;

interface ShellProps {
  data: ShellItem[];
  type: "clinics" | "organizations" | "hp";
}

const getPatientAppBookingUrl = (facilitySlug: string) => {
  const patientAppBase = (process.env.NEXT_PUBLIC_PATIENT_APP_URL?.trim() || "https://patient.clinicez.ph").replace(/\/+$/, "");
  return `${patientAppBase}/booking?clinic=${encodeURIComponent(facilitySlug)}`;
};

const getButtonConfig = (type: "clinics" | "organizations" | "hp", item: ShellItem) => {
  switch (type) {
    case "clinics": {
      const targetSlug = item.slug || item.id;
      return {
        href: getPatientAppBookingUrl(targetSlug),
        text: "Book Appointment",
      };
    }
    case "organizations": {
      return {
        href: `/clinics?search=${encodeURIComponent(item.title)}`,
        text: "View Network",
      };
    }
    case "hp": {
      const targetFacility = item.facilitySlug || item.slug;
      return {
        href: targetFacility
          ? getPatientAppBookingUrl(targetFacility)
          : "/clinics",
        text: targetFacility ? "Book Appointment" : "Visit Clinic",
      };
    }
    default:
      return {
        href: "/clinics",
        text: "View",
      };
  }
};

const getContentTitle = (type: "clinics" | "organizations" | "hp") => {
  switch (type) {
    case "clinics":
      return "Healthcare Providers";
    case "organizations":
      return "Members";
    case "hp":
      return "Affiliated Clinics";
    default:
      return "Items";
  }
};

export default function Shell({ data, type }: ShellProps) {
  return (
    <SearchPaginatedList
      data={data}
      searchBy={(item, term) =>
        item.title.toLowerCase().includes(term) ||
        (item.description ? item.description.toLowerCase().includes(term) : false)
      }
      render={(item) => (
        <ShellCard
          title={item.title}
          description={item.description}
          image={item.image}
          content={{
            count: item.count,
            title: getContentTitle(type),
          }}
          button={getButtonConfig(type, item)}
          privacyPolicyUrl={item.privacyPolicyUrl || "/privacy"}
          termsUrl={item.termsUrl || "/terms"}
        />
      )}
    />
  );
}
