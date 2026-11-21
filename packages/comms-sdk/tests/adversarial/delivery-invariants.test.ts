import { describe, expect, it } from 'bun:test';
import { DeliveryStateTracker } from '../../src/core/queue/DeliveryStateTracker';

describe('Adversarial Scenario 4: Delivery State Machine Invariants', () => {
  it('strictly rejects illegal transition Sending -> Received without server Waiting', () => {
    // A message cannot jump directly from Sending (client in-flight) to Received (recipient storage ACK)
    // without first being accepted by the server into Waiting state.
    expect(DeliveryStateTracker.canTransition('Sending', 'Received')).toBe(false);
    expect(() => DeliveryStateTracker.transition('Sending', 'Received')).toThrow(
      /Invalid delivery state transition/
    );
  });

  it('strictly rejects transitions away from terminal state Received', () => {
    expect(DeliveryStateTracker.canTransition('Received', 'Sending')).toBe(false);
    expect(DeliveryStateTracker.canTransition('Received', 'Waiting')).toBe(false);
    expect(DeliveryStateTracker.canTransition('Received', 'NotReceived')).toBe(false);

    expect(() => DeliveryStateTracker.transition('Received', 'Sending')).toThrow();
    expect(() => DeliveryStateTracker.transition('Received', 'Waiting')).toThrow();
    expect(() => DeliveryStateTracker.transition('Received', 'NotReceived')).toThrow();
  });

  it('strictly rejects invalid transition Waiting -> Sending', () => {
    expect(DeliveryStateTracker.canTransition('Waiting', 'Sending')).toBe(false);
    expect(() => DeliveryStateTracker.transition('Waiting', 'Sending')).toThrow();
  });
});
