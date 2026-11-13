import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CommsProvider } from '@clinicez/comms-sdk/react';
import type { CommsTicketResponse } from '@clinicez/comms-sdk/react';
import { labApiClient } from '../services/apiClient';
import { useFacilityLicense } from '../components/FacilityActivationGate';

export interface LabCommsContextValue {
  isChatOpen: boolean;
  toggleChat: () => void;
  openChat: () => void;
  closeChat: () => void;
  activeConversationId: string | undefined;
  setActiveConversationId: (id?: string) => void;
}

const LabCommsContext = createContext<LabCommsContextValue>({
  isChatOpen: false,
  toggleChat: () => {},
  openChat: () => {},
  closeChat: () => {},
  activeConversationId: undefined,
  setActiveConversationId: () => {},
});

export const useLabComms = () => useContext(LabCommsContext);

export function getCommsApiBaseUrl(): string {
  const commsUrl = process.env.EXPO_PUBLIC_COMMS_API_URL;
  if (commsUrl && commsUrl.trim()) {
    return commsUrl.trim().replace(/\/+$/, '');
  }
  throw new Error('EXPO_PUBLIC_COMMS_API_URL is required and must be configured in environment variables.');
}

export function LabCommsProvider({ children }: { children: React.ReactNode }) {
  const { license } = useFacilityLicense();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(undefined);

  const toggleChat = useCallback(() => setIsChatOpen((prev) => !prev), []);
  const openChat = useCallback(() => setIsChatOpen(true), []);
  const closeChat = useCallback(() => setIsChatOpen(false), []);

  const getCommsTicket = useCallback(async (): Promise<CommsTicketResponse> => {
    const [data, err] = await labApiClient.post<{ ticket: string; expiresAtUtc: string }>('/comms/ticket');
    if (err || !data) {
      throw new Error(err?.message || 'Failed to acquire laboratory comms ticket.');
    }
    return {
      ticket: data.ticket,
      expiresAtUtc: data.expiresAtUtc,
    };
  }, []);

  const tenantId = (license as any)?.tenantId || 'default';
  const facilityId = license?.laboratoryId || 'default-lab';
  const staffId = 'lab-staff';
  const staffDisplayName = license?.laboratoryName || 'Diagnostic Laboratory Staff';

  const contextValue = useMemo<LabCommsContextValue>(
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
      <LabCommsContext.Provider value={contextValue}>
        {children}
      </LabCommsContext.Provider>
    </CommsProvider>
  );
}
