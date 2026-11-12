import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CommsProvider } from '@clinicez/comms-sdk/react';
import type { CommsTicketResponse } from '@clinicez/comms-sdk/react';
import { clinicApiClient } from '../services/apiClient';
import { getApiBaseUrl, getSetting } from '../services/runtimeConfig';
import { useAuth } from './AuthContext';
import { useClinic } from './ClinicContext';
import { useStaff, formatStaffName } from './StaffContext';

export interface TeleconsultSessionParams {
  callId: string;
  appointmentId?: string;
  patientName: string;
  clinicianName: string;
  scheduledTime: string;
  paymentPolicy?: 'Prepaid' | 'Postpaid' | 'Exempt';
  paymentStatus?: 'Unpaid' | 'Paid' | 'Exempt' | 'Overridden';
  isYakapExempt?: boolean;
}

export interface ClinicCommsContextValue {
  isChatDrawerOpen: boolean;
  toggleChatDrawer: () => void;
  openChatDrawer: () => void;
  closeChatDrawer: () => void;
  activeConversationId: string | undefined;
  setActiveConversationId: (id?: string) => void;
  teleconsultSession: TeleconsultSessionParams | null;
  openTeleconsultWaitingRoom: (params: TeleconsultSessionParams) => void;
  closeTeleconsultWaitingRoom: () => void;
}

const ClinicCommsContext = createContext<ClinicCommsContextValue>({
  isChatDrawerOpen: false,
  toggleChatDrawer: () => {},
  openChatDrawer: () => {},
  closeChatDrawer: () => {},
  activeConversationId: undefined,
  setActiveConversationId: () => {},
  teleconsultSession: null,
  openTeleconsultWaitingRoom: () => {},
  closeTeleconsultWaitingRoom: () => {},
});

export const useClinicComms = () => useContext(ClinicCommsContext);

export function getCommsApiBaseUrl(): string {
  const commsUrl = getSetting('EXPO_PUBLIC_COMMS_API_URL') || process.env.EXPO_PUBLIC_COMMS_API_URL;
  if (commsUrl && commsUrl.trim()) {
    return commsUrl.trim().replace(/\/+$/, '');
  }
  throw new Error('EXPO_PUBLIC_COMMS_API_URL is required and must be configured in environment variables or runtime settings.');
}

export function ClinicCommsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { license } = useClinic();
  const { current, currentName } = useStaff();

  const [isChatDrawerOpen, setIsChatDrawerOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(undefined);
  const [teleconsultSession, setTeleconsultSession] = useState<TeleconsultSessionParams | null>(null);

  const toggleChatDrawer = useCallback(() => {
    setIsChatDrawerOpen((prev) => !prev);
  }, []);

  const openChatDrawer = useCallback(() => {
    setIsChatDrawerOpen(true);
  }, []);

  const closeChatDrawer = useCallback(() => {
    setIsChatDrawerOpen(false);
  }, []);

  const openTeleconsultWaitingRoom = useCallback((params: TeleconsultSessionParams) => {
    setTeleconsultSession(params);
  }, []);

  const closeTeleconsultWaitingRoom = useCallback(() => {
    setTeleconsultSession(null);
  }, []);

  const isAuthenticated = Boolean(user?.id && (license?.clinicId || user?.clinicId));

  const tenantId = user?.tenantId || '';
  const facilityId = license?.clinicId || user?.clinicId || '';
  const staffId = user?.id || '';
  const staffDisplayName = currentName || (current ? formatStaffName(current) : user?.name || 'Clinic Staff');

  const getCommsTicket = useCallback(async (): Promise<CommsTicketResponse> => {
    if (!user?.id) {
      throw new Error('User not authenticated; cannot acquire clinic communications ticket.');
    }
    const [data, err] = await clinicApiClient.post<{ ticket: string; expiresAtUtc: string }>('/comms/ticket');
    if (!err && data?.ticket) {
      return {
        ticket: data.ticket,
        expiresAtUtc: data.expiresAtUtc,
      };
    }

    console.warn('[ClinicCommsContext] Server ticket endpoint failed or unconfigured, utilizing fallback development ticket:', err?.message);

    // Fallback development ticket for environments where facility messaging signing key is not configured in container env
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAt = new Date(Date.now() + 300 * 1000);
    const payload = {
      sub: user.id,
      name: staffDisplayName,
      tenant_id: tenantId || 'nextstep',
      facility_id: facilityId || 'nextstep',
      permissions: user.permissions?.length ? user.permissions : ['messaging:read', 'messaging:write', 'messaging:triage'],
      iss: 'clinic-fallback',
      iat: nowSec,
      nbf: nowSec - 30,
      exp: Math.floor(expiresAt.getTime() / 1000),
      jti: `ticket-${Date.now()}`,
    };

    const b64Payload = typeof btoa === 'function'
      ? btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      : Buffer.from(JSON.stringify(payload)).toString('base64url');

    const devTicket = `${b64Payload}.dev-sig`;
    return {
      ticket: devTicket,
      expiresAtUtc: expiresAt.toISOString(),
    };
  }, [user?.id, user?.permissions, staffDisplayName, tenantId, facilityId]);

  const contextValue = useMemo<ClinicCommsContextValue>(
    () => ({
      isChatDrawerOpen,
      toggleChatDrawer,
      openChatDrawer,
      closeChatDrawer,
      activeConversationId,
      setActiveConversationId,
      teleconsultSession,
      openTeleconsultWaitingRoom,
      closeTeleconsultWaitingRoom,
    }),
    [
      isChatDrawerOpen,
      toggleChatDrawer,
      openChatDrawer,
      closeChatDrawer,
      activeConversationId,
      teleconsultSession,
      openTeleconsultWaitingRoom,
      closeTeleconsultWaitingRoom,
    ],
  );

  return (
    <CommsProvider
      baseUrl={getCommsApiBaseUrl()}
      getCommsTicket={getCommsTicket}
      tenantId={tenantId}
      facilityId={facilityId}
      staffId={staffId}
      staffDisplayName={staffDisplayName}
      options={{ autoConnect: isAuthenticated }}
    >
      <ClinicCommsContext.Provider value={contextValue}>
        {children}
      </ClinicCommsContext.Provider>
    </CommsProvider>
  );
}
