"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IconAlertCircle, IconCircleCheck, IconFileText, IconLoader, IconUpload } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LAB_UPLOAD_CONTENT_TYPES,
  LAB_UPLOAD_MAX_BYTES,
  labUploadService,
  LabUploadOutcome,
  LabUploadInfo,
} from "@/services/labUpload.service";

const MAX_MB = Math.round((LAB_UPLOAD_MAX_BYTES / (1024 * 1024)) * 10) / 10;

function validateFile(file: File): string | null {
  if (!LAB_UPLOAD_CONTENT_TYPES.includes(file.type)) return "Only PDF, JPG and PNG files can be sent.";
  if (file.size === 0) return "This file is empty.";
  if (file.size > LAB_UPLOAD_MAX_BYTES) {
    return `This file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The limit is ${MAX_MB} MB.`;
  }
  return null;
}

function outcomeError(outcome: LabUploadOutcome): string | null {
  switch (outcome.kind) {
    case "too_large":
      return `The file is too large. The limit is ${MAX_MB} MB.`;
    case "unsupported_type":
      return "Only PDF, JPG and PNG files can be sent.";
    case "invalid":
      return outcome.message;
    case "rate_limited":
      return "Too many uploads from this connection. Please wait a few minutes and try again.";
    case "failed":
      return "The upload could not be completed. Check your connection and try again.";
    case "accepted":
      return null;
  }
}

function getInitialTokenError(token: string): string | null {
  const clean = (token || "").trim();
  if (!clean) return "Upload token is missing.";

  // Check for non-lab document prefixes
  const lower = clean.toLowerCase();
  if (
    lower.startsWith("rx-") ||
    lower.startsWith("mc-") ||
    lower.startsWith("ref-") ||
    lower.startsWith("sec-sha256-")
  ) {
    return "The provided token is for a clinical document, not a laboratory upload.";
  }

  // Rx tokens are {clinicId:N}.{32-hex-secret} (length 65)
  if (
    clean.length === 65 &&
    clean[32] === "." &&
    /^[0-9a-fA-F]{32}$/.test(clean.slice(0, 32)) &&
    /^[0-9a-fA-F]{32}$/.test(clean.slice(33))
  ) {
    return "The provided token is an e-prescription verification token, not a laboratory upload token.";
  }

  // Format must be {facilityId:N}.{secret}
  const dotIndex = clean.indexOf(".");
  if (dotIndex !== 32 || clean.length < 40 || clean.length > 100) {
    return "Invalid or malformed laboratory upload link.";
  }

  return null;
}

