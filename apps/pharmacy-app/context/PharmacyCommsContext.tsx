import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CommsProvider } from '@clinicez/comms-sdk/react';
import type { CommsTicketResponse } from '@clinicez/comms-sdk/react';
import { resolveServiceApiUrl } from '@shared/safe';
import { pharmacyApiClient } from '../services/apiClient';
import { getPharmacyApiBaseUrl } from '../services/runtimeConfig';
import { useAuth } from '../components/AuthGate';

export interface PharmacyCommsContextValue {
  isChatOpen: boolean;
  toggleChat: () => void;
  openChat: () => void;
  closeChat: () => void;
  activeConversationId: string | undefined;
  setActiveConversationId: (id?: string) => void;
}

const PharmacyCommsContext = createContext<PharmacyCommsContextValue>({
  isChatOpen: false,
  toggleChat: () => {},
  openChat: () => {},
  closeChat: () => {},
  activeConversationId: undefined,
  setActiveConversationId: () => {},
});

export const usePharmacyComms = () => useContext(PharmacyCommsContext);

export function getCommsApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_COMMS_API_URL) {
    return process.env.EXPO_PUBLIC_COMMS_API_URL.replace(/\/+$/, '');
  }
  const apiBase = getPharmacyApiBaseUrl();
  try {
    const url = new URL(apiBase);
    url.pathname = '';
    if (url.port === '5245' || url.port === '5240' || url.port === '5242' || url.port === '5243' || url.port === '5310') {
      url.port = '5247';
      return url.origin;
    }
    return `${url.protocol}//comms.${url.host}`;
  } catch {
    // fallback
  }
  return resolveServiceApiUrl({ fallbackPort: 5247 });
}

export function PharmacyCommsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(undefined);

  const toggleChat = useCallback(() => setIsChatOpen((prev) => !prev), []);
  const openChat = useCallback(() => setIsChatOpen(true), []);
  const closeChat = useCallback(() => setIsChatOpen(false), []);

  const getCommsTicket = useCallback(async (): Promise<CommsTicketResponse> => {
    const [data, err] = await pharmacyApiClient.post<{ ticket: string; expiresAtUtc: string }>('/comms/ticket');
    if (err || !data) {
      throw new Error(err?.message || 'Failed to acquire pharmacy comms ticket.');
    }
    return {
      ticket: data.ticket,
      expiresAtUtc: data.expiresAtUtc,
    };
  }, []);

  const tenantId = user?.tenantId || '';
  const facilityId = user?.pharmacyId || '';
  const staffId = user?.id || '';
  const staffDisplayName = user?.name || 'Pharmacy Staff';

  const contextValue = useMemo<PharmacyCommsContextValue>(
    () => ({
      isChatOpen,
      toggleChat,
      openChat,
      closeChat,
      activeConversationId,
      setActiveConversationId,
    }),
    [isChatOpen, toggleChat, openChat, closeChat, activeConversationId],
  );

  return (
    <CommsProvider
      baseUrl={getCommsApiBaseUrl()}
      getCommsTicket={getCommsTicket}
      tenantId={tenantId}
      facilityId={facilityId}
      staffId={staffId}
      staffDisplayName={staffDisplayName}
      options={{ autoConnect: true }}
    >
      <PharmacyCommsContext.Provider value={contextValue}>
        {children}
      </PharmacyCommsContext.Provider>
    </CommsProvider>
  );
}
