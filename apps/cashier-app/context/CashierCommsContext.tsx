import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CommsProvider } from '@clinicez/comms-sdk/react';
import type { CommsTicketResponse } from '@clinicez/comms-sdk/react';
import { billingApiClient } from '../services/apiClient';
import { useAuth } from '../components/AuthGate';

export interface CashierCommsContextValue {
  isChatOpen: boolean;
  toggleChat: () => void;
  openChat: () => void;
  closeChat: () => void;
  activeConversationId: string | undefined;
  setActiveConversationId: (id?: string) => void;
}

const CashierCommsContext = createContext<CashierCommsContextValue>({
  isChatOpen: false,
  toggleChat: () => {},
  openChat: () => {},
  closeChat: () => {},
  activeConversationId: undefined,
  setActiveConversationId: () => {},
});

export const useCashierComms = () => useContext(CashierCommsContext);

export function getCommsApiBaseUrl(): string {
  const commsUrl = process.env.EXPO_PUBLIC_COMMS_API_URL;
  if (commsUrl && commsUrl.trim()) {
    return commsUrl.trim().replace(/\/+$/, '');
  }
  throw new Error('EXPO_PUBLIC_COMMS_API_URL is required and must be configured in environment variables.');
}

export function CashierCommsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(undefined);

  const toggleChat = useCallback(() => setIsChatOpen((prev) => !prev), []);
  const openChat = useCallback(() => setIsChatOpen(true), []);
  const closeChat = useCallback(() => setIsChatOpen(false), []);

  const getCommsTicket = useCallback(async (): Promise<CommsTicketResponse> => {
    const [data, err] = await billingApiClient.post<{ ticket: string; expiresAtUtc: string }>('/comms/ticket');
    if (err || !data) {
      throw new Error(err?.message || 'Failed to acquire billing comms ticket.');
    }
    return {
      ticket: data.ticket,
      expiresAtUtc: data.expiresAtUtc,
    };
  }, []);

  const tenantId = user?.tenantId || 'default';
  const facilityId = user?.facilityId || 'billing-counter';
  const staffId = user?.id || 'cashier-staff';
  const staffDisplayName = user?.fullName || 'Cashier Counter Staff';

  const contextValue = useMemo<CashierCommsContextValue>(
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
      <CashierCommsContext.Provider value={contextValue}>
        {children}
      </CashierCommsContext.Provider>
    </CommsProvider>
  );
}
