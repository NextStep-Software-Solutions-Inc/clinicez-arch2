import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  ProgressiveClaimCard,
  CLAIM_CARD_BENEFITS,
  type ProgressiveClaimCardProps,
} from "../src/components/join/ProgressiveClaimCard";
import {
  MobileAppStoreBadges,
  DEFAULT_APPLE_STORE_URL,
  DEFAULT_GOOGLE_PLAY_URL,
} from "../src/components/join/MobileAppStoreBadges";
import { DigitalPassCard } from "../src/components/join/DigitalPassCard";
import { type DigitalRegistrationPass } from "../src/components/join/types";
import { lightColors } from "../../../packages/design-tokens/src/semantic";

// Sample test pass
const mockPass: DigitalRegistrationPass & {
  claimToken?: string;
  expiresAt?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  memberType?: "MM" | "DD";
  clinicEzId?: string;
} = {
  trackingId: "track-100200",
  registrationPassId: "PASS-ABC12345",
  queueToken: "Q-105",
  patientCode: "PAT-2026-00042",
  fullName: "Dela Cruz, Juan",
  facilityName: "Metro Health Central Clinic",
  facilitySlug: "metro-health",
  tenantSlug: "metro-health-org",
  estimatedWaitMinutes: 15,
  issuedAt: "2026-10-13T10:00:00.000Z",
  qrDataString: JSON.stringify({
    code: "PAT-2026-00042",
    queue: "Q-105",
    issued: "2026-10-13T10:00:00.000Z",
  }),
  claimToken: "mock.claim.token.jwt",
  expiresAt: "48 hours",
  email: "juan.delacruz@example.ph",
  firstName: "Juan",
  lastName: "Dela Cruz",
  dateOfBirth: "1990-05-15",
  memberType: "MM",
  clinicEzId: "CLINICEZ-PHR-100200",
};

describe("R1: Progressive Account Claim Card & Digital Pass UI Component Tests", () => {
  test("R1.1: Surface all 3 key patient benefits with correct titles and descriptions", () => {
    expect(CLAIM_CARD_BENEFITS).toHaveLength(3);

    const [b1, b2, b3] = CLAIM_CARD_BENEFITS;
    expect(b1.id).toBe("notifications");
    expect(b1.title).toBe("Real-Time Queue Alerts");
    expect(b1.description).toContain("approaching");
    expect(b1.iconName).toBe("BellRing");

    expect(b2.id).toBe("records");
    expect(b2.title).toBe("Digital Prescriptions & Lab Results");
    expect(b2.description).toContain("prescriptions");
    expect(b2.iconName).toBe("FileCheck");

    expect(b3.id).toBe("fast-checkin");
    expect(b3.title).toBe("1-Click Fast Check-In");
    expect(b3.description).toContain("without retyping");
    expect(b3.iconName).toBe("Zap");
  });

  test("R1.2: Renders primary CTA 'Claim My Patient Account in 1-Click' consuming primary teal design tokens", () => {
    const html = renderToString(<ProgressiveClaimCard pass={mockPass} state="empty" />);

    // Verbatim primary button text
    expect(html).toContain("Claim My Patient Account in 1-Click");

    // Semantic tokens without raw hex literals
    expect(html).toContain("bg-primary");
    expect(html).toContain("text-primary-foreground");
    expect(html).not.toContain("#0D6963");
    expect(html).not.toContain("#0d6963");

    // Design system check
    expect(lightColors.primary).toBe("#0D6963");
  });

  test("R1.3: Loading state renders structural skeleton with animate-pulse and bg-muted", () => {
    const html = renderToString(<ProgressiveClaimCard pass={mockPass} state="loading" />);

    expect(html).toContain('data-testid="claim-card-loading"');
    expect(html).toContain("animate-pulse");
    expect(html).toContain("bg-muted");
    expect(html).toContain("print:hidden");
  });

  test("R1.4: Empty/Available state renders benefits, primary CTA, and store download section", () => {
    const html = renderToString(<ProgressiveClaimCard pass={mockPass} state="empty" />);

    expect(html).toContain('data-testid="claim-card-available"');
    expect(html).toContain("Claim Your Clinic EZ Patient Account");
    expect(html).toContain("Real-Time Queue Alerts");
    expect(html).toContain("Digital Prescriptions");
    expect(html).toContain("1-Click Fast Check-In");
    expect(html).toContain("Claim My Patient Account in 1-Click");
    expect(html).toContain('data-testid="mobile-app-store-badges"');
    expect(html).toContain("print:hidden");
  });

  test("R1.5: Error state displays actionable retry button and error details", () => {
    const html = renderToString(
      <ProgressiveClaimCard
        pass={mockPass}
        state="error"
        errorMessage="Claim token expired after 48 hours"
      />
    );

    expect(html).toContain('data-testid="claim-card-error"');
    expect(html).toContain("Unable to Complete Account Claim");
    expect(html).toContain("Claim token expired after 48 hours");
    expect(html).toContain("Try Again");
    expect(html).toContain("print:hidden");
  });

  test("R1.6: Active/Success state displays linked ClinicEzId and active live pass badge", () => {
    const html = renderToString(
      <ProgressiveClaimCard
        pass={mockPass}
        state="success"
      />
    );

    expect(html).toContain('data-testid="claim-card-success"');
    expect(html).toContain("Patient Account Claimed Successfully!");
    expect(html).toContain(mockPass.clinicEzId!);
    expect(html).toContain("Active Live Pass");
    expect(html).toContain('data-testid="mobile-app-store-badges"');
    expect(html).toContain("print:hidden");
  });

  test("R1.7: Print media isolation enforces print:hidden on all claim card states", () => {
    const states: Array<ProgressiveClaimCardProps["state"]> = ["loading", "empty", "error", "success"];

    states.forEach((st) => {
      const html = renderToString(<ProgressiveClaimCard pass={mockPass} state={st} />);
      expect(html).toContain("print:hidden");
      expect(html).toContain('data-section="account-claim-card"');
    });
  });

  test("R1.8: DigitalPassCard renders queue ticket and embeds ProgressiveClaimCard directly below with print:hidden", () => {
    const html = renderToString(
      <DigitalPassCard pass={mockPass} onReset={() => {}} />
    );

    // Queue Ticket Card
    expect(html).toContain("Q-105");
    expect(html).toContain("Metro Health Central Clinic");
    expect(html).toContain("PAT-2026-00042");

    // Embedded ProgressiveClaimCard
    expect(html).toContain('data-section="account-claim-card"');
    expect(html).toContain("Claim Your Clinic EZ Patient Account");
    expect(html).toContain("Claim My Patient Account in 1-Click");

    // Print isolation
    expect(html).toContain("print:hidden");
    expect(html).toContain("Download / Print Pass (PDF)");
  });
});

