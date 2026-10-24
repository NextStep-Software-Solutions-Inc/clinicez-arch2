/**
 * Silent 80% image compression before local caching and cloud upload.
 * Intentionally emits zero UI state, logs, or user-facing notifications.
 */

export const IMAGE_UPLOAD_QUALITY = 0.8;
const MAX_CANVAS_DIMENSION = 4096;

const COMPRESSIBLE_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export interface CompressBlobInput {
  blob: Blob;
  fileName: string;
  mimeType: string;
  quality?: number;
  /** Optional encoder override for deterministic non-DOM unit tests. */
  encodeFn?: (
    blob: Blob,
    targetMimeType: string,
    quality: number
  ) => Promise<{ blob: Blob; mimeType: string } | null>;
}

export interface CompressedUploadPayload {
  blob: Blob;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export function isCompressibleImageMime(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  return COMPRESSIBLE_IMAGE_MIMES.has(mimeType.trim().toLowerCase());
}

/**
 * Resolves the target lossy canvas MIME type so `quality = 0.8` actually takes effect:
 * - `image/jpeg` / `image/jpg` -> `image/jpeg`
 * - `image/webp` -> `image/webp`
 * - `image/png` -> `image/webp` (supports both 80% quality compression and alpha transparency;
 *   browsers ignore the quality parameter when encoding `image/png`).
 */
export function resolveCompressionTargetMime(mimeType: string): string {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') {
    return 'image/jpeg';
  }
  return 'image/webp';
}

function clampDimensions(width: number, height: number): { width: number; height: number } {
  if (width <= MAX_CANVAS_DIMENSION && height <= MAX_CANVAS_DIMENSION) {
    return { width, height };
  }
  const scale = MAX_CANVAS_DIMENSION / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function decodeAndEncodeOnDomCanvas(
  sourceBlob: Blob,
  targetMimeType: string,
  quality: number
): Promise<{ blob: Blob; mimeType: string } | null> {
  if (typeof document === 'undefined') {
    return null;
  }

  let bitmap: ImageBitmap | null = null;
  let objectUrl: string | null = null;

  try {
    let sourceWidth = 0;
    let sourceHeight = 0;
    let drawSource: CanvasImageSource;

    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(sourceBlob);
      sourceWidth = bitmap.width;
      sourceHeight = bitmap.height;
      drawSource = bitmap;
    } else if (typeof Image !== 'undefined' && typeof URL !== 'undefined') {
      objectUrl = URL.createObjectURL(sourceBlob);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('Image decode failed'));
        element.src = objectUrl!;
      });
      sourceWidth = img.naturalWidth || img.width;
      sourceHeight = img.naturalHeight || img.height;
      drawSource = img;
    } else {
      return null;
    }

    if (!sourceWidth || !sourceHeight) {
      return null;
    }

    const { width, height } = clampDimensions(sourceWidth, sourceHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(drawSource, 0, 0, width, height);

    const toBlobAsync = (mime: string): Promise<Blob | null> =>
      new Promise((resolve) => {
        canvas.toBlob((out) => resolve(out), mime, quality);
      });

    let encoded = await toBlobAsync(targetMimeType);
    let finalMime = targetMimeType;

    // If browser lacked WebP encoding support and fell back to uncompressed image/png, retry as JPEG
    if (
      targetMimeType === 'image/webp' &&
      (!encoded || (encoded.type && encoded.type.toLowerCase() === 'image/png'))
    ) {
      const jpegFallback = await toBlobAsync('image/jpeg');
      if (jpegFallback) {
        encoded = jpegFallback;
        finalMime = 'image/jpeg';
      }
    }

    if (!encoded || encoded.size === 0) {
      return null;
    }

    return {
      blob: encoded,
      mimeType: encoded.type || finalMime,
    };
  } finally {
    if (bitmap && typeof bitmap.close === 'function') {
      try {
        bitmap.close();
      } catch {
        // Ignore cleanup errors
      }
    }
    if (objectUrl && typeof URL !== 'undefined') {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

/**
 * Silently compresses compressible images at 80% (`0.8`) quality.
 * - Non-image files (e.g. `application/pdf`) pass through untouched.
 * - Keeps original bytes & MIME type if compressed output is not strictly smaller.
 * - Preserves `fileName` unchanged so compression remains invisible to the user.
 */
export async function compressWebBlobForUpload(
  input: CompressBlobInput
): Promise<CompressedUploadPayload> {
  const { blob, fileName, mimeType } = input;
  const quality = input.quality ?? IMAGE_UPLOAD_QUALITY;
  const normalizedMime = (mimeType || blob.type || 'application/octet-stream').trim();

  const passthrough: CompressedUploadPayload = {
    blob,
    fileName,
    mimeType: normalizedMime,
    sizeBytes: blob.size,
  };

  if (!isCompressibleImageMime(normalizedMime) || blob.size === 0) {
    return passthrough;
  }

  try {
    const targetMime = resolveCompressionTargetMime(normalizedMime);
    const encoder = input.encodeFn ?? decodeAndEncodeOnDomCanvas;
    const result = await encoder(blob, targetMime, quality);

    if (!result || result.blob.size === 0 || result.blob.size >= blob.size) {
      return passthrough;
    }

    return {
      blob: result.blob,
      fileName,
      mimeType: result.mimeType || targetMime,
      sizeBytes: result.blob.size,
    };
  } catch {
    return passthrough;
  }
}
