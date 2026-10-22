import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  ProgressiveClaimCard,
  CLAIM_CARD_BENEFITS,
  type ExtendedRegistrationPass,
} from "../src/components/join/ProgressiveClaimCard";
import {
  MobileAppStoreBadges,
  DEFAULT_APPLE_STORE_URL,
  DEFAULT_GOOGLE_PLAY_URL,
} from "../src/components/join/MobileAppStoreBadges";
import { DigitalPassCard } from "../src/components/join/DigitalPassCard";
import { type DigitalRegistrationPass } from "../src/components/join/types";
import { lightColors } from "../../../packages/design-tokens/src/semantic";
import * as fs from "fs";
import * as path from "path";

const mockFullPass: ExtendedRegistrationPass = {
  trackingId: "trk-adversarial-001",
  registrationPassId: "PASS-ADV-9999",
  queueToken: "Q-777",
  patientCode: "PAT-ADV-2026-001",
  fullName: "Del Rosario, Clara",
  facilityName: "Metro Manila General Hospital",
  facilitySlug: "metro-manila-gh",
  tenantSlug: "metro-health-org",
  estimatedWaitMinutes: 20,
  issuedAt: "2026-10-13T14:00:00.000Z",
  qrDataString: JSON.stringify({
    code: "PAT-ADV-2026-001",
    queue: "Q-777",
    issued: "2026-10-13T14:00:00.000Z",
  }),
  claimToken: "adv.claim.token.jwt.payload",
  expiresAt: "24 hours",
  email: "clara.delrosario@example.ph",
  firstName: "Clara",
  lastName: "Del Rosario",
  dateOfBirth: "1988-11-20",
  memberType: "MM",
  clinicEzId: "CLINICEZ-PHR-ADV-777",
};