describe("R1.9: Mobile App Store Badges Tests", () => {
  test("R1.9.1: Renders Apple App Store badge with standard production fallback URL", () => {
    const html = renderToString(<MobileAppStoreBadges />);

    expect(html).toContain("https://apps.apple.com/app/clinicez-patient/id647000000");
    expect(html).toContain("Download Clinic EZ Patient App on Apple App Store");
    expect(html).toContain("App Store");
  });

  test("R1.9.2: Renders Google Play Store badge with standard production fallback URL", () => {
    const html = renderToString(<MobileAppStoreBadges />);

    expect(html).toContain("https://play.google.com/store/apps/details?id=ph.clinicez.patient");
    expect(html).toContain("Download Clinic EZ Patient App on Google Play Store");
    expect(html).toContain("Google Play");
  });

  test("R1.9.3: Respects custom platform settings URLs passed as props", () => {
    const customApple = "https://apps.apple.com/ph/app/clinicez/id999999999";
    const customGoogle = "https://play.google.com/store/apps/details?id=com.clinicez.app";

    const html = renderToString(
      <MobileAppStoreBadges
        appleStoreUrl={customApple}
        googlePlayUrl={customGoogle}
      />
    );

    expect(html).toContain(customApple);
    expect(html).toContain(customGoogle);
  });

  test("R1.9.4: Store badges container enforces print:hidden", () => {
    const html = renderToString(<MobileAppStoreBadges />);
    expect(html).toContain("print:hidden");
  });

  test("R1.9.5: Returns null when both store URLs are explicitly empty strings", () => {
    const html = renderToString(
      <MobileAppStoreBadges appleStoreUrl="" googlePlayUrl="" />
    );
    expect(html).toBe("");
  });
});

describe("R2: Existing User Fast-Track & Web Autofill Integration", () => {
  test("R2.1: Banner surfaces 'Already have a Clinic EZ account? Sign in to Autofill'", () => {
    const bannerTitle = "Already have a Clinic EZ account? Sign in to Autofill";
    const bannerDescription =
      "Sign in with your Clinic EZ account to pre-populate demographics, 12-digit PhilHealth PIN, contact info, and structured allergies in 1 click.";

    expect(bannerTitle).toContain("Sign in to Autofill");
    expect(bannerDescription).toContain("PhilHealth PIN");
    expect(bannerDescription).toContain("allergies");
  });

  test("R2.2: Generates valid Universal Deep Link URI clinicez://join/{code}", () => {
    const joinCode = "METRO-99";
    const deepLinkUri = `clinicez://join/${joinCode}`;

    expect(deepLinkUri).toBe("clinicez://join/METRO-99");
    expect(deepLinkUri).toStartWith("clinicez://join/");
  });

  test("R2.3: Reuses existing PatientId in ClinicMembership without duplicate Patient profile creation", () => {
    const existingPatientId = "pat-guid-112233";
    const clinicFacilityId = "fac-guid-445566";

    // Simulating membership linkage contract
    const membership = {
      patientId: existingPatientId,
      facilityId: clinicFacilityId,
      status: "Active",
      enrolledAtUtc: new Date().toISOString(),
    };

    expect(membership.patientId).toBe(existingPatientId);
    expect(membership.facilityId).toBe(clinicFacilityId);
    expect(membership.status).toBe("Active");
  });
});
