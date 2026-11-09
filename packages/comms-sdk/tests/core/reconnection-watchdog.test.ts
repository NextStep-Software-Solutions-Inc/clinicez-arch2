import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { CommsEventEmitter } from '../../src/core/events/CommsEventEmitter';

describe('SignalR Connection Hardening & Watchdog Invariants', () => {
  test('disconnect(false) preserves active conversations while disconnect(true) clears them', async () => {
    const { SignalRConnectionManager } = await import('../../src/core/connection/SignalRConnectionManager');

    const manager = new SignalRConnectionManager({
      hubUrl: 'https://comms.dev.example/hubs/comms',
      ticketProvider: async () => 'mock.ticket',
    });

    // Mock activeConversations by adding via joinConversation or internal set
    const internalActiveConvs = (manager as any).activeConversations as Set<string>;
    internalActiveConvs.add('conv-alpha');
    internalActiveConvs.add('conv-beta');

    expect(internalActiveConvs.size).toBe(2);

    // Disconnect preserving rooms
    await manager.disconnect(false);
    expect(internalActiveConvs.size).toBe(2);
    expect(internalActiveConvs.has('conv-alpha')).toBe(true);

    // Full disconnect clears rooms
    await manager.disconnect(true);
    expect(internalActiveConvs.size).toBe(0);
  });

  test('reconnect() preserves active conversations for re-joining upon connection', async () => {
    const { SignalRConnectionManager } = await import('../../src/core/connection/SignalRConnectionManager');

    const manager = new SignalRConnectionManager({
      hubUrl: 'https://comms.dev.example/hubs/comms',
      ticketProvider: async () => 'mock.ticket',
    });

    const internalActiveConvs = (manager as any).activeConversations as Set<string>;
    internalActiveConvs.add('conv-123');

    // Spy on connection.start and invoke
    const rawConn = manager.getRawConnection();
    let currentState = 'Connected';
    Object.defineProperty(rawConn, 'state', {
      get: () => currentState,
      configurable: true,
    });
    rawConn.stop = mock(async () => {
      currentState = 'Disconnected';
    }) as any;
    rawConn.start = mock(async () => {
      currentState = 'Connected';
    }) as any;
    rawConn.invoke = mock(async () => {}) as any;
    (manager.getRenewalTimer() as any).start = mock(async () => 'mock.ticket') as any;

    await manager.reconnect();

    expect(internalActiveConvs.has('conv-123')).toBe(true);
    expect(rawConn.stop).toHaveBeenCalled();
    expect(rawConn.start).toHaveBeenCalled();
    expect(rawConn.invoke).toHaveBeenCalledWith('JoinConversation', 'conv-123');
  });
});
