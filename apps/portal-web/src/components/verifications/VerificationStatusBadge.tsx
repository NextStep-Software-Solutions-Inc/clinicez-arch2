"use client";

import React, { useState } from "react";
import {
  IconAlertTriangle,
  IconBuildingHospital,
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconFileText,
  IconStethoscope,
} from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getQueueStatusDisplay } from "@/lib/verificationStatus";

export function VerificationStatusBadge({
  status,
  className,
}: {
  status?: string | null;
  className?: string;
}) {
  const display = getQueueStatusDisplay(status);
  return (
    <Badge
      variant="outline"
      className={cn("text-[11px] font-semibold whitespace-nowrap", display.badgeClassName, className)}
    >
      {display.label}
    </Badge>
  );
}

export function VerificationKindBadge({ kind }: { kind: string }) {
  const isFacility = kind.toLowerCase() === "facility";
  return (
    <Badge
      variant="outline"
      className="text-[11px] font-semibold gap-1 bg-muted/60 text-foreground border-border whitespace-nowrap"
    >
      {isFacility ? (
        <IconBuildingHospital className="h-3 w-3 text-primary" />
      ) : (
        <IconStethoscope className="h-3 w-3 text-primary" />
      )}
      <span>{isFacility ? "Facility" : "Practitioner"}</span>
    </Badge>
  );
}

function isUrlReference(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith("/");
}

function isImagePath(value: string): boolean {
  return /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(value);
}

export function ProofEvidenceCard({
  label,
  objectKey,
}: {
  label: string;
  objectKey?: string | null;
}) {
  const [copied, setCopied] = useState(false);

  if (!objectKey) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconFileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <span>{label}: Not attached</span>
        </div>
        <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">
          Missing
        </Badge>
      </div>
    );
  }

  const isUrl = isUrlReference(objectKey);
  const isImage = isUrl && isImagePath(objectKey);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(objectKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable in headless environments
    }
  };

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <IconFileText className="h-4 w-4 text-primary shrink-0" />
          <span className="text-xs font-semibold text-foreground truncate">{label}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-7 px-2 text-[11px] rounded-lg gap-1"
          >
            {copied ? (
              <>
                <IconCheck className="h-3 w-3 text-success" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <IconCopy className="h-3 w-3" />
                <span>Copy Key</span>
              </>
            )}
          </Button>
          {isUrl ? (
            <Button asChild variant="outline" size="sm" className="h-7 px-2.5 text-[11px] rounded-lg gap-1">
              <a href={objectKey} target="_blank" rel="noopener noreferrer">
                <span>Open Proof</span>
                <IconExternalLink className="h-3 w-3" />
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      {isImage ? (
        <div className="rounded-lg overflow-hidden border border-border bg-background max-h-48">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={objectKey}
            alt={label}
            className="w-full max-h-48 object-contain bg-muted/10"
            referrerPolicy="no-referrer"
          />
        </div>
      ) : null}

      <div className="rounded-lg bg-background border border-border px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground break-all">
        {objectKey}
      </div>
    </div>
  );
}

export function NameMismatchAlert({ compact = false }: { compact?: boolean }) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border border-warning/35 bg-warning/10 text-warning flex items-start gap-2",
        compact ? "px-2 py-1 text-[11px]" : "p-3 text-xs",
      )}
    >
      <IconAlertTriangle className={cn("shrink-0", compact ? "h-3.5 w-3.5 mt-0.5" : "h-4 w-4 mt-0.5")} />
      <div>
        <span className="font-semibold">PRC Name Mismatch Warning:</span>{" "}
        <span>
          Submitted clinician name differs from an existing canonical PRC record. Verify identity and PRC card before approval.
        </span>
      </div>
    </div>
  );
}
