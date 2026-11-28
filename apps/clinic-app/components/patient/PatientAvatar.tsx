import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ThemedText } from '@ui';
import { theme } from '@constants/theme';
import { clinicApiClient } from '../../services/apiClient';
import { getApiBaseUrl } from '../../services/runtimeConfig';

const MAX_CACHE_SIZE = 150;
const avatarBlobCache = new Map<string, string>();
const inFlightFetches = new Map<string, Promise<string | null>>();

function resolveClinicAvatarEndpointUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  const base = (getApiBaseUrl() ?? '').replace(/\/+$/, '');
  if (!base) return trimmed;
  if (base.endsWith('/api/v1') && trimmed.startsWith('/api/v1/')) {
    return `${base}${trimmed.slice('/api/v1'.length)}`;
  }
  return `${base}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
}

function readBlobAsDataUrl(blob: Blob): Promise<string | null> {
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

async function fetchAuthenticatedAvatarUri(rawUrl: string): Promise<string | null> {
  const cached = avatarBlobCache.get(rawUrl);
  if (cached) return cached;

  const existing = inFlightFetches.get(rawUrl);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const requestUrl = resolveClinicAvatarEndpointUrl(rawUrl);
      const [blob, error] = await clinicApiClient.getBlob(requestUrl);
      if (!blob || error || blob.size === 0) return null;
      const uri = await readBlobAsDataUrl(blob);
      if (!uri) return null;

      if (avatarBlobCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = avatarBlobCache.keys().next().value;
        if (oldestKey) {
          const oldestVal = avatarBlobCache.get(oldestKey);
          avatarBlobCache.delete(oldestKey);
          if (oldestVal?.startsWith('blob:') && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
            try {
              URL.revokeObjectURL(oldestVal);
            } catch {
              // Ignore revoke errors
            }
          }
        }
      }
      avatarBlobCache.set(rawUrl, uri);
      return uri;
    } catch {
      return null;
    } finally {
      inFlightFetches.delete(rawUrl);
    }
  })();

  inFlightFetches.set(rawUrl, promise);
  return promise;
}

export function usePatientAvatarUri(avatarUrl?: string | null): string | null {
  const trimmed = avatarUrl?.trim() || null;
  const isProtectedPath = Boolean(trimmed && trimmed.startsWith('/'));

  const [resolvedUri, setResolvedUri] = useState<string | null>(() => {
    if (!trimmed) return null;
    if (!isProtectedPath) return trimmed;
    return avatarBlobCache.get(trimmed) ?? null;
  });

  useEffect(() => {
    if (!trimmed) {
      setResolvedUri(null);
      return;
    }
    if (!isProtectedPath) {
      setResolvedUri(trimmed);
      return;
    }
    const cached = avatarBlobCache.get(trimmed);
    if (cached) {
      setResolvedUri(cached);
      return;
    }

    let active = true;
    void fetchAuthenticatedAvatarUri(trimmed).then((uri) => {
      if (active) setResolvedUri(uri);
    });
    return () => {
      active = false;
    };
  }, [trimmed, isProtectedPath]);

  return resolvedUri;
}

export interface PatientAvatarProps {
  avatarUrl?: string | null;
  initials: string;
  size: number;
  containerStyle?: StyleProp<ViewStyle>;
  textVariant?: 'captionBold' | 'smallBold' | 'bodyBold' | 'title';
  textColor?: string;
}

export function PatientAvatar({
  avatarUrl,
  initials,
  size,
  containerStyle,
  textVariant = 'smallBold',
  textColor = theme.colors.primaryDark,
}: PatientAvatarProps) {
  const resolvedUri = usePatientAvatarUri(avatarUrl);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [resolvedUri]);

  const borderRadius = size / 2;

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius }, containerStyle]}>
      {resolvedUri && !failed ? (
        <Image
          source={{ uri: resolvedUri }}
          style={{ width: size, height: size, borderRadius }}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <ThemedText variant={textVariant} color={textColor}>
          {initials}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
