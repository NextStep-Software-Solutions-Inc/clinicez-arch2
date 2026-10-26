import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CommsProvider } from '@clinicez/comms-sdk/react';
import type { CommsTicketResponse } from '@clinicez/comms-sdk/react';
import { resolveServiceApiUrl } from '@shared/safe';
import { labApiClient } from '../services/apiClient';
import { getLabApiBaseUrl } from '../services/runtimeConfig';
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
  if (process.env.EXPO_PUBLIC_COMMS_API_URL) {
    return process.env.EXPO_PUBLIC_COMMS_API_URL.replace(/\/+$/, '');
  }
  const apiBase = getLabApiBaseUrl();
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
