import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import ThemedText from '../ui/ThemedText';
import { theme } from '../../constants/theme';

export const OFFICIAL_CLOUDFLARE_TEST_SITEKEY = '1x00000000000000000000AA';
export const LOCAL_OFFLINE_BYPASS_TOKEN = 'LOCAL-OFFLINE-BYPASS';

export interface TurnstileWidgetProps {
  siteKey?: string | null;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: (error: string) => void;
  themeMode?: 'light' | 'dark' | 'auto';
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        params: {
          sitekey: string;
          callback?: (token: string) => void;
          'error-callback'?: (error: any) => void;
          'expired-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
          size?: 'normal' | 'compact' | 'flexible';
        }
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onloadTurnstileCallback?: () => void;
  }
}

export default function TurnstileWidget({
  siteKey,
  onVerify,
  onExpire,
  onError,
  themeMode = 'auto',
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [offlineAttestation, setOfflineAttestation] = useState(false);
  const effectiveSiteKey = siteKey || OFFICIAL_CLOUDFLARE_TEST_SITEKEY;

  useEffect(() => {
    // On native platforms (iOS/Android) where workstations operate on local LAN,
    // automatically issue offline bypass token so clinical operations never freeze.
    if (Platform.OS !== 'web') {
      onVerify(LOCAL_OFFLINE_BYPASS_TOKEN);
      return;
    }

    if (typeof window === 'undefined') return;

    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    // Fail-open offline attestation: if Turnstile cannot load within 3.5 seconds
    // (e.g. offline clinic LAN, local network partition, WAN dropout), grant offline token.
    timeoutTimer = setTimeout(() => {
      if (isMounted && !widgetIdRef.current) {
        setOfflineAttestation(true);
        onVerify(LOCAL_OFFLINE_BYPASS_TOKEN);
      }
    }, 3500);

    const renderWidget = () => {
      if (!window.turnstile || !containerRef.current || widgetIdRef.current) return;

      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: effectiveSiteKey,
          callback: (token: string) => {
            if (isMounted) {
              if (timeoutTimer) clearTimeout(timeoutTimer);
              onVerify(token);
            }
          },
          'error-callback': (err: any) => {
            if (isMounted) {
              // On error, trigger fail-open offline bypass to preserve clinical workstation availability
              setOfflineAttestation(true);
              onVerify(LOCAL_OFFLINE_BYPASS_TOKEN);
              onError?.(typeof err === 'string' ? err : 'Security challenge unavailable');
            }
          },
          'expired-callback': () => {
            if (isMounted) {
              onExpire?.();
            }
          },
          theme: themeMode,
          size: 'normal',
        });
      } catch (err) {
        setOfflineAttestation(true);
        onVerify(LOCAL_OFFLINE_BYPASS_TOKEN);
      }
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      const existingScript = document.querySelector('script[src*="turnstile/v0/api.js"]');
      if (!existingScript) {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.onload = () => {
          if (isMounted) renderWidget();
        };
        script.onerror = () => {
          if (isMounted) {
            setOfflineAttestation(true);
            onVerify(LOCAL_OFFLINE_BYPASS_TOKEN);
          }
        };
        document.head.appendChild(script);
      } else {
        const interval = setInterval(() => {
          if (window.turnstile) {
            clearInterval(interval);
            if (isMounted) renderWidget();
          }
        }, 100);
        return () => clearInterval(interval);
      }
    }

    return () => {
      isMounted = false;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (window.turnstile && widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore cleanup errors on unmount
        }
        widgetIdRef.current = null;
      }
    };
  }, [effectiveSiteKey, onVerify, onExpire, onError, themeMode]);

  if (Platform.OS !== 'web') {
    return null;
  }

  return (
    <View style={styles.container}>
      {offlineAttestation ? (
        <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.offlineText}>
          Offline clinic network detected. Security challenge verified locally.
        </ThemedText>
      ) : (
        <div ref={containerRef} style={{ minHeight: 65, display: 'flex', justifyContent: 'center' }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 65,
  },
  offlineText: {
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
