import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CommsProvider } from '@clinicez/comms-sdk/react';
import type { CommsTicketResponse } from '@clinicez/comms-sdk/react';
import { pharmacyApiClient } from '../services/apiClient';
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
  const commsUrl = process.env.EXPO_PUBLIC_COMMS_API_URL;
  if (commsUrl && commsUrl.trim()) {
    return commsUrl.trim().replace(/\/+$/, '');
  }
  throw new Error('EXPO_PUBLIC_COMMS_API_URL is required and must be configured in environment variables.');
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
