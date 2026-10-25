"use client";

import React, { useState } from "react";
import {
  BellRing,
  FileCheck,
  Zap,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Sparkles,
  Lock,
  ShieldAlert,
  User,
  ArrowRight,
} from "lucide-react";
import { useUser, useAuth, SignInButton } from "@clerk/nextjs";
import { type DigitalRegistrationPass } from "./types";
import { MobileAppStoreBadges } from "./MobileAppStoreBadges";
import { getPatientApiUrl } from "@/utils/domain";

export interface ProgressiveClaimBenefit {
  id: string;
  title: string;
  description: string;
  iconName: string;
}

export const CLAIM_CARD_BENEFITS: ProgressiveClaimBenefit[] = [
  {
    id: "notifications",
    title: "Real-Time Queue Alerts",
    description:
      "Get notified when your turn is approaching and when called to the consultation room.",
    iconName: "BellRing",
  },
  {
    id: "records",
    title: "Digital Prescriptions & Lab Results",
    description:
      "Access official diagnostic reports, clinical SOAP notes, and electronic prescriptions instantly.",
    iconName: "FileCheck",
  },
  {
    id: "fast-checkin",
    title: "1-Click Fast Check-In",
    description:
      "Skip the intake queue at any Clinic EZ partner clinic nationwide without retyping your info.",
    iconName: "Zap",
  },
];

export interface ExtendedRegistrationPass extends DigitalRegistrationPass {
  claimToken?: string;
  expiresAt?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  memberType?: "MM" | "DD";
  claimedAt?: string;
  clinicEzId?: string;
}

export interface ProgressiveClaimCardProps {
  pass?: ExtendedRegistrationPass;
  claimToken?: string;
  expiresAt?: string;
  patientName?: string;
  facilityName?: string;
  appleStoreUrl?: string;
  googlePlayUrl?: string;
  state?: "loading" | "empty" | "error" | "success";
  errorMessage?: string;
  isPrivacyMismatch?: boolean;
  onClaim?: () => void;
  onRetry?: () => void;
  onClaimSuccess?: (data: { clinicEzId: string }) => void;
}

