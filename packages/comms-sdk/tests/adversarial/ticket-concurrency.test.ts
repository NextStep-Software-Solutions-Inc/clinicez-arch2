import { describe, expect, it } from 'bun:test';
import { TicketRenewalTimer } from '../../src/core/connection/TicketRenewalTimer';

function createMockTicket(expInSeconds: number, subId = 'staff-123', iatInSeconds?: number): string {
  const now = Math.floor(Date.now() / 1000);
  const iat = iatInSeconds ?? now;
  const exp = now + expInSeconds;

  const payload = {
    sub: subId,
    name: 'Dr. Maria Reyes',
    tenant_id: 'tenant-test',
    facility_id: 'facility-test',
    permissions: ['messaging:read', 'messaging:write'],
    iss: 'clinic-api',
    iat,
    nbf: iat,
    exp,
    jti: `ticket-${Math.random().toString(36).substring(2)}`
  };

  const base64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = Buffer.from('mock-ecdsa-signature').toString('base64url');
  return `${base64}.${signature}`;
}

describe('Adversarial Scenario 2: Ticket Renewal Concurrency & Expiry Races', () => {
  it('handles rapid sequential and concurrent ticket updates safely', async () => {
    let renewalCount = 0;
    const ticket1 = createMockTicket(300, 'staff-0');

    const timer = new TicketRenewalTimer(async () => ticket1, {
      onTicketRenewed: () => {
        renewalCount++;
      }
    });

    await timer.start(ticket1);

    // Rapidly update ticket 100 times concurrently
    const updates = Array.from({ length: 100 }, (_, i) => {
      const ticket = createMockTicket(300, `staff-${i + 1}`);
      return Promise.resolve().then(() => {
        timer.updateTicket(ticket);
      });
    });

    await Promise.all(updates);

    expect(timer.getActiveTicket()).not.toBeNull();
    expect(timer.getActiveClaims()).not.toBeNull();
    expect(timer.getActiveClaims()?.sub).toMatch(/^staff-\d+$/);
    expect(renewalCount).toBe(101); // 1 initial + 100 updates

    timer.stop();
  });

  it('reschedules safely under simulated clock jumps forward past TTL target', async () => {
    const originalDateNow = Date.now;
    let simulatedNow = 1000000000000;
    Date.now = () => simulatedNow;

    try {
      const nowSec = Math.floor(simulatedNow / 1000);
      const ticket = createMockTicket(300, 'staff-clock', nowSec);

      let renewedTicket: string | null = null;
      const nextTicket = createMockTicket(300, 'staff-clock-renewed', nowSec + 250);

      const timer = new TicketRenewalTimer(async () => nextTicket, {
        leadTimeRatio: 0.75,
        minLeadTimeSeconds: 30,
        maxLeadTimeSeconds: 60,
        onTicketRenewed: (t) => {
          renewedTicket = t;
        }
      });

      await timer.start(ticket);

      // Simulate clock jump forward by 280 seconds (past 75% TTL, near expiry)
      simulatedNow += 280 * 1000;

      // Update ticket with new claims under jumped clock
      timer.updateTicket(ticket);

      expect(timer.getActiveClaims()?.sub).toBe('staff-clock');

      timer.stop();
    } finally {
      Date.now = originalDateNow;
    }
  });

  it('does not mutate state or invoke callbacks when stopped while renewal is in-flight', async () => {
    let providerResolve: (value: string) => void;
    const pendingPromise = new Promise<string>((resolve) => {
      providerResolve = resolve;
    });

    let renewedCalled = false;
    const initialTicket = createMockTicket(300, 'staff-initial');

    const timer = new TicketRenewalTimer(() => pendingPromise, {
      onTicketRenewed: () => {
        renewedCalled = true;
      }
    });

    // Start with initial ticket
    await timer.start(initialTicket);
    renewedCalled = false; // reset after initial start

    // Manually invoke private executeRenewal via reflection / start of second renewal
    const executeRenewal = (timer as any).executeRenewal.bind(timer);
    const renewalPromise = executeRenewal();

    // Immediately stop timer before provider resolves
    timer.stop();

    // Resolve the in-flight provider
    providerResolve!(createMockTicket(300, 'staff-leaked'));
    await renewalPromise;

    // Claims and ticket should NOT have leaked to the new one, and callback should not have run
    expect(timer.getActiveClaims()?.sub).toBe('staff-initial');
    expect(renewedCalled).toBe(false);
  });
});
