"use client";

import { useEffect, ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { setupAxiosInterceptors, apiClient } from "@/transport/apiClient";
import { SWRConfig } from "swr";

interface ApiProviderProps {
  children: ReactNode;
}

export function ApiProvider({ children }: ApiProviderProps) {
  const { getToken } = useAuth();

  // Initialize Axios Interceptors with the Clerk getToken function
  useEffect(() => {
    setupAxiosInterceptors(getToken);
  }, [getToken]);

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
