import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useAuth } from 'contexts/AuthContext';
import { ApiError } from 'services/api/apiClient';
import { createShareCode, type ShareCodeResponse } from 'services/api/sharingApi';
import type { SharingScope } from 'services/api/wireEnums';
import { shareCodeFailureMessage, watchCodeExpiry } from 'services/sharing/shareCode';

export interface ShareCodeState {
  /** The live code; null before generating, after expiry and whenever the screen is blurred. */
  code: ShareCodeResponse | null;
  secondsLeft: number;
  /** True once a displayed code ran out, until the next generate. */
  expired: boolean;
  error: string | null;
  isGenerating: boolean;
  generate: () => Promise<void>;
}

/**
 * Creates a one-time share code and counts it down. The code is dropped from memory when it
 * expires, when the screen loses focus and when it unmounts, so it never lingers on screen.
 */
export function useShareCode(patientId: string, scopes: readonly SharingScope[]): ShareCodeState {
  const { getToken } = useAuth();
  const isFocused = useIsFocused();
  const [code, setCode] = useState<ShareCodeResponse | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const stopWatchRef = useRef<(() => void) | null>(null);
  const generationRef = useRef(0);

  const clear = useCallback(() => {
    generationRef.current += 1;
    stopWatchRef.current?.();
    stopWatchRef.current = null;
    setCode(null);
    setSecondsLeft(0);
    setIsGenerating(false);
  }, []);

  useEffect(() => {
    if (!isFocused) clear();
  }, [isFocused, clear]);

  useEffect(
    () => () => {
      generationRef.current += 1;
      stopWatchRef.current?.();
    },
    [],
  );

  const generate = useCallback(async () => {
    stopWatchRef.current?.();
    stopWatchRef.current = null;
    generationRef.current += 1;
    const generation = generationRef.current;
    setCode(null);
    setExpired(false);
    setError(null);
    setIsGenerating(true);
    try {
      const response = await createShareCode(getToken, patientId, [...scopes]);
      if (generation !== generationRef.current) return;
      setCode(response);
      setIsGenerating(false);
      stopWatchRef.current = watchCodeExpiry({
        expiresAtMs: Date.now() + response.ttlSeconds * 1000,
        onTick: setSecondsLeft,
        onExpire: () => {
          stopWatchRef.current = null;
          setCode(null);
          setExpired(true);
        },
      });
    } catch (err) {
      if (generation !== generationRef.current) return;
      setIsGenerating(false);
      setError(err instanceof ApiError ? shareCodeFailureMessage(err.status, err.firstMessage) : shareCodeFailureMessage(0, ''));
    }
  }, [getToken, patientId, scopes]);

  return { code, secondsLeft, expired, error, isGenerating, generate };
}
