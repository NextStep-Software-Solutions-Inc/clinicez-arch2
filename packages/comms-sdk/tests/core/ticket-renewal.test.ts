import { describe, expect, it } from 'bun:test';
import { TicketRenewalTimer } from '../../src/core/connection/TicketRenewalTimer';

function createMockTicket(expInSeconds: number, iatInSeconds?: number): string {
  const now = Math.floor(Date.now() / 1000);
  const iat = iatInSeconds ?? now;
  const exp = now + expInSeconds;

  const payload = {
    sub: 'staff-123',
    name: 'Dr. Maria Reyes',
    tenant_id: 'tenant-test',
    facility_id: 'facility-test',
    permissions: ['messaging:read', 'messaging:write'],
    iss: 'clinic-api',
    iat,
    nbf: iat,
    exp,
    jti: 'ticket-unique-123'
  };

  const base64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = Buffer.from('mock-ecdsa-signature').toString('base64url');
  return `${base64}.${signature}`;
}

describe('TicketRenewalTimer', () => {
  it('parses claims correctly from base64url ticket format', () => {
    const rawTicket = createMockTicket(300);
    const timer = new TicketRenewalTimer(async () => rawTicket);

    const claims = timer.parseClaims(rawTicket);
    expect(claims.sub).toBe('staff-123');
    expect(claims.name).toBe('Dr. Maria Reyes');
    expect(claims.tenant_id).toBe('tenant-test');
    expect(claims.permissions).toContain('messaging:read');
    expect(claims.exp - claims.iat).toBe(300);
  });

  it('proactively tracks active ticket and updates claims on renewal', async () => {
    let callCount = 0;
    const ticket1 = createMockTicket(300);
    const ticket2 = createMockTicket(300);

    const provider = async () => {
      callCount++;
      return callCount === 1 ? ticket1 : ticket2;
    };

    let renewedTicket = '';
    const timer = new TicketRenewalTimer(provider, {
      onTicketRenewed: (ticket) => {
        renewedTicket = ticket;
      }
    });

    const initial = await timer.start();
    expect(initial).toBe(ticket1);
    expect(timer.getActiveTicket()).toBe(ticket1);
    expect(timer.getActiveClaims()?.sub).toBe('staff-123');

    // Manually trigger update
    timer.updateTicket(ticket2);
    expect(timer.getActiveTicket()).toBe(ticket2);
    expect(renewedTicket).toBe(ticket2);

    timer.stop();
  });

  it('rejects malformed tickets missing signature part', () => {
    const timer = new TicketRenewalTimer(async () => 'bad-ticket');
    expect(() => timer.parseClaims('not-a-valid-ticket')).toThrow('Malformed comms ticket');
  });
});
