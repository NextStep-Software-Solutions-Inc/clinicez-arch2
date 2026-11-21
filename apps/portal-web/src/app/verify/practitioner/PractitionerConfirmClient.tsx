"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  IconAlertCircle,
  IconBuildingHospital,
  IconCheck,
  IconClock,
  IconLoader,
  IconShieldCheck,
  IconStethoscope,
} from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatVerificationTimestamp } from "@/lib/verificationStatus";
import {
  verificationService,
  type AffiliationConfirmationInfoDto,
  type AffiliationConfirmationResultDto,
} from "@/services/verification.service";
import { apiErrorMessage, apiErrorStatus } from "@/lib/apiError";

export interface PractitionerConfirmClientProps {
  initialToken?: string;
  initialInfo?: AffiliationConfirmationInfoDto | null;
}

export function PractitionerConfirmClient({
  initialToken,
  initialInfo,
}: PractitionerConfirmClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryToken = searchParams?.get("token")?.trim() || "";
  const activeToken = (initialToken ?? queryToken).trim();

  const [manualToken, setManualToken] = useState("");
  const [info, setInfo] = useState<AffiliationConfirmationInfoDto | null>(initialInfo ?? null);
  const [loading, setLoading] = useState(Boolean(activeToken) && initialInfo === undefined);
  const [loadError, setLoadError] = useState<{ message: string; isExpired: boolean } | null>(null);

  const [otpCode, setOtpCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedResult, setConfirmedResult] =
    useState<AffiliationConfirmationResultDto | null>(null);

  const loadConfirmation = useCallback(async (tokenToLoad: string) => {
    setLoading(true);
    setLoadError(null);
    setSubmitError(null);
    setConfirmedResult(null);
    try {
      const data = await verificationService.getAffiliationConfirmation(tokenToLoad);
      setInfo(data);
    } catch (err: unknown) {
      const status = apiErrorStatus(err);
      const message = apiErrorMessage(
        err,
        "Invalid or unrecognized affiliation confirmation link.",
      );
      setInfo(null);
      setLoadError({
        message,
        isExpired: status === 410,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeToken) {
      setLoading(false);
      setInfo(null);
      setLoadError(null);
      return;
    }
    if (initialInfo !== undefined) {
      setInfo(initialInfo);
      setLoading(false);
      return;
    }
    void loadConfirmation(activeToken);
  }, [activeToken, initialInfo, loadConfirmation]);

  const handleManualLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = manualToken.trim();
    if (!cleaned) return;
    router.push(`/verify/practitioner?token=${encodeURIComponent(cleaned)}`);
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeToken || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await verificationService.confirmPractitionerAffiliation(
        activeToken,
        otpCode.trim() || undefined,
      );
      setConfirmedResult(res);
      setInfo((prev) =>
        prev
          ? { ...prev, alreadyConfirmed: true, status: "Approved" }
          : prev,
      );
    } catch (err: unknown) {
      const status = apiErrorStatus(err);
      const msg = apiErrorMessage(err, "Unable to confirm clinic affiliation.");
      if (status === 410) {
        setLoadError({ message: msg, isExpired: true });
      } else {
        setSubmitError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground py-12 px-4 sm:px-6">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <IconShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
            Practitioner Affiliation Confirmation
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Confirm your clinical practice affiliation to appear in the Clinic EZ Patient App directory.
          </p>
        </div>

        {/* Missing Token State */}
        {!activeToken ? (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-foreground">Confirmation Token Required</h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Open the affiliation confirmation link sent to your verified contact email, or paste the confirmation token below.
              </p>
            </div>
            <form onSubmit={handleManualLookup} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="affiliation-token" className="text-xs font-semibold">
                  Confirmation Token
                </Label>
                <Input
                  id="affiliation-token"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="Paste confirmation token..."
                  className="h-10 rounded-xl font-mono text-xs"
                />
              </div>
              <Button
                type="submit"
                disabled={!manualToken.trim()}
                className="w-full h-10 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Continue
              </Button>
            </form>
          </section>
        ) : loading ? (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4" aria-label="Loading confirmation details">
            <Skeleton className="h-6 w-2/3 rounded-lg" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </section>
        ) : loadError ? (
          <section
            role="alert"
            className="rounded-2xl border border-destructive/30 bg-card p-6 shadow-sm space-y-3 text-center"
          >
            <div className="mx-auto h-10 w-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
              <IconAlertCircle className="h-5 w-5" />
            </div>
            <h2 className="text-sm font-bold text-foreground">
              {loadError.isExpired
                ? "Confirmation Link Expired"
                : "Invalid Confirmation Link"}
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">{loadError.message}</p>
            <p className="text-[11px] text-muted-foreground">
              Contact your clinic administrator to re-submit your directory listing request for a fresh confirmation link.
            </p>
          </section>
        ) : info?.isExpired && !info.alreadyConfirmed ? (
          <section
            role="alert"
            className="rounded-2xl border border-destructive/30 bg-card p-6 shadow-sm space-y-3 text-center"
          >
            <div className="mx-auto h-10 w-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
              <IconClock className="h-5 w-5" />
            </div>
            <h2 className="text-sm font-bold text-foreground">Confirmation Link Expired</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This confirmation link for {info.facilityName} expired on{" "}
              {formatVerificationTimestamp(info.expiresAtUtc)}. Ask your clinic administrator to resubmit your listing.
            </p>
          </section>
        ) : confirmedResult || info?.alreadyConfirmed ? (
          <section className="rounded-2xl border border-success/30 bg-card p-6 shadow-sm space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-success/10 text-success flex items-center justify-center shrink-0">
                <IconCheck className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-bold text-foreground">
                    Clinic Affiliation Confirmed
                  </h2>
                  <Badge variant="outline" className="text-[10px] font-bold bg-success/10 text-success border-success/25">
                    {confirmedResult?.affiliationStatus || "Active"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {info?.practitionerName || "Your practitioner profile"} is now confirmed at{" "}
                  <strong className="text-foreground">
                    {confirmedResult?.facilityName || info?.facilityName}
                  </strong>
                  .
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-1.5 text-xs">
              {info ? (
                <>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Practitioner</span>
                    <span className="font-semibold text-foreground">{info.practitionerName}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Profession</span>
                    <span className="font-medium text-foreground">{info.professionKind}</span>
                  </div>
                  {info.specialty ? (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Specialty</span>
                      <span className="font-medium text-foreground">{info.specialty}</span>
                    </div>
                  ) : null}
                </>
              ) : null}
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Clinic</span>
                <span className="font-semibold text-foreground">
                  {confirmedResult?.facilityName || info?.facilityName}
                </span>
              </div>
              {confirmedResult?.confirmedAtUtc ? (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Confirmed At</span>
                  <span className="font-medium text-foreground">
                    {formatVerificationTimestamp(confirmedResult.confirmedAtUtc)}
                  </span>
                </div>
              ) : null}
            </div>
          </section>
        ) : info ? (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-5">
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2.5 text-xs">
              <div className="flex items-center gap-2 text-foreground font-bold text-sm">
                <IconStethoscope className="h-4 w-4 text-primary shrink-0" />
                <span>{info.practitionerName}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <IconBuildingHospital className="h-4 w-4 text-primary shrink-0" />
                <span>
                  Clinic: <strong className="text-foreground">{info.facilityName}</strong>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge variant="outline" className="text-[10px] font-semibold">
                  {info.professionKind}
                </Badge>
                {info.specialty ? (
                  <Badge variant="outline" className="text-[10px] font-semibold">
                    {info.specialty}
                  </Badge>
                ) : null}
                {info.expiresAtUtc ? (
                  <span className="text-[11px] text-muted-foreground ml-auto">
                    Expires {formatVerificationTimestamp(info.expiresAtUtc)}
                  </span>
                ) : null}
              </div>
            </div>

            <form onSubmit={handleConfirm} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="otp-code" className="text-xs font-semibold">
                  {info.requiresOtpCode ? "Verification Code *" : "Verification Code (Optional)"}
                </Label>
                <Input
                  id="otp-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otpCode}
                  onChange={(e) => {
                    setOtpCode(e.target.value);
                    if (submitError) setSubmitError(null);
                  }}
                  placeholder="Enter 6-digit code from email if provided"
                  maxLength={12}
                  className="h-10 rounded-xl font-mono text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  If your invitation email included a 6-digit confirmation code, enter it above before confirming.
                </p>
              </div>

              {submitError ? (
                <div
                  role="alert"
                  className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive font-medium"
                >
                  {submitError}
                </div>
              ) : null}

              <Button
                type="submit"
                disabled={submitting || (info.requiresOtpCode && !otpCode.trim())}
                className="w-full h-10 rounded-xl text-xs font-bold gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {submitting ? (
                  <>
                    <IconLoader className="h-4 w-4 animate-spin" />
                    <span>Confirming Affiliation...</span>
                  </>
                ) : (
                  <>
                    <IconCheck className="h-4 w-4" />
                    <span>Confirm Clinic Affiliation</span>
                  </>
                )}
              </Button>
            </form>
          </section>
        ) : null}
      </div>
    </main>
  );
}
