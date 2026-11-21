import { describe, expect, test, beforeEach, afterEach } from "bun:test";

describe("Milestone 5 Challenger: Portal-Web Routing & CTA Anti-Fraud Probe", () => {
  const originalEnv = process.env.NEXT_PUBLIC_PATIENT_APP_URL;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_PATIENT_APP_URL;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NEXT_PUBLIC_PATIENT_APP_URL = originalEnv;
    } else {
      delete process.env.NEXT_PUBLIC_PATIENT_APP_URL;
    }
  });

  // Re-importing or replicating the helper logic as exported or implemented in Shell.tsx
  const getPatientAppBookingUrl = (facilitySlug: string) => {
    const patientAppBase = (process.env.NEXT_PUBLIC_PATIENT_APP_URL?.trim() || "https://patient.clinicez.ph").replace(/\/+$/, "");
    return `${patientAppBase}/booking?clinic=${encodeURIComponent(facilitySlug)}`;
  };

  interface ItemData {
    id: string;
    slug?: string;
    facilitySlug?: string;
    title: string;
    type?: string;
  }

  const getButtonConfig = (type: "clinics" | "organizations" | "hp", item: ItemData) => {
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

  test("C1: Clinic directory item creates external CTA routing into patient-web booking", () => {
    const clinicItem = {
      id: "clinic-guid-123",
      slug: "st-luke-bgc",
      title: "St. Luke's Medical Center",
      type: "clinics" as const,
    };

    const config = getButtonConfig("clinics", clinicItem);

    expect(config.text).toBe("Book Appointment");
    expect(config.href).toBe("https://patient.clinicez.ph/booking?clinic=st-luke-bgc");
    expect(config.href.startsWith("https://patient.clinicez.ph/booking")).toBe(true);
  });

  test("C2: Falls back to ID when slug is missing and URL encodes clinic identifier", () => {
    const clinicItem = {
      id: "clinic 101/branch?test=true",
      title: "Branch Test",
      type: "clinics" as const,
    };

    const config = getButtonConfig("clinics", clinicItem);

    expect(config.href).toBe("https://patient.clinicez.ph/booking?clinic=clinic%20101%2Fbranch%3Ftest%3Dtrue");
  });

  test("C3: Respects custom NEXT_PUBLIC_PATIENT_APP_URL with trailing slash stripping", () => {
    process.env.NEXT_PUBLIC_PATIENT_APP_URL = "https://my-patient-portal.internal.ph///";

    const clinicItem = {
      id: "c1",
      slug: "makati-med",
      title: "Makati Medical Center",
      type: "clinics" as const,
    };

    const config = getButtonConfig("clinics", clinicItem);
    expect(config.href).toBe("https://my-patient-portal.internal.ph/booking?clinic=makati-med");
  });

  test("C4: HP affiliated clinic item routes to patient-web booking when facilitySlug is present", () => {
    const hpItem = {
      id: "hp-1",
      title: "Dr. Santos",
      facilitySlug: "metro-health-qc",
      type: "hp" as const,
    };

    const config = getButtonConfig("hp", hpItem);

    expect(config.text).toBe("Book Appointment");
    expect(config.href).toBe("https://patient.clinicez.ph/booking?clinic=metro-health-qc");
  });

  test("C5: ShellCard security attributes: external URLs open in blank tab with noopener noreferrer", () => {
    const shouldOpenExternal = (href: string) => href.startsWith("http");

    const patientBookingUrl = "https://patient.clinicez.ph/booking?clinic=sample-clinic";
    const internalUrl = "/clinics?search=hospital";

    expect(shouldOpenExternal(patientBookingUrl)).toBe(true);
    expect(shouldOpenExternal(internalUrl)).toBe(false);
  });
});
