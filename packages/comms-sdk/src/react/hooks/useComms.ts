import { useCommsContext } from '../CommsContext';
import { UseCommsResult } from '../types';

export function useComms(): UseCommsResult {
  const {
    client,
    connectionState,
    activeTicket,
    connect,
    disconnect,
    reconnect,
    refreshTicket
  } = useCommsContext();

  return {
    isConnected: connectionState.status === 'connected',
    isConnecting: connectionState.status === 'connecting' || connectionState.status === 'acquiring_ticket',
    isReconnecting: connectionState.status === 'reconnecting',
    status: connectionState.status,
    reconnectAttempt: connectionState.reconnectAttempt,
    lastConnectedAt: connectionState.lastConnectedAt,
    activeTicket,
    error: connectionState.error,
    connect,
    disconnect,
    reconnect,
    refreshTicket,
    client
  };
}