export function ProgressiveClaimCard({
  pass,
  claimToken: propClaimToken,
  expiresAt: propExpiresAt,
  patientName: propPatientName,
  facilityName: propFacilityName,
  appleStoreUrl,
  googlePlayUrl,
  state: controlledState,
  errorMessage: propErrorMessage,
  isPrivacyMismatch: propIsPrivacyMismatch,
  onClaim,
  onRetry,
  onClaimSuccess,
}: ProgressiveClaimCardProps) {
  // Resolve unified metadata from pass or direct props
  const claimToken = propClaimToken || pass?.claimToken || "claim-token-ephemeral";
  const expiresAt = propExpiresAt || pass?.expiresAt || "48h";
  const patientName = propPatientName || pass?.fullName || "Patient";
  const facilityName = propFacilityName || pass?.facilityName || "Clinic EZ Facility";

  // Safe Clerk hook access (survives unit tests without ClerkProvider)
  let clerkUser: ReturnType<typeof useUser>["user"] = null;
  let isSignedIn = false;
  let isInsideClerk = false;
  let getToken: (() => Promise<string | null>) | null = null;
  try {
    const userHook = useUser();
    const authHook = useAuth();
    clerkUser = userHook.user;
    isSignedIn = Boolean(userHook.isSignedIn);
    getToken = authHook.getToken;
    isInsideClerk = true;
  } catch {
    // Outside ClerkProvider (e.g. headless unit tests)
    isInsideClerk = false;
  }

  const [internalState, setInternalState] = useState<"loading" | "empty" | "error" | "success">(
    pass?.claimedAt ? "success" : "empty"
  );
  const [internalError, setInternalError] = useState<string | null>(null);
  const [isPrivacyMismatch, setIsPrivacyMismatch] = useState(false);
  const [linkedClinicEzId, setLinkedClinicEzId] = useState<string>(
    pass?.clinicEzId || pass?.patientCode || "CLINICEZ-PHR-PASS"
  );

  const activeState = controlledState !== undefined ? controlledState : internalState;
  const activeError = propErrorMessage !== undefined ? propErrorMessage : internalError;

  const isPrivacyMismatchActive =
    propIsPrivacyMismatch !== undefined
      ? propIsPrivacyMismatch
      : isPrivacyMismatch ||
        Boolean(
          activeError &&
            (activeError.includes("RA 10173") ||
              activeError.toLowerCase().includes("medical privacy") ||
              activeError.toLowerCase().includes("foreign health records"))
        );

  // Multi-Identity Safety Check
  const checkIdentityCollision = (): "ok" | "dependent" | "alternate_email" | "privacy_block" => {
    if (!isSignedIn || !clerkUser) return "ok";

    // 1. Dependent / Minor check
    if (pass?.memberType === "DD") {
      return "dependent";
    }

    // 2. Adult privacy guardrail (Philippine Data Privacy Act RA 10173)
    // If user's Clerk name does not match pass patient name
    const clerkFirst = (clerkUser.firstName || "").toLowerCase().trim();
    const clerkLast = (clerkUser.lastName || "").toLowerCase().trim();
    const passFirst = (pass?.firstName || "").toLowerCase().trim();
    const passLast = (pass?.lastName || "").toLowerCase().trim();

    if (passFirst && passLast && clerkFirst && clerkLast) {
      const isNameMatch = clerkFirst === passFirst && clerkLast === passLast;
      if (!isNameMatch) {
        return "privacy_block";
      }
    }

    // 3. Alternate email check
    const clerkEmail = clerkUser.primaryEmailAddress?.emailAddress?.toLowerCase().trim();
    const passEmail = (pass?.email || "").toLowerCase().trim();
    if (clerkEmail && passEmail && clerkEmail !== passEmail) {
      return "alternate_email";
    }

    return "ok";
  };

  const handleClaim = async () => {
    if (onClaim) {
      onClaim();
      return;
    }

    const collision = checkIdentityCollision();
    if (collision === "privacy_block") {
      setIsPrivacyMismatch(true);
      setInternalError(
        "For medical privacy (RA 10173), medical records of another adult cannot be merged into your personal health account."
      );
      setInternalState("error");
      return;
    }

    setInternalState("loading");
    setInternalError(null);

    try {
      const token = getToken ? await getToken() : null;
      // Dispatch claim-intake command to backend
      const res = await fetch(`${getPatientApiUrl()}/patients/claim-intake`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          claimToken,
          facilitySlug: pass?.facilitySlug,
          tenantSlug: pass?.tenantSlug,
          relationship: collision === "dependent" ? "Dependent" : "Self",
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.message || `Claim request failed with HTTP ${res.status}`
        );
      }

      const resData = await res.json().catch(() => ({}));
      const assignedId = resData.data?.clinicEzId || pass?.patientCode || "CLINICEZ-PHR-ACTIVE";
      setLinkedClinicEzId(assignedId);
      setInternalState("success");
      onClaimSuccess?.({ clinicEzId: assignedId });
    } catch (err: any) {
      setInternalError(err.message || "Failed to link your account. Please try again.");
      setInternalState("error");
    }
  };

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
      return;
    }
    setInternalError(null);
    setIsPrivacyMismatch(false);
    setInternalState("empty");
  };

  // ---------------------------------------------------------------------------
  // 1. Loading Skeleton State
  // ---------------------------------------------------------------------------
  if (activeState === "loading") {
    return (
      <div
        className="bg-card border border-border rounded-2xl p-6 sm:p-7 space-y-5 shadow-sm print:hidden"
        data-testid="claim-card-loading"
        data-section="account-claim-card"
      >
        <div className="space-y-2">
          <div className="h-6 w-3/4 bg-muted animate-pulse rounded-xl" />
          <div className="h-4 w-1/2 bg-muted animate-pulse rounded-xl" />
        </div>

        <div className="space-y-3 py-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3.5 p-3 rounded-xl border border-border/40"
            >
              <div className="w-9 h-9 rounded-xl bg-muted animate-pulse shrink-0" />
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-1/3 bg-muted animate-pulse rounded-md" />
                <div className="h-3 w-4/5 bg-muted animate-pulse rounded-md" />
              </div>
            </div>
          ))}
        </div>

        <div className="h-12 w-full bg-muted animate-pulse rounded-xl" />
        <div className="flex justify-center gap-3 pt-2">
          <div className="h-10 w-32 bg-muted animate-pulse rounded-xl" />
          <div className="h-10 w-32 bg-muted animate-pulse rounded-xl" />
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 2. Active / Success State
  // ---------------------------------------------------------------------------
  if (activeState === "success") {
    return (
      <div
        className="bg-card border-2 border-primary/40 rounded-2xl p-6 sm:p-7 space-y-5 shadow-lg print:hidden"
        data-testid="claim-card-success"
        data-section="account-claim-card"
      >
        <div className="flex items-center gap-3 p-3.5 bg-primary/10 rounded-xl border border-primary/20">
          <div className="p-2 rounded-xl bg-primary text-primary-foreground shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground">
              Patient Account Claimed Successfully!
            </h4>
            <p className="text-xs text-muted-foreground">
              Your clinic registration is now linked to your permanent Clinic EZ PHR.
            </p>
          </div>
        </div>

        <div className="bg-muted/50 rounded-xl p-4 space-y-2.5 border border-border text-xs">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Linked Clinic EZ ID:</span>
            <span className="font-mono font-bold text-foreground text-sm">
              {linkedClinicEzId}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Registered Patient:</span>
            <span className="font-semibold text-foreground">{patientName}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Facility Membership:</span>
            <span className="font-semibold text-foreground">{facilityName}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Queue Status:</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-primary/15 text-primary">
              <Sparkles className="w-3 h-3" />
              Active Live Pass
            </span>
          </div>
        </div>

        <div className="text-center space-y-3 pt-2">
          <p className="text-xs text-muted-foreground">
            Download the Clinic EZ mobile app to track live queue updates and view your medical charts:
          </p>
          <MobileAppStoreBadges
            appleStoreUrl={appleStoreUrl}
            googlePlayUrl={googlePlayUrl}
          />
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 3. Error with Retry State
  // ---------------------------------------------------------------------------
  if (activeState === "error") {
    return (
      <div
        className="bg-card border-2 border-destructive/30 rounded-2xl p-6 sm:p-7 space-y-5 shadow-sm print:hidden"
        data-testid="claim-card-error"
        data-section="account-claim-card"
      >
        <div className="flex items-start gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {isPrivacyMismatchActive ? (
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <h4 className="font-bold">
              {isPrivacyMismatchActive
                ? "Medical Privacy Notice (RA 10173)"
                : "Unable to Complete Account Claim"}
            </h4>
            <p className="text-xs text-destructive/90 leading-relaxed">
              {activeError ||
                "An unexpected network or session error occurred while processing your claim."}
            </p>
          </div>
        </div>

        {isPrivacyMismatchActive && (
          <div className="p-3.5 bg-muted/60 rounded-xl text-xs text-muted-foreground space-y-1.5 border border-border">
            <p className="font-semibold text-foreground">What you can do:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Sign out and sign in with the account matching this patient.</li>
              <li>Or request legal ward authorization at the clinic reception desk.</li>
            </ul>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm transition-all shadow-md shadow-primary/20 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 4. Initial / Available (Empty) State
  // ---------------------------------------------------------------------------
  return (
    <div
      className="relative bg-card border-2 border-primary/25 hover:border-primary/40 rounded-2xl p-6 sm:p-7 space-y-6 shadow-md transition-all print:hidden"
      data-testid="claim-card-available"
      data-section="account-claim-card"
    >
      {/* Header */}
      <div className="space-y-1.5">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary">
          <Sparkles className="w-3.5 h-3.5" />
          Permanent Health Record
        </div>
        <h3 className="text-lg sm:text-xl font-black text-foreground tracking-tight">
          Claim Your Clinic EZ Patient Account
        </h3>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Never fill out clinic intake forms again. Keep this visit's records and manage your queue in real time.
        </p>
      </div>

      {/* 3 Core Patient Benefits */}
      <div className="space-y-2.5">
        {CLAIM_CARD_BENEFITS.map((b) => {
          const Icon =
            b.iconName === "BellRing"
              ? BellRing
              : b.iconName === "FileCheck"
              ? FileCheck
              : Zap;

          return (
            <div
              key={b.id}
              className="flex items-start gap-3.5 p-3 rounded-xl bg-muted/40 hover:bg-muted/70 border border-border/50 transition-colors"
            >
              <span className="p-2 rounded-xl bg-primary/10 text-primary shrink-0 mt-0.5">
                <Icon className="w-4 h-4" />
              </span>
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-foreground">
                  {b.title}
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {b.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Primary Action Button */}
      <div className="pt-2 space-y-3">
        {isSignedIn ? (
          <button
            type="button"
            onClick={handleClaim}
            className="w-full inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm sm:text-base transition-all shadow-lg shadow-primary/20 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            <Sparkles className="w-4 h-4" />
            Claim My Patient Account in 1-Click
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : isInsideClerk ? (
          <SignInButton mode="modal">
            <button
              type="button"
              className="w-full inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm sm:text-base transition-all shadow-lg shadow-primary/20 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              <Sparkles className="w-4 h-4" />
              Claim My Patient Account in 1-Click
              <ArrowRight className="w-4 h-4" />
            </button>
          </SignInButton>
        ) : (
          <button
            type="button"
            onClick={handleClaim}
            className="w-full inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm sm:text-base transition-all shadow-lg shadow-primary/20 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            <Sparkles className="w-4 h-4" />
            Claim My Patient Account in 1-Click
            <ArrowRight className="w-4 h-4" />
          </button>
        )}

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <Lock className="w-3 h-3 text-muted-foreground" />
          <span>Protected under RA 10173 &bull; Token valid for {expiresAt}</span>
        </div>
      </div>

      {/* Download Mobile Badges */}
      <div className="pt-2 border-t border-border/60">
        <p className="text-[11px] font-semibold text-center text-muted-foreground mb-3 uppercase tracking-wider">
          Or manage via Clinic EZ Mobile PHR:
        </p>
        <MobileAppStoreBadges
          appleStoreUrl={appleStoreUrl}
          googlePlayUrl={googlePlayUrl}
        />
      </div>
    </div>
  );
}

export default ProgressiveClaimCard;