export default function LabUploadClient({ token }: { token: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const initialError = getInitialTokenError(token);
  const [loading, setLoading] = useState(!initialError);
  const [labInfo, setLabInfo] = useState<LabUploadInfo | null>(null);
  const [invalidTokenError, setInvalidTokenError] = useState<string | null>(initialError);

  const [file, setFile] = useState<File | null>(null);
  const [labName, setLabName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const validateToken = async () => {
      const clean = (token || "").trim();
      const err = getInitialTokenError(clean);
      if (err) {
        setInvalidTokenError(err);
        setLoading(false);
        return;
      }

      try {
        const info = await labUploadService.getLabUploadInfo(clean);
        setLabInfo(info);
      } catch (err: any) {
        setInvalidTokenError(
          err.response?.data?.message ||
            err.message ||
            "The laboratory upload link is invalid, expired, or was not issued for laboratory results."
        );
      } finally {
        setLoading(false);
      }
    };

    validateToken();
  }, [token]);

  const choose = (selected: File | undefined) => {
    if (!selected) return;
    const problem = validateFile(selected);
    setError(problem);
    setFile(problem ? null : selected);
    if (problem && inputRef.current) inputRef.current.value = "";
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file || submitting) return;

    setSubmitting(true);
    setError(null);
    setProgress(0);
    const outcome = await labUploadService.submit(token, file, labName, setProgress);
    setSubmitting(false);

    if (outcome.kind === "accepted") {
      setDone(true);
      return;
    }
    setError(outcomeError(outcome));
  };

  return (
    <main className="min-h-dvh bg-slate-50 dark:bg-slate-950 flex items-start sm:items-center justify-center px-4 py-8">
      {loading ? (
        <Card className="w-full max-w-lg rounded-3xl shadow-sm border border-border">
          <CardContent className="flex flex-col items-center text-center gap-3 py-12 px-6">
            <IconLoader className="h-8 w-8 animate-spin text-primary" aria-hidden />
            <h2 className="text-base font-bold text-foreground">Validating Laboratory Upload Link...</h2>
            <p className="text-xs text-muted-foreground">Verifying token authenticity with issuing clinic.</p>
          </CardContent>
        </Card>
      ) : invalidTokenError || !labInfo ? (
        <Card className="w-full max-w-lg rounded-3xl shadow-sm border-rose-200 dark:border-rose-900 bg-rose-50/30 dark:bg-rose-950/20">
          <CardContent className="flex flex-col items-center text-center gap-3 py-10 px-6">
            <div className="size-12 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-1">
              <IconAlertCircle className="h-6 w-6" aria-hidden />
            </div>
            <h2 className="text-lg font-bold text-foreground">Invalid Laboratory Upload Link</h2>
            <p className="text-xs text-muted-foreground max-w-sm leading-relaxed mb-4">
              {invalidTokenError || "The laboratory upload link is invalid, expired, or was not issued for laboratory results."}
            </p>
            <Link href="/">
              <Button variant="outline" className="rounded-xl text-xs font-semibold">
                Return to Homepage
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card className="w-full max-w-lg rounded-3xl shadow-sm">
          {done ? (
            <CardContent className="flex flex-col items-center text-center gap-4 py-12 px-6">
              <IconCircleCheck className="h-14 w-14 text-success" aria-hidden />
              <h1 className="text-xl font-bold">Thanks</h1>
              <p className="text-sm text-muted-foreground">
                Your laboratory result file has been securely submitted for {labInfo.clinicName}. You can close this page.
              </p>
            </CardContent>
          ) : (
            <>
              <CardHeader className="space-y-1.5">
                <CardTitle className="text-xl font-bold">Send a lab result</CardTitle>
                <CardDescription>
                  Upload the result file for {labInfo.clinicName}. PDF, JPG or PNG, up to {MAX_MB} MB.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={submit} className="space-y-5" noValidate>
                  <div className="space-y-2">
                    <Label htmlFor="lab-file" className="text-xs font-bold">
                      Result file
                    </Label>
                    <input
                      ref={inputRef}
                      id="lab-file"
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                      onChange={(e) => choose(e.target.files?.[0])}
                      disabled={submitting}
                      className="sr-only"
                    />
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      disabled={submitting}
                      className="w-full min-h-28 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 px-4 py-6 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-60"
                    >
                      {file ? (
                        <>
                          <IconFileText className="h-7 w-7 text-primary" aria-hidden />
                          <span className="font-semibold text-foreground break-all">{file.name}</span>
                          <span className="text-xs">{(file.size / (1024 * 1024)).toFixed(2)} MB. Tap to choose another file.</span>
                        </>
                      ) : (
                        <>
                          <IconUpload className="h-7 w-7" aria-hidden />
                          <span className="font-semibold">Tap to choose a file</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="lab-name" className="text-xs font-bold">
                      Laboratory name <span className="font-normal text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id="lab-name"
                      value={labName}
                      onChange={(e) => setLabName(e.target.value)}
                      maxLength={120}
                      autoComplete="organization"
                      disabled={submitting}
                      className="h-11 rounded-xl"
                    />
                  </div>

                  {error && (
                    <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-3 text-sm text-red-700 dark:text-red-300">
                      <IconAlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
                      <span>{error}</span>
                    </div>
                  )}

                  <Button type="submit" disabled={!file || submitting} className="w-full h-11 rounded-xl font-bold">
                    {submitting ? (
                      <>
                        <IconLoader className="h-4 w-4 animate-spin" aria-hidden />
                        Sending{progress > 0 ? ` ${progress}%` : "..."}
                      </>
                    ) : (
                      "Send file"
                    )}
                  </Button>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      )}
    </main>
  );
}
