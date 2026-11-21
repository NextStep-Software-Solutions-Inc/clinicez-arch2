"use client";

import { ReactNode, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { setupAxiosInterceptors, apiClient } from "@/transport/apiClient";
import { sanitizeStaleClerkBillingHash } from "@/lib/clerkAppearance";
import { SWRConfig } from "swr";

interface ApiProviderProps {
  children: ReactNode;
}

export function ApiProvider({ children }: ApiProviderProps) {
  const { getToken } = useAuth();

  // Initialize Axios Interceptors with the Clerk getToken function
  setupAxiosInterceptors(getToken);

  // Strip any stale #/billing hash globally on mount and navigation so Clerk's
  // <UserButton /> in SiteHeader / Navigation / AdminLayoutClient never opens a blank pane.
  useEffect(() => {
    const cleanStaleHash = () => sanitizeStaleClerkBillingHash();
    cleanStaleHash();
    window.addEventListener("hashchange", cleanStaleHash);
    window.addEventListener("popstate", cleanStaleHash);
    return () => {
      window.removeEventListener("hashchange", cleanStaleHash);
      window.removeEventListener("popstate", cleanStaleHash);
    };
  }, []);

  return (
    <SWRConfig
      value={{
        // Global fetcher using our configured Axios instance
        fetcher: (url: string) => apiClient.get(url).then((res) => res.data),
        revalidateOnFocus: false,
      }}
    >
      {children}
    </SWRConfig>
  );
}
