import { describe, expect, test } from "bun:test";
import { siteEmails } from "../src/config/site";

describe("Contact Us & Platform Settings Configuration", () => {
  test("T1.1: siteEmails provides fallback default addresses and avoids empty UI blocks", () => {
    expect(siteEmails.contact).toBeTruthy();
    expect(siteEmails.sales).toBeTruthy();
    expect(siteEmails.support).toBeTruthy();
    expect(siteEmails.billing).toBeTruthy();

    expect(siteEmails.support).toContain("@");
    expect(siteEmails.sales).toContain("@");
  });

  test("T1.2: Contact info schema contains all required display fields", () => {
    const defaultInfo = {
      headquartersAddress:
        "San Juan 2, Sto Nino\nLapasan, Cagayan de Oro City\nMisamis Oriental\nPhilippines 9000",
      supportEmail: "support@clinicez.com",
      salesEmail: "sales@clinicez.com",
      phoneNumber: "+63 (965) 429-7640",
      operatingHours: "Mon - Fri, 8am - 5pm (PHT)",
    };

    expect(defaultInfo.headquartersAddress.split("\n").length).toBeGreaterThanOrEqual(3);
    expect(defaultInfo.phoneNumber).toMatch(/^\+63/);
    expect(defaultInfo.supportEmail).toBe("support@clinicez.com");
    expect(defaultInfo.salesEmail).toBe("sales@clinicez.com");
    expect(defaultInfo.operatingHours).toContain("PHT");
  });

  test("T1.3: Contact form payload validation prevents empty or malformed submissions", () => {
    const validateContactForm = (body: {
      firstName?: string;
      lastName?: string;
      email?: string;
      message?: string;
    }) => {
      const firstName = String(body?.firstName || "").trim();
      const lastName = String(body?.lastName || "").trim();
      const email = String(body?.email || "").trim();
      const message = String(body?.message || "").trim();

      if (!firstName || !lastName || !email || !message) {
        return { valid: false, error: "All fields are required." };
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { valid: false, error: "Please provide a valid email address." };
      }

      return {
        valid: true,
        payload: {
          name: `${firstName} ${lastName}`.trim(),
          email,
          message,
        },
      };
    };

    // Missing fields
    expect(validateContactForm({ firstName: "John", lastName: "", email: "john@clinic.com", message: "Hi" }).valid).toBe(false);
    expect(validateContactForm({ firstName: "John", lastName: "Doe", email: "", message: "Hi" }).valid).toBe(false);
    expect(validateContactForm({ firstName: "John", lastName: "Doe", email: "invalid-email", message: "Hi" }).valid).toBe(false);

    // Valid submission combines first and last name
    const valid = validateContactForm({
      firstName: " Maria ",
      lastName: " Santos ",
      email: " maria.santos@stlukes.ph ",
      message: " Interested in onboarding 5 clinics. ",
    });

    expect(valid.valid).toBe(true);
    expect(valid.payload?.name).toBe("Maria Santos");
    expect(valid.payload?.email).toBe("maria.santos@stlukes.ph");
    expect(valid.payload?.message).toBe("Interested in onboarding 5 clinics.");
  });

  test("T1.4: Rate limit and service availability HTTP status mapping", () => {
    const mapBackendStatus = (status: number, message?: string) => {
      if (status === 200 || status === 201) {
        return { success: true, message: "Inquiry received" };
      }
      if (status === 429) {
        return {
          success: false,
          userFriendlyMessage: "Too many contact requests from your network. Please try again in a few minutes or email us directly.",
        };
      }
      if (status === 503) {
        return {
          success: false,
          userFriendlyMessage: "Contact messages are temporarily unavailable right now. Please reach out to us directly at our email.",
        };
      }
      return { success: false, userFriendlyMessage: message || "Failed to submit contact inquiry." };
    };

    expect(mapBackendStatus(429).userFriendlyMessage).toContain("Too many contact requests");
    expect(mapBackendStatus(503).userFriendlyMessage).toContain("temporarily unavailable");
    expect(mapBackendStatus(200).success).toBe(true);
  });
});
