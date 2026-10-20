import React, { useMemo } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { isVercelTelemetryAllowed, sanitizeAnalyticsUrl } from '@shared/safe';

export function VercelInsights(): React.JSX.Element | null {
  const isAllowed = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const envOverride = process.env.EXPO_PUBLIC_ENABLE_VERCEL_ANALYTICS;
    const isVercelEnv = process.env.VERCEL === '1' || process.env.EXPO_PUBLIC_VERCEL === '1';
    if (isVercelEnv && envOverride !== 'false') return true;
    return isVercelTelemetryAllowed(window.location?.hostname, envOverride);
  }, []);

  if (!isAllowed) return null;

  return (
    <>
      <Analytics
        beforeSend={(event) => {
          return {
            ...event,
            url: sanitizeAnalyticsUrl(event.url),
          };
        }}
      />
      <SpeedInsights
        beforeSend={(event) => {
          return {
            ...event,
            url: sanitizeAnalyticsUrl(event.url),
          };
        }}
      />
    </>
  );
}