describe("Adversarial Challenger Probe 1: 4 Core UX States Verification", () => {
  // -------------------------------------------------------------------------
  // 1.1 Skeleton / Loading State
  // -------------------------------------------------------------------------
  test("1.1.1: Loading skeleton renders with bg-muted, animate-pulse, and structural shapes", () => {
    const html = renderToString(
      <ProgressiveClaimCard pass={mockFullPass} state="loading" />
    );

    expect(html).toContain('data-testid="claim-card-loading"');
    expect(html).toContain('data-section="account-claim-card"');
    expect(html).toContain("animate-pulse");
    expect(html).toContain("bg-muted");
    expect(html).toContain("rounded-2xl");

    // Must not leak interactive CTA buttons or marketing text in loading state
    expect(html).not.toContain("Claim My Patient Account in 1-Click");
    expect(html).not.toContain("Real-Time Queue Alerts");
    expect(html).not.toContain("Try Again");
  });

  test("1.1.2: Loading skeleton gracefully handles completely undefined pass and props", () => {
    expect(() => {
      const html = renderToString(<ProgressiveClaimCard state="loading" />);
      expect(html).toContain('data-testid="claim-card-loading"');
      expect(html).toContain("animate-pulse");
    }).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // 1.2 Empty / Initial Available State
  // -------------------------------------------------------------------------
  test("1.2.1: Empty state displays all 3 core benefits with verbatim titles and icons", () => {
    const html = renderToString(
      <ProgressiveClaimCard pass={mockFullPass} state="empty" />
    );

    expect(html).toContain('data-testid="claim-card-available"');
    expect(html).toContain('data-section="account-claim-card"');

    // 3 core benefits check
    expect(CLAIM_CARD_BENEFITS).toHaveLength(3);

    for (const benefit of CLAIM_CARD_BENEFITS) {
      expect(html).toContain(benefit.description);
      expect(html).toContain(benefit.title.replace("&", "&amp;"));
    }

    // Header and permanent record badge
    expect(html).toContain("Permanent Health Record");
    expect(html).toContain("Claim Your Clinic EZ Patient Account");
    expect(html).toContain("Never fill out clinic intake forms again");
  });

  test("1.2.2: Empty state displays primary CTA 'Claim My Patient Account in 1-Click' and RA 10173 disclaimer", () => {
    const html = renderToString(
      <ProgressiveClaimCard pass={mockFullPass} state="empty" />
    );

    expect(html).toContain("Claim My Patient Account in 1-Click");
    expect(html).toContain("Protected under RA 10173");
    expect(html).toContain(mockFullPass.expiresAt!);
  });

  test("1.2.3: Empty state embeds mobile app store download section", () => {
    const html = renderToString(
      <ProgressiveClaimCard pass={mockFullPass} state="empty" />
    );

    expect(html).toContain("Or manage via Clinic EZ Mobile PHR:");
    expect(html).toContain('data-testid="mobile-app-store-badges"');
    expect(html).toContain("App Store");
    expect(html).toContain("Google Play");
  });

  // -------------------------------------------------------------------------
  // 1.3 Error State & Medical Privacy Notice
  // -------------------------------------------------------------------------
  test("1.3.1: Standard error state displays error message, alert icon, and Try Again button", () => {
    const testError = "Authentication token expired. Please reload your digital pass.";
    const html = renderToString(
      <ProgressiveClaimCard
        pass={mockFullPass}
        state="error"
        errorMessage={testError}
      />
    );

    expect(html).toContain('data-testid="claim-card-error"');
    expect(html).toContain("Unable to Complete Account Claim");
    expect(html).toContain(testError);
    expect(html).toContain("Try Again");
    expect(html).toContain("border-destructive/30");
    expect(html).toContain("bg-destructive/10");
  });

  test("1.3.2: Fallback error message renders when errorMessage is empty", () => {
    const html = renderToString(
      <ProgressiveClaimCard pass={mockFullPass} state="error" errorMessage="" />
    );

    expect(html).toContain('data-testid="claim-card-error"');
    expect(html).toContain("Unable to Complete Account Claim");
    expect(html).toContain("An unexpected network or session error occurred while processing your claim.");
  });

  test("1.3.3: Medical privacy error displays RA 10173 notice in error state", () => {
    const privacyMsg =
      "For medical privacy (RA 10173), medical records of another adult cannot be merged into your personal health account.";
    const html = renderToString(
      <ProgressiveClaimCard
        pass={mockFullPass}
        state="error"
        errorMessage={privacyMsg}
      />
    );

    expect(html).toContain('data-testid="claim-card-error"');
    expect(html).toContain("Medical Privacy Notice (RA 10173)");
    expect(html).toContain("What you can do:");
    expect(html).toContain(privacyMsg);
    expect(html).toContain("Try Again");
  });

  // -------------------------------------------------------------------------
  // 1.4 Active / Success State
  // -------------------------------------------------------------------------
  test("1.4.1: Success state displays linked ClinicEzId, patient name, facility, and live pass badge", () => {
    const html = renderToString(
      <ProgressiveClaimCard pass={mockFullPass} state="success" />
    );

    expect(html).toContain('data-testid="claim-card-success"');
    expect(html).toContain("Patient Account Claimed Successfully!");
    expect(html).toContain("Your clinic registration is now linked to your permanent Clinic EZ PHR.");
    expect(html).toContain(mockFullPass.clinicEzId!);
    expect(html).toContain(mockFullPass.fullName);
    expect(html).toContain(mockFullPass.facilityName);
    expect(html).toContain("Active Live Pass");
    expect(html).toContain('data-testid="mobile-app-store-badges"');
  });

  test("1.4.2: Success state defaults gracefully when clinicEzId is not provided", () => {
    const passWithoutId: ExtendedRegistrationPass = {
      ...mockFullPass,
      clinicEzId: undefined,
      patientCode: "PAT-CODE-FALLBACK",
    };
    const html = renderToString(
      <ProgressiveClaimCard pass={passWithoutId} state="success" />
    );

    expect(html).toContain('data-testid="claim-card-success"');
    expect(html).toContain("PAT-CODE-FALLBACK");
  });
});

describe("Adversarial Challenger Probe 2: Print Media Isolation & Bleed Prevention", () => {
  test("2.1: print:hidden is applied to outermost container in ALL 4 ProgressiveClaimCard states", () => {
    const states = ["loading", "empty", "error", "success"] as const;

    for (const st of states) {
      const html = renderToString(
        <ProgressiveClaimCard pass={mockFullPass} state={st} />
      );

      // Verify that the root card container includes print:hidden
      expect(html).toContain("print:hidden");
      expect(html).toContain('data-section="account-claim-card"');
    }
  });

  test("2.2: MobileAppStoreBadges container is isolated with print:hidden", () => {
    const html = renderToString(<MobileAppStoreBadges />);
    expect(html).toContain("print:hidden");
    expect(html).toContain('data-testid="mobile-app-store-badges"');
  });

  test("2.3: DigitalPassCard isolates claim card and action toolbar with print:hidden while preserving ticket card", () => {
    const html = renderToString(
      <DigitalPassCard pass={mockFullPass} onReset={() => {}} />
    );

    // Queue Ticket Card must NOT be hidden in print mode
    expect(html).toContain('data-section="queue-ticket"');
    expect(html).toContain("Digital Fast-Track Pass");
    expect(html).toContain("print:shadow-none print:border-slate-800");
    expect(html).toContain(mockFullPass.queueToken);
    expect(html).toContain(mockFullPass.facilityName);

    // Progressive claim container must be wrapped in print:hidden
    expect(html).toContain("max-w-lg mx-auto print:hidden");
    expect(html).toContain('data-section="account-claim-card"');

    // Action button toolbar must be wrapped in print:hidden
    expect(html).toContain("flex flex-col sm:flex-row gap-3 justify-center pt-2 max-w-md mx-auto print:hidden");
    expect(html).toContain("Download / Print Pass (PDF)");
    expect(html).toContain("Register Another Patient");
  });

  test("2.4: Zero interactive buttons exist in the printable ticket section", () => {
    const html = renderToString(
      <DigitalPassCard pass={mockFullPass} onReset={() => {}} />
    );

    // In DigitalPassCard, the printable ticket card is marked with data-section="queue-ticket"
    // and followed by data-section="account-claim-card".
    expect(html).toContain('data-section="queue-ticket"');
    const ticketSection = html.substring(
      html.indexOf('data-section="queue-ticket"'),
      html.indexOf('data-section="account-claim-card"')
    );

    expect(ticketSection.length).toBeGreaterThan(0);
    // The printable ticket must strictly be an information-only artifact with no buttons or links
    expect(ticketSection).not.toContain("<button");
    expect(ticketSection).not.toContain("<a ");
    expect(ticketSection).not.toContain("<input");
  });
});

describe("Adversarial Challenger Probe 3: Design Token Compliance & Zero Hex Literals", () => {
  test("3.1: Primary CTA button strictly consumes bg-primary and text-primary-foreground tokens", () => {
    const html = renderToString(
      <ProgressiveClaimCard pass={mockFullPass} state="empty" />
    );

    expect(html).toContain("bg-primary");
    expect(html).toContain("text-primary-foreground");
    expect(html).toContain("hover:bg-primary/90");
    expect(html).toContain("focus:ring-primary");
    expect(html).toContain("shadow-primary/20");

    // Design token check
    expect(lightColors.primary).toBe("#0D6963");
    expect(lightColors.onPrimary).toBe("#FFFFFF");
  });

  test("3.2: Verification that ZERO raw hex color literals exist in touched frontend source files", () => {
    const touchedFiles = [
      "apps/portal-web/src/components/join/ProgressiveClaimCard.tsx",
      "apps/portal-web/src/components/join/DigitalPassCard.tsx",
      "apps/portal-web/src/components/join/JoinClient.tsx",
      "apps/portal-web/src/components/join/MobileAppStoreBadges.tsx",
      "apps/portal-web/src/components/join/types.ts",
    ];

    const hexColorRegex = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

    for (const relPath of touchedFiles) {
      let fullPath = path.resolve(process.cwd(), relPath);
      if (!fs.existsSync(fullPath)) {
        fullPath = path.resolve(process.cwd(), relPath.replace(/^apps\/portal-web\//, ""));
      }
      expect(fs.existsSync(fullPath)).toBe(true);

      const content = fs.readFileSync(fullPath, "utf-8");
      const matches = content.match(hexColorRegex);

      expect(matches).toBeNull();
    }
  });

  test("3.3: Rendered HTML across all 4 states contains zero raw hex color attributes or inline styles", () => {
    const states = ["loading", "empty", "error", "success"] as const;
    const hexColorRegex = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

    for (const st of states) {
      const html = renderToString(
        <ProgressiveClaimCard pass={mockFullPass} state={st} />
      );
      const matches = html.match(hexColorRegex);
      expect(matches).toBeNull();
    }
  });
});
