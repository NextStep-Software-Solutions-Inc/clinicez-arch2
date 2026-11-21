import { DeliveryState } from '../types';

export class DeliveryStateTracker {
  private static readonly VALID_TRANSITIONS: Record<DeliveryState, Set<DeliveryState>> = {
    Sending: new Set<DeliveryState>(['Waiting', 'NotReceived']),
    Waiting: new Set<DeliveryState>(['Received', 'NotReceived']),
    Received: new Set<DeliveryState>([]), // Terminal success
    NotReceived: new Set<DeliveryState>(['Sending']) // Terminal failure until re-submitted
  };

  public static canTransition(current: DeliveryState, next: DeliveryState): boolean {
    if (current === next) return true;
    const allowed = this.VALID_TRANSITIONS[current];
    return allowed ? allowed.has(next) : false;
  }

  public static transition(current: DeliveryState, next: DeliveryState): DeliveryState {
    if (current === next) return current;
    if (!this.canTransition(current, next)) {
      throw new Error(`Invalid delivery state transition from '${current}' to '${next}'.`);
    }
    return next;
  }

  public static isTerminal(state: DeliveryState): boolean {
    return state === 'Received' || state === 'NotReceived';
  }

  public static isPending(state: DeliveryState): boolean {
    return state === 'Sending' || state === 'Waiting';
  }
}
