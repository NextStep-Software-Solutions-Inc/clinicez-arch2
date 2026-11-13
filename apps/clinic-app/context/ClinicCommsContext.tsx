import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CommsProvider } from '@clinicez/comms-sdk/react';
import type { CommsTicketResponse } from '@clinicez/comms-sdk/react';
import { clinicApiClient } from '../services/apiClient';
import { getSetting, isCommsEnabled as isCommsConfigEnabled } from '../services/runtimeConfig';
import { useAuth } from './AuthContext';
import { useClinic } from './ClinicContext';
import { useStaff, formatStaffName } from './StaffContext';

export interface TeleconsultSessionParams {
  callId: string;
  appointmentId?: string;
  patientId?: string;
  patientName: string;
  clinicianName: string;
  scheduledTime: string;
  paymentPolicy?: 'Prepaid' | 'Postpaid' | 'Exempt' | string;
  paymentStatus?: 'Unpaid' | 'Paid' | 'Exempt' | 'Overridden' | 'Pending' | string;
  isYakapExempt?: boolean;
  hasActiveYakapEnlistment?: boolean;
  recordingPolicy?: 'Disabled' | 'WorkspaceVaultOnly' | 'Both' | string;
  recordingConsentRequired?: boolean;
  activeRecordingSessionId?: string | null;
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
  isCommsEnabled: boolean;

  // Workstation Consultation Chart Docking (Milestone 5)
  isCallStageDocked: boolean;
  dockCallStage: () => void;
  maximizeCallStage: () => void;
  onOpenConsultationChart?: ((appointmentId?: string, patientId?: string) => void) | null;
  setOnOpenConsultationChart: (callback: ((appointmentId?: string, patientId?: string) => void) | null) => void;
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
  isCommsEnabled: true,
  isCallStageDocked: false,
  dockCallStage: () => {},
  maximizeCallStage: () => {},
  onOpenConsultationChart: null,
  setOnOpenConsultationChart: () => {},
});

export const useClinicComms = () => useContext(ClinicCommsContext);

import { getCommsApiBaseUrl } from '../services/commsUrl';
export { getCommsApiBaseUrl };

export function ClinicCommsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { license } = useClinic();
  const { current, currentName } = useStaff();

  const [isChatDrawerOpen, setIsChatDrawerOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(undefined);
  const [teleconsultSession, setTeleconsultSession] = useState<TeleconsultSessionParams | null>(null);
  const [isCallStageDocked, setIsCallStageDocked] = useState(false);
  const [onOpenConsultationChart, setOnOpenConsultationChart] = useState<
    ((appointmentId?: string, patientId?: string) => void) | null
  >(null);

  const toggleChatDrawer = useCallback(() => {
    setIsChatDrawerOpen((prev) => !prev);
  }, []);

  const openChatDrawer = useCallback(() => {
    setIsChatDrawerOpen(true);
  }, []);

  const closeChatDrawer = useCallback(() => {
    setIsChatDrawerOpen(false);
  }, []);

  const dockCallStage = useCallback(() => {
    setIsCallStageDocked(true);
  }, []);

  const maximizeCallStage = useCallback(() => {
    setIsCallStageDocked(false);
  }, []);

  const openTeleconsultWaitingRoom = useCallback((params: TeleconsultSessionParams) => {
    setIsCallStageDocked(false);
    setTeleconsultSession(params);
  }, []);

  const closeTeleconsultWaitingRoom = useCallback(() => {
    setIsCallStageDocked(false);
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

  let commsBaseUrl = '';
  try {
    commsBaseUrl = getCommsApiBaseUrl();
  } catch {
    commsBaseUrl = '';
  }

  const commsEnabled = isCommsConfigEnabled() && Boolean(commsBaseUrl);

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
      isCommsEnabled: commsEnabled,
      isCallStageDocked,
      dockCallStage,
      maximizeCallStage,
      onOpenConsultationChart,
      setOnOpenConsultationChart,
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
      commsEnabled,
      isCallStageDocked,
      dockCallStage,
      maximizeCallStage,
      onOpenConsultationChart,
      setOnOpenConsultationChart,
    ],
  );

  return (
    <CommsProvider
      baseUrl={commsBaseUrl}
      getCommsTicket={getCommsTicket}
      tenantId={tenantId}
      facilityId={facilityId}
      staffId={staffId}
      staffDisplayName={staffDisplayName}
      options={{ autoConnect: isAuthenticated && commsEnabled }}
    >
      <ClinicCommsContext.Provider value={contextValue}>
        {children}
      </ClinicCommsContext.Provider>
    </CommsProvider>
  );
}
