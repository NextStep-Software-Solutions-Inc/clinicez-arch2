import React from 'react';
import { useAuth } from '@clerk/clerk-react';
import { setupAxiosInterceptors } from '@/lib/api';

interface ApiProviderProps {
  children: React.ReactNode;
}

/**
 * Synchronously binds Clerk's live getToken() function to the shared Axios apiClient
 * before any child route mounts or dispatches administrative API requests.
 */
export function ApiProvider({ children }: ApiProviderProps) {
  const { getToken } = useAuth();
  setupAxiosInterceptors(getToken);

  return <>{children}</>;
}
