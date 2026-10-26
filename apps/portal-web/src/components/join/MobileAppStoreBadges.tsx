"use client";

import React, { useEffect, useState } from "react";
import { getPortalApiUrl } from "@/utils/domain";

export interface MobileAppStoreBadgesProps {
  appleStoreUrl?: string;
  googlePlayUrl?: string;
  className?: string;
}

export const DEFAULT_APPLE_STORE_URL =
  "https://apps.apple.com/app/clinicez-patient/id647000000";
export const DEFAULT_GOOGLE_PLAY_URL =
  "https://play.google.com/store/apps/details?id=ph.clinicez.patient";

export function MobileAppStoreBadges({
  appleStoreUrl: propAppleUrl,
  googlePlayUrl: propGoogleUrl,
  className = "",
}: MobileAppStoreBadgesProps) {
  const [appleUrl, setAppleUrl] = useState<string | undefined>(
    propAppleUrl !== undefined ? propAppleUrl : DEFAULT_APPLE_STORE_URL
  );
  const [googleUrl, setGoogleUrl] = useState<string | undefined>(
    propGoogleUrl !== undefined ? propGoogleUrl : DEFAULT_GOOGLE_PLAY_URL
  );

  // If props change dynamically, respect incoming values
  useEffect(() => {
    if (propAppleUrl !== undefined) {
      setAppleUrl(propAppleUrl);
    }
  }, [propAppleUrl]);

  useEffect(() => {
    if (propGoogleUrl !== undefined) {
      setGoogleUrl(propGoogleUrl);
    }
  }, [propGoogleUrl]);

  // Optional background fetch from public settings if not provided via props
  useEffect(() => {
    if (propAppleUrl === undefined && propGoogleUrl === undefined) {
      const fetchPlatformSettings = async () => {
        try {
          const res = await fetch(`${getPortalApiUrl()}/public/settings`, {
            headers: { Accept: "application/json" },
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.appleAppStoreUrl) setAppleUrl(data.appleAppStoreUrl);
            if (data?.googlePlayStoreUrl) setGoogleUrl(data.googlePlayStoreUrl);
          }
        } catch {
          // Gracefully retain default production fallbacks
        }
      };
      fetchPlatformSettings();
    }
  }, [propAppleUrl, propGoogleUrl]);

  // If both URLs are empty or undefined, render nothing
  if (!appleUrl && !googleUrl) {
    return null;
  }

  return (
    <div
      className={`flex flex-wrap gap-3 items-center justify-center print:hidden ${className}`.trim()}
      data-testid="mobile-app-store-badges"
    >
      {appleUrl && (
        <a
          href={appleUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Download Clinic EZ Patient App on Apple App Store"
          className="inline-flex items-center gap-2.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white border border-slate-700/80 rounded-xl transition-all shadow-sm hover:shadow text-left"
        >
          {/* Apple Logo SVG */}
          <svg
            className="w-5 h-5 fill-current shrink-0"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.62-.75 1.04-1.8 0.92-2.85-.9.04-1.99.6-2.63 1.35-.57.65-1.06 1.71-.93 2.74 1.01.08 2.02-.49 2.64-1.24z" />
          </svg>
          <div>
            <span className="block text-[9px] leading-tight text-slate-400 font-medium">
              Download on the
            </span>
            <span className="block text-xs font-bold leading-tight tracking-wide">
              App Store
            </span>
          </div>
        </a>
      )}

      {googleUrl && (
        <a
          href={googleUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Download Clinic EZ Patient App on Google Play Store"
          className="inline-flex items-center gap-2.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white border border-slate-700/80 rounded-xl transition-all shadow-sm hover:shadow text-left"
        >
          {/* Google Play Logo SVG */}
          <svg
            className="w-5 h-5 fill-current shrink-0"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M3.609 1.814L13.792 12 3.61 22.186c-.365-.333-.61-.83-.61-1.406V3.22c0-.576.245-1.073.61-1.406zm11.235 11.238l2.062 2.063-11.45 6.612 9.388-8.675zm0-2.104L5.456 2.273l11.45 6.612-2.062 2.063zm1.484 1.052l3.498 2.02c1.049.606 1.049 1.593 0 2.199l-3.498 2.02-2.164-2.164 2.164-2.075z" />
          </svg>
          <div>
            <span className="block text-[9px] leading-tight text-slate-400 font-medium">
              GET IT ON
            </span>
            <span className="block text-xs font-bold leading-tight tracking-wide">
              Google Play
            </span>
          </div>
        </a>
      )}
    </div>
  );
}

export default MobileAppStoreBadges;
