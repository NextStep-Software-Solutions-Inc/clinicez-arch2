import { describe, expect, it } from 'bun:test';
import { DeliveryStateTracker } from '../../src/core/queue/DeliveryStateTracker';

describe('DeliveryStateTracker', () => {
  it('allows valid progressive delivery state transitions', () => {
    // Sending -> Waiting
    expect(DeliveryStateTracker.canTransition('Sending', 'Waiting')).toBe(true);
    expect(DeliveryStateTracker.transition('Sending', 'Waiting')).toBe('Waiting');

    // Waiting -> Received
    expect(DeliveryStateTracker.canTransition('Waiting', 'Received')).toBe(true);
    expect(DeliveryStateTracker.transition('Waiting', 'Received')).toBe('Received');

    // Sending -> NotReceived (immediate failure / offline)
    expect(DeliveryStateTracker.canTransition('Sending', 'NotReceived')).toBe(true);
    expect(DeliveryStateTracker.transition('Sending', 'NotReceived')).toBe('NotReceived');

    // Waiting -> NotReceived (retention deadline expiration)
    expect(DeliveryStateTracker.canTransition('Waiting', 'NotReceived')).toBe(true);
    expect(DeliveryStateTracker.transition('Waiting', 'NotReceived')).toBe('NotReceived');

    // NotReceived -> Sending (explicit retry)
    expect(DeliveryStateTracker.canTransition('NotReceived', 'Sending')).toBe(true);
    expect(DeliveryStateTracker.transition('NotReceived', 'Sending')).toBe('Sending');
  });

  it('rejects invalid or regressive state transitions', () => {
    // Received is terminal: cannot un-receive
    expect(DeliveryStateTracker.canTransition('Received', 'Sending')).toBe(false);
    expect(DeliveryStateTracker.canTransition('Received', 'Waiting')).toBe(false);
    expect(DeliveryStateTracker.canTransition('Received', 'NotReceived')).toBe(false);
    expect(() => DeliveryStateTracker.transition('Received', 'Waiting')).toThrow('Invalid delivery state transition');

    // Waiting cannot go back to Sending without retry flow
    expect(DeliveryStateTracker.canTransition('Waiting', 'Sending')).toBe(false);
    expect(() => DeliveryStateTracker.transition('Waiting', 'Sending')).toThrow('Invalid delivery state transition');

    // Direct Sending -> Received is forbidden without Waiting confirmation
    expect(DeliveryStateTracker.canTransition('Sending', 'Received')).toBe(false);
    expect(() => DeliveryStateTracker.transition('Sending', 'Received')).toThrow('Invalid delivery state transition');
  });

  it('correctly classifies terminal and pending states', () => {
    expect(DeliveryStateTracker.isPending('Sending')).toBe(true);
    expect(DeliveryStateTracker.isPending('Waiting')).toBe(true);
    expect(DeliveryStateTracker.isPending('Received')).toBe(false);
    expect(DeliveryStateTracker.isPending('NotReceived')).toBe(false);

    expect(DeliveryStateTracker.isTerminal('Received')).toBe(true);
    expect(DeliveryStateTracker.isTerminal('NotReceived')).toBe(true);
    expect(DeliveryStateTracker.isTerminal('Sending')).toBe(false);
    expect(DeliveryStateTracker.isTerminal('Waiting')).toBe(false);
  });
});
