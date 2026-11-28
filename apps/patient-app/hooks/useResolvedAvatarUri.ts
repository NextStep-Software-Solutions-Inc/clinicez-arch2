import { useEffect, useState } from 'react';
import { api } from '../services/api/apiClient';

const MAX_CACHE_ENTRIES = 64;
const resolvedCache = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();

function normalizeApiRelativePath(rawUri: string): string {
  const trimmed = rawUri.trim();
  if (trimmed.startsWith('/api/v1/')) {
    return trimmed.slice('/api/v1'.length);
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function blobToDisplayUri(blob: Blob): Promise<string | null> {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    return Promise.resolve(URL.createObjectURL(blob));
  }
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  }
  return Promise.resolve(null);
}

async function fetchProtectedAvatar(
  rawUri: string,
  getToken: () => Promise<string | null>,
): Promise<string | null> {
  const cached = resolvedCache.get(rawUri);
  if (cached) return cached;

  const pending = inFlight.get(rawUri);
  if (pending) return pending;

  const task = (async () => {
    try {
      const apiPath = normalizeApiRelativePath(rawUri);
      const blob = await api.getBlob(getToken, apiPath);
      if (!blob || blob.size === 0) return null;
      const displayUri = await blobToDisplayUri(blob);
      if (!displayUri) return null;

      if (resolvedCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = resolvedCache.keys().next().value;
        if (oldestKey) {
          const oldestUri = resolvedCache.get(oldestKey);
          resolvedCache.delete(oldestKey);
          if (oldestUri?.startsWith('blob:') && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
            try {
              URL.revokeObjectURL(oldestUri);
            } catch {
              // Ignore revoke errors
            }
          }
        }
      }
      resolvedCache.set(rawUri, displayUri);
      return displayUri;
    } catch {
      return null;
    } finally {
      inFlight.delete(rawUri);
    }
  })();

  inFlight.set(rawUri, task);
  return task;
}

/**
 * Resolves a patient avatar URI for React Native `<Image>`.
 * - External HTTPS / local file / data / blob URIs pass through immediately.
 * - Protected encrypted R2 avatar paths (`/api/v1/patients/{id}/avatar`) are fetched with the Clerk Bearer token and cached as a display URI.
 */
export function useResolvedAvatarUri(
  rawUri: string | null | undefined,
  getToken?: () => Promise<string | null>,
): string | null {
  const trimmed = rawUri?.trim() || null;
  const isProtectedApiPath = Boolean(trimmed && trimmed.startsWith('/'));

  const [uri, setUri] = useState<string | null>(() => {
    if (!trimmed) return null;
    if (!isProtectedApiPath) return trimmed;
    return resolvedCache.get(trimmed) ?? null;
  });

  useEffect(() => {
    if (!trimmed) {
      setUri(null);
      return;
    }
    if (!isProtectedApiPath) {
      setUri(trimmed);
      return;
    }
    const cached = resolvedCache.get(trimmed);
    if (cached) {
      setUri(cached);
      return;
    }
    if (!getToken) {
      setUri(null);
      return;
    }

    let active = true;
    void fetchProtectedAvatar(trimmed, getToken).then((resolved) => {
      if (active) setUri(resolved);
    });
    return () => {
      active = false;
    };
  }, [trimmed, isProtectedApiPath, getToken]);

  return uri;
}
