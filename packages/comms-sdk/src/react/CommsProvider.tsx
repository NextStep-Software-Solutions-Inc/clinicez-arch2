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
    try {
      if (typeof client.reconnect === 'function') {
        await client.reconnect();
      } else {
        await disconnect();
        await connect();
      }
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
  }, [client, connect, disconnect]);

  const refreshTicket = useCallback(async (): Promise<CommsTicketResponse> => {
    const resp = await ticketProviderRef.current();
    setActiveTicket(resp);
    return resp;
  }, []);

  const autoReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef<number>(0);

  const clearAutoReconnectTimer = useCallback(() => {
    if (autoReconnectTimerRef.current) {
      clearTimeout(autoReconnectTimerRef.current);
      autoReconnectTimerRef.current = null;
    }
  }, []);

  const triggerAutoReconnect = useCallback((delayMs?: number) => {
    if (options?.autoConnect === false) return;
    clearAutoReconnectTimer();

    const attempt = reconnectAttemptRef.current;
    const computedDelay = delayMs ?? Math.min(10000, Math.round(1500 * Math.pow(2, attempt)));
    reconnectAttemptRef.current = attempt + 1;

    autoReconnectTimerRef.current = setTimeout(() => {
      autoReconnectTimerRef.current = null;
      reconnect().catch(() => {});
    }, computedDelay);
  }, [clearAutoReconnectTimer, options?.autoConnect, reconnect]);

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

      // Unified auto-recovery using the identical reconnect flow
      if (options?.autoConnect !== false) {
        if (state === 'Disconnected') {
          triggerAutoReconnect();
        } else if (state === 'Reconnecting') {
          // If SignalR's internal reconnection doesn't resolve in 15s, trigger unified reconnect
          triggerAutoReconnect(15000);
        } else if (state === 'Connected') {
          clearAutoReconnectTimer();
          reconnectAttemptRef.current = 0;
        }
      }
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
      clearAutoReconnectTimer();
      unsubState();
      unsubTicket();
      unsubMsg();
      unsubMsgState();
    };
  }, [client, clearAutoReconnectTimer, triggerAutoReconnect, options?.autoConnect]);

  // Window/tab visibility and focus listener: automatically recover stalled/idle socket connections on wake
  useEffect(() => {
    if (options?.autoConnect === false) return;

    const checkAndRecoverConnection = () => {
      const state = client.getConnectionState();
      if (state !== 'Connected') {
        clearAutoReconnectTimer();
        reconnect().catch(() => {});
      }
    };

    if (typeof document !== 'undefined') {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          checkAndRecoverConnection();
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);

      const handleFocus = () => {
        checkAndRecoverConnection();
      };
      if (typeof window !== 'undefined') {
        window.addEventListener('focus', handleFocus);
      }

      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        if (typeof window !== 'undefined') {
          window.removeEventListener('focus', handleFocus);
        }
      };
    }
  }, [client, clearAutoReconnectTimer, reconnect, options?.autoConnect]);

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
      baseUrl,
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
      baseUrl,
      connect,
      disconnect,
      reconnect,
      refreshTicket
    ]
  );

  return <CommsContext.Provider value={contextValue}>{children}</CommsContext.Provider>;
};
