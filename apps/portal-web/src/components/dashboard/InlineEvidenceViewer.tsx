"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconAlertCircle,
  IconDownload,
  IconFileText,
  IconFileTypePdf,
  IconMaximize,
  IconPhoto,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import type { EvidenceBlobResult } from "@/services/verification.service";

function isImageType(contentType?: string | null, name?: string | null): boolean {
  if (contentType && contentType.toLowerCase().startsWith("image/")) return true;
  if (name && /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(name)) return true;
  return false;
}

function isPdfType(contentType?: string | null, name?: string | null): boolean {
  if (contentType && contentType.toLowerCase().includes("pdf")) return true;
  if (name && /\.pdf(\?.*)?$/i.test(name)) return true;
  return false;
}

function friendlyFileName(source?: string | null, fallback = "DOH LTO Proof"): string {
  if (!source) return fallback;
  const clean = source.split("?")[0];
  const segments = clean.split("/").filter(Boolean);
  return segments[segments.length - 1] || fallback;
}

export interface InlineEvidenceViewerProps {
  label: string;
  objectKey?: string | null;
  localFile?: File | null;
  fetchEvidence?: () => Promise<EvidenceBlobResult>;
  initialPreviewUrl?: string | null;
  initialContentType?: string | null;
  initialFileName?: string | null;
}

export function InlineEvidenceViewer({
  label,
  objectKey,
  localFile,
  fetchEvidence,
  initialPreviewUrl,
  initialContentType,
  initialFileName,
}: InlineEvidenceViewerProps) {
  const fetchEvidenceRef = useRef(fetchEvidence);
  useEffect(() => {
    fetchEvidenceRef.current = fetchEvidence;
  }, [fetchEvidence]);
  const hasFetcher = Boolean(fetchEvidence);

  const localPreviewUrl = useMemo(() => {
    if (!localFile || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
      return null;
    }
    return URL.createObjectURL(localFile);
  }, [localFile]);

  useEffect(() => {
    return () => {
      if (localPreviewUrl && localPreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  const [fetchedUrl, setFetchedUrl] = useState<string | null>(null);
  const [fetchedContentType, setFetchedContentType] = useState<string | null>(null);
  const [fetchedFileName, setFetchedFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(
    Boolean(!initialPreviewUrl && !localFile && objectKey && hasFetcher),
  );
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const loadFromServer = useCallback(async (signal?: { cancelled: boolean }) => {
    const fetcher = fetchEvidenceRef.current;
    if (!objectKey || !fetcher) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetcher();
      const nextUrl = URL.createObjectURL(res.blob);
      if (signal?.cancelled) {
        URL.revokeObjectURL(nextUrl);
        return;
      }
      setFetchedUrl((prev) => {
        if (prev && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
        return nextUrl;
      });
      setFetchedContentType(res.contentType || res.blob.type || null);
      setFetchedFileName(res.fileName || friendlyFileName(objectKey, label));
    } catch (err: unknown) {
      if (signal?.cancelled) return;
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Unable to load uploaded document preview.",
      );
    } finally {
      if (!signal?.cancelled) {
        setLoading(false);
      }
    }
  }, [objectKey, label]);

  useEffect(() => {
    if (localFile || initialPreviewUrl || !objectKey || !hasFetcher) {
      return;
    }
    const signal = { cancelled: false };
    void loadFromServer(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [localFile, initialPreviewUrl, objectKey, hasFetcher, loadFromServer]);

  useEffect(() => {
    return () => {
      if (fetchedUrl && fetchedUrl.startsWith("blob:")) {
        URL.revokeObjectURL(fetchedUrl);
      }
    };
  }, [fetchedUrl]);

  const previewUrl = localPreviewUrl ?? initialPreviewUrl ?? fetchedUrl;
  const contentType = localFile?.type || initialContentType || fetchedContentType;
  const fileName =
    localFile?.name || initialFileName || fetchedFileName || friendlyFileName(objectKey, label);
  const effectiveLoading = Boolean(!localFile && !initialPreviewUrl && loading);
  const effectiveError = localFile || initialPreviewUrl ? null : error;

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  if (!objectKey && !localFile && !initialPreviewUrl) {
    return null;
  }

  const isImage = isImageType(contentType, fileName || objectKey);
  const isPdf = !isImage && isPdfType(contentType, fileName || objectKey);
  const kindText = isPdf ? "PDF Document" : isImage ? "Image" : "Document";

  return (
    <>
      <div className="rounded-xl border border-border bg-background p-2.5 space-y-2">
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
              <div className="text-[11px] font-semibold text-foreground truncate">{fileName}</div>
              <div className="text-[10px] text-muted-foreground">{kindText}</div>
            </div>
          </div>

          {previewUrl ? (
            <div className="flex items-center gap-1 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setExpanded(true)}
                className="h-7 px-2 text-[11px] rounded-lg gap-1"
              >
                <IconMaximize className="h-3 w-3" />
                <span>View</span>
              </Button>
              <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-[11px] rounded-lg gap-1">
                <a href={previewUrl} download={fileName}>
                  <IconDownload className="h-3 w-3" />
                  <span>Download</span>
                </a>
              </Button>
            </div>
          ) : null}
        </div>

        {effectiveLoading ? (
          <div
            className="h-36 rounded-lg border border-border bg-muted animate-pulse flex items-center justify-center text-[11px] text-muted-foreground"
            aria-label={`Loading ${label}`}
          >
            Loading document preview...
          </div>
        ) : effectiveError ? (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-[11px] text-warning flex items-center justify-between gap-2">
            <div className="flex items-start gap-1.5 min-w-0">
              <IconAlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span className="leading-snug">{effectiveError}</span>
            </div>
            {fetchEvidence ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadFromServer()}
                className="h-6 px-2 text-[10px] rounded-md gap-1 shrink-0"
              >
                <IconRefresh className="h-3 w-3" />
                <span>Retry</span>
              </Button>
            ) : null}
          </div>
        ) : previewUrl ? (
          isImage ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="block w-full rounded-lg overflow-hidden border border-border bg-muted/20 hover:border-primary/50 transition-colors cursor-pointer"
              aria-label={`Expand ${label}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={label}
                className="w-full max-h-44 object-contain"
                referrerPolicy="no-referrer"
              />
            </button>
          ) : isPdf ? (
            <div className="rounded-lg overflow-hidden border border-border bg-card">
              <iframe
                src={previewUrl}
                title={label}
                className="w-full h-48 border-0 bg-card"
              />
            </div>
          ) : null
        ) : null}
      </div>

      {expanded && previewUrl ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-foreground/60 backdrop-blur-xs"
          onClick={() => setExpanded(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`${label} full preview`}
        >
          <div
            className="w-full max-w-4xl h-[82vh] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-foreground truncate">{label}</h3>
                <p className="text-[11px] text-muted-foreground truncate">
                  {kindText} • {fileName}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button asChild variant="outline" size="sm" className="h-8 rounded-lg text-xs gap-1.5">
                  <a href={previewUrl} download={fileName}>
                    <IconDownload className="h-3.5 w-3.5" />
                    <span>Download</span>
                  </a>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setExpanded(false)}
                  aria-label="Close document viewer"
                  className="h-8 w-8 rounded-lg"
                >
                  <IconX className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 bg-background overflow-auto flex items-center justify-center p-4">
              {isImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
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
                  className="w-full h-full rounded-lg border border-border bg-card"
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
