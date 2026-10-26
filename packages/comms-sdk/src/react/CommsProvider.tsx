import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SignalRConnectionManager } from '../core/connection/SignalRConnectionManager';
import { ICommsClient } from '../core/types';
import { CommsContext, InternalCommsContextValue } from './CommsContext';
import { OptimisticStore } from './internal/OptimisticStore';
import { SubscriptionTracker } from './internal/SubscriptionTracker';
import {
  CommsProviderProps,
  CommsTicketResponse,
  ConnectionStatus,
  ReactConnectionState
} from './types';

export const CommsProvider: React.FC<CommsProviderProps> = ({
  baseUrl,
  getCommsTicket,
  tenantId,
  facilityId,
  branchId,
  staffId,
  staffDisplayName,
  options,
  client: externalClient,
  children
}) => {
  const storeRef = useRef<OptimisticStore>(new OptimisticStore());
  const trackerRef = useRef<SubscriptionTracker>(new SubscriptionTracker());

  const [activeTicket, setActiveTicket] = useState<CommsTicketResponse | null>(null);
  const [connectionState, setConnectionState] = useState<ReactConnectionState>({
    status: 'disconnected',
    reconnectAttempt: 0,
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    error: null
  });

  const activeTicketRef = useRef<CommsTicketResponse | null>(null);
  activeTicketRef.current = activeTicket;

  const ticketProviderRef = useRef(getCommsTicket);
  useEffect(() => {
    ticketProviderRef.current = getCommsTicket;
  }, [getCommsTicket]);

  const ticketProvider = useCallback(async (): Promise<string> => {
    setConnectionState((prev) => ({ ...prev, status: 'acquiring_ticket' }));
    try {
      const resp = await ticketProviderRef.current();
      setActiveTicket(resp);
      return resp.ticket;
    } catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      setConnectionState((prev) => ({ ...prev, status: 'failed', error }));
      throw error;
    }
  }, []);

  const client = useMemo<ICommsClient>(() => {
    if (externalClient) return externalClient;

    const hubUrl = baseUrl.endsWith('/hubs/comms') ? baseUrl : `${baseUrl.replace(/\/$/, '')}/hubs/comms`;
    return new SignalRConnectionManager({
      hubUrl,
      ticketProvider
    });
  }, [baseUrl, externalClient, ticketProvider]);

  const connect = useCallback(async (): Promise<void> => {
    try {
      setConnectionState((prev) => ({ ...prev, status: 'connecting', error: null }));
      await client.connect();
    } catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      setConnectionState((prev) => ({
        ...prev,
        status: 'failed',
        error,
        lastDisconnectedAt: new Date()
      }));
      throw error;
    }
  }, [client]);

  const disconnect = useCallback(async (): Promise<void> => {
    await client.disconnect();
    setConnectionState((prev) => ({
      ...prev,
      status: 'disconnected',
      lastDisconnectedAt: new Date()
    }));
  }, [client]);

  const reconnect = useCallback(async (): Promise<void> => {
    await disconnect();
    await connect();
  }, [connect, disconnect]);

  const refreshTicket = useCallback(async (): Promise<CommsTicketResponse> => {
    const resp = await ticketProviderRef.current();
    setActiveTicket(resp);
    return resp;
  }, []);

  useEffect(() => {
    const unsubState = client.events.on('connectionStateChanged', (state, error) => {
      let status: ConnectionStatus = 'disconnected';
      if (state === 'Connected') status = 'connected';
      else if (state === 'Connecting') status = 'connecting';
      else if (state === 'Reconnecting') status = 'reconnecting';
      else if (state === 'Disconnected') status = error ? 'failed' : 'disconnected';

      setConnectionState((prev) => ({
        ...prev,
        status,
        error: error ?? (state === 'Connected' ? null : prev.error),
        lastConnectedAt: state === 'Connected' ? new Date() : prev.lastConnectedAt,
        lastDisconnectedAt: state === 'Disconnected' ? new Date() : prev.lastDisconnectedAt,
        reconnectAttempt: state === 'Reconnecting' ? prev.reconnectAttempt + 1 : state === 'Connected' ? 0 : prev.reconnectAttempt
      }));
    });

    const unsubTicket = client.events.on('ticketRenewed', (rawTicket) => {
      setActiveTicket((prev) => ({
        ticket: rawTicket,
        expiresAtUtc: prev?.expiresAtUtc ?? new Date(Date.now() + 300000).toISOString()
      }));
    });

    const unsubMsg = client.events.on('messageReceived', (msg) => {
      storeRef.current.appendMessage(msg);
    });

    const unsubMsgState = client.events.on('messageStateChanged', ({ messageId, conversationId, state }) => {
      storeRef.current.updateMessageState(messageId, conversationId, state);
    });

    return () => {
      unsubState();
      unsubTicket();
      unsubMsg();
      unsubMsgState();
    };
  }, [client]);

  // Auto-connect
  useEffect(() => {
    if (options?.autoConnect !== false) {
      connect().catch(() => {});
    }

    return () => {
      if (!externalClient) {
        client.disconnect().catch(() => {});
      }
    };
  }, [client, connect, externalClient, options?.autoConnect]);

  const contextValue = useMemo<InternalCommsContextValue>(
    () => ({
      client,
      connectionState,
      activeTicket,
      tenantId,
      facilityId,
      branchId,
      staffId,
      staffDisplayName,
      connect,
      disconnect,
      reconnect,
      refreshTicket,
      store: storeRef.current,
      subscriptionTracker: trackerRef.current
    }),
    [
      client,
      connectionState,
      activeTicket,
      tenantId,
      facilityId,
      branchId,
      staffId,
      staffDisplayName,
      connect,
      disconnect,
      reconnect,
      refreshTicket
    ]
  );

  return <CommsContext.Provider value={contextValue}>{children}</CommsContext.Provider>;
};
