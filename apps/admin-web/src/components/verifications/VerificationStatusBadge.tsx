import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconBuildingHospital,
  IconDownload,
  IconFileTypePdf,
  IconFileText,
  IconMaximize,
  IconPhoto,
  IconRefresh,
  IconStethoscope,
  IconX,
} from "@tabler/icons-react";
import { getQueueStatusDisplay } from "@/lib/verificationStatus";
import type { VerificationEvidenceBlobResult } from "@/services/verification.service";

export function VerificationStatusBadge({
  status,
  className = "",
}: {
  status?: string | null;
  className?: string;
}) {
  const display = getQueueStatusDisplay(status);
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${display.badgeClassName} ${className}`.trim()}
    >
      {display.label}
    </span>
  );
}

export function VerificationKindBadge({ kind }: { kind: string }) {
  const isFacility = kind.toLowerCase() === "facility";
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-surface-muted text-text border border-border whitespace-nowrap">
      {isFacility ? (
        <IconBuildingHospital className="h-3 w-3 text-primary shrink-0" />
      ) : (
        <IconStethoscope className="h-3 w-3 text-primary shrink-0" />
      )}
      <span>{isFacility ? "Facility" : "Practitioner"}</span>
    </span>
  );
}

function isUrlReference(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith("blob:") || value.startsWith("data:");
}

function isImageReference(contentType?: string | null, nameOrKey?: string | null): boolean {
  if (contentType && contentType.toLowerCase().startsWith("image/")) return true;
  if (nameOrKey && /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(nameOrKey)) return true;
  return false;
}

function isPdfReference(contentType?: string | null, nameOrKey?: string | null): boolean {
  if (contentType && contentType.toLowerCase().includes("pdf")) return true;
  if (nameOrKey && /\.pdf(\?.*)?$/i.test(nameOrKey)) return true;
  return false;
}

function deriveFriendlyFileName(objectKey?: string | null, fallbackName?: string | null): string {
  if (fallbackName && fallbackName.trim()) return fallbackName.trim();
  if (!objectKey) return "Uploaded document";
  const withoutQuery = objectKey.split("?")[0];
  const segments = withoutQuery.split("/").filter(Boolean);
  return segments[segments.length - 1] || "Uploaded document";
}

export interface ProofEvidenceCardProps {
  label: string;
  objectKey?: string | null;
  fetchEvidence?: () => Promise<VerificationEvidenceBlobResult>;
  initialPreviewUrl?: string | null;
  initialContentType?: string | null;
  initialFileName?: string | null;
}

export function ProofEvidenceCard({
  label,
  objectKey,
  fetchEvidence,
  initialPreviewUrl,
  initialContentType,
  initialFileName,
}: ProofEvidenceCardProps) {
  const directUrl = !fetchEvidence && objectKey && isUrlReference(objectKey) ? objectKey : null;
  const resolvedInitialUrl = initialPreviewUrl ?? directUrl;

  const fetchEvidenceRef = useRef(fetchEvidence);
  useEffect(() => {
    fetchEvidenceRef.current = fetchEvidence;
  }, [fetchEvidence]);
  const hasFetcher = Boolean(fetchEvidence);

  const [fetchedUrl, setFetchedUrl] = useState<string | null>(null);
  const [fetchedContentType, setFetchedContentType] = useState<string | null>(null);
  const [fetchedFileName, setFetchedFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(objectKey && hasFetcher && !resolvedInitialUrl));
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const loadPreview = useCallback(async (signal?: { cancelled: boolean }) => {
    const fetcher = fetchEvidenceRef.current;
    if (!objectKey || !fetcher) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      const nextUrl = URL.createObjectURL(result.blob);
      if (signal?.cancelled) {
        URL.revokeObjectURL(nextUrl);
        return;
      }
      setFetchedUrl((prev) => {
        if (prev && prev.startsWith("blob:")) {
          URL.revokeObjectURL(prev);
        }
        return nextUrl;
      });
      setFetchedContentType(result.contentType || result.blob.type || null);
      setFetchedFileName(deriveFriendlyFileName(objectKey, result.fileName));
    } catch (err: unknown) {
      if (signal?.cancelled) return;
      const msg =
        err && typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Unable to load uploaded document preview.";
      setError(msg);
    } finally {
      if (!signal?.cancelled) {
        setLoading(false);
      }
    }
  }, [objectKey]);

  useEffect(() => {
    if (resolvedInitialUrl || !objectKey || !hasFetcher) {
      return;
    }
    const signal = { cancelled: false };
    void loadPreview(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [objectKey, hasFetcher, resolvedInitialUrl, loadPreview]);

  useEffect(() => {
    return () => {
      if (fetchedUrl && fetchedUrl.startsWith("blob:")) {
        URL.revokeObjectURL(fetchedUrl);
      }
    };
  }, [fetchedUrl]);

  const previewUrl = resolvedInitialUrl ?? fetchedUrl;
  const contentType = initialContentType ?? fetchedContentType;
  const fileName = deriveFriendlyFileName(objectKey, initialFileName ?? fetchedFileName);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  if (!objectKey && !resolvedInitialUrl) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-muted/40 p-3 text-xs text-text-muted flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <IconFileText className="h-4 w-4 text-text-muted shrink-0" />
          <span className="truncate">{label}: Not attached</span>
        </div>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-surface-muted text-text-muted border border-border shrink-0">
          Missing
        </span>
      </div>
    );
  }

  const isImage = isImageReference(contentType, fileName || objectKey);
  const isPdf = !isImage && isPdfReference(contentType, fileName || objectKey);
  const kindLabel = isPdf ? "PDF Document" : isImage ? "Image" : "Document";

  return (
    <>
      <div className="rounded-xl border border-border bg-surface-muted/30 p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            {isPdf ? (
              <IconFileTypePdf className="h-4 w-4 text-primary shrink-0" />
            ) : isImage ? (
              <IconPhoto className="h-4 w-4 text-primary shrink-0" />
            ) : (
              <IconFileText className="h-4 w-4 text-primary shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-xs font-semibold text-text truncate">{label}</div>
              <div className="text-[10px] text-text-muted truncate">
                {kindLabel} • {fileName}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {previewUrl ? (
              <>
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="inline-flex items-center gap-1 h-7 px-2.5 text-[11px] font-semibold text-text bg-surface border border-border hover:bg-surface-muted rounded-lg transition-colors cursor-pointer"
                >
                  <IconMaximize className="h-3 w-3" />
                  <span>Full View</span>
                </button>
                <a
                  href={previewUrl}
                  download={fileName}
                  className="inline-flex items-center gap-1 h-7 px-2 text-[11px] font-medium text-text-secondary hover:text-text hover:bg-surface rounded-lg transition-colors"
                  title="Download file"
                >
                  <IconDownload className="h-3 w-3" />
                  <span>Download</span>
                </a>
              </>
            ) : null}
          </div>
        </div>

        {/* Inline Document Viewer */}
        {loading ? (
          <div
            className="h-48 rounded-lg border border-border bg-surface-muted animate-pulse flex items-center justify-center text-xs text-text-muted"
            aria-label={`Loading ${label}`}
          >
            Loading document preview...
          </div>
        ) : error ? (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-center justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <IconAlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
            {fetchEvidence ? (
              <button
                type="button"
                onClick={() => void loadPreview()}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-surface border border-border text-text hover:bg-surface-muted transition-colors cursor-pointer shrink-0"
              >
                <IconRefresh className="h-3 w-3" />
                <span>Retry</span>
              </button>
            ) : null}
          </div>
        ) : previewUrl ? (
          isImage ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="block w-full rounded-lg overflow-hidden border border-border bg-background hover:border-primary/50 transition-colors cursor-pointer"
              aria-label={`Expand ${label}`}
            >
              <img
                src={previewUrl}
                alt={label}
                className="w-full max-h-64 object-contain bg-surface-muted/20"
                referrerPolicy="no-referrer"
              />
            </button>
          ) : isPdf ? (
            <div className="rounded-lg overflow-hidden border border-border bg-background">
              <iframe
                src={previewUrl}
                title={label}
                className="w-full h-72 border-0 bg-surface"
              />
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-background p-3 flex items-center justify-between gap-2 text-xs text-text-secondary">
              <span className="truncate">{fileName}</span>
              <a
                href={previewUrl}
                download={fileName}
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline shrink-0"
              >
                <IconDownload className="h-3.5 w-3.5" />
                <span>Download File</span>
              </a>
            </div>
          )
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-background p-3 text-xs text-text-muted flex items-center justify-between gap-2">
            <span>Uploaded proof attached ({fileName}).</span>
            {fetchEvidence ? (
              <button
                type="button"
                onClick={() => void loadPreview()}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-primary bg-primary-subtle hover:bg-primary/20 transition-colors cursor-pointer"
              >
                <span>Load Preview</span>
              </button>
            ) : null}
          </div>
        )}
      </div>

      {/* Full-View Lightbox Modal */}
      {expanded && previewUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setExpanded(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${label} full preview`}
        >
          <div
            className="w-full max-w-5xl h-[85vh] bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-border bg-surface-muted/40 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-text truncate">{label}</h3>
                <p className="text-[11px] text-text-muted truncate">
                  {kindLabel} • {fileName}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewUrl}
                  download={fileName}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-text bg-surface border border-border hover:bg-surface-muted transition-colors"
                >
                  <IconDownload className="h-3.5 w-3.5" />
                  <span>Download</span>
                </a>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  aria-label="Close document viewer"
                  className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-muted transition-colors cursor-pointer"
                >
                  <IconX className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-background overflow-auto flex items-center justify-center p-4">
              {isImage ? (
                <img
                  src={previewUrl}
                  alt={label}
                  className="max-w-full max-h-full object-contain rounded-lg"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <iframe
                  src={previewUrl}
                  title={`${label} full document`}
                  className="w-full h-full rounded-lg border border-border bg-surface"
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function NameMismatchAlert({ compact = false }: { compact?: boolean }) {
  return (
    <div
      role="alert"
      className={`rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 flex items-start gap-2 ${
        compact ? "px-2.5 py-1.5 text-[11px]" : "p-3 text-xs"
      }`}
    >
      <IconAlertTriangle
        className={`shrink-0 ${compact ? "h-3.5 w-3.5 mt-0.5" : "h-4 w-4 mt-0.5"}`}
      />
      <div>
        <span className="font-semibold">PRC Name Mismatch Warning:</span>{" "}
        <span>
          Submitted clinician name differs from an existing canonical PRC record. Verify identity and PRC card before approval.
        </span>
      </div>
    </div>
  );
}
