import axios from "axios";
import { apiBaseUrl } from "@/transport/apiClient";

/** Default of `LabUploads:MaxFileBytes` in portal-api; override with NEXT_PUBLIC_LAB_UPLOAD_MAX_BYTES when the API's limit differs. */
const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024;

const configuredMax = Number(process.env.NEXT_PUBLIC_LAB_UPLOAD_MAX_BYTES);
export const LAB_UPLOAD_MAX_BYTES = Number.isFinite(configuredMax) && configuredMax > 0 ? configuredMax : DEFAULT_MAX_FILE_BYTES;

/** Mirrors `LabUploads:AllowedContentTypes` in portal-api. */
export const LAB_UPLOAD_CONTENT_TYPES: readonly string[] = ["application/pdf", "image/jpeg", "image/png"];

/**
 * What the relay answered. `accepted` is shown identically whether or not the link named a live clinic: the API
 * deliberately cannot be asked whether a token is valid.
 */
export type LabUploadOutcome =
  | { kind: "accepted" }
  | { kind: "too_large" }
  | { kind: "unsupported_type" }
  | { kind: "invalid"; message: string }
  | { kind: "rate_limited" }
  | { kind: "failed" };

export const labUploadService = {
  /** Anonymous multipart upload (`file`, optional `labName`). Never sends credentials. */
  submit: async (token: string, file: File, labName: string, onProgress?: (percent: number) => void): Promise<LabUploadOutcome> => {
    const form = new FormData();
    form.append("file", file);
    if (labName.trim()) form.append("labName", labName.trim());

    try {
      const res = await axios.post<{ message?: string }>(`${apiBaseUrl}/public/lab-uploads/${encodeURIComponent(token)}`, form, {
        validateStatus: () => true,
        onUploadProgress: (event) => {
          if (event.total && onProgress) onProgress(Math.round((event.loaded * 100) / event.total));
        },
      });

      if (res.status === 202) return { kind: "accepted" };
      if (res.status === 413) return { kind: "too_large" };
      if (res.status === 415) return { kind: "unsupported_type" };
      if (res.status === 400) return { kind: "invalid", message: res.data?.message || "The file is empty or does not match its type." };
      if (res.status === 429) return { kind: "rate_limited" };
      return { kind: "failed" };
    } catch {
      return { kind: "failed" };
    }
  },
};
