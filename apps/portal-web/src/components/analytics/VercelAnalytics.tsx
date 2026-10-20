'use client';

import React from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { sanitizeAnalyticsUrl } from '@shared/safe';

export function VercelAnalytics(): React.JSX.Element {
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
