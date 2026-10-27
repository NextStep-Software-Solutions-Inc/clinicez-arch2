"use client";

import { useRef, useState } from "react";
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

export default function LabUploadClient({ token }: { token: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [labName, setLabName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

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
      <Card className="w-full max-w-lg rounded-3xl shadow-sm">
        {done ? (
          <CardContent className="flex flex-col items-center text-center gap-4 py-12 px-6">
            <IconCircleCheck className="h-14 w-14 text-success" aria-hidden />
            <h1 className="text-xl font-bold">Thanks</h1>
            <p className="text-sm text-muted-foreground">
              If the link was valid, the clinic will receive your file. You can close this page.
            </p>
          </CardContent>
        ) : (
          <>
            <CardHeader className="space-y-1.5">
              <CardTitle className="text-xl font-bold">Send a lab result</CardTitle>
              <CardDescription>
                Upload the result file for the clinic that sent you this link. PDF, JPG or PNG, up to {MAX_MB} MB.
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
    </main>
  );
}
