import { CommsTicketResponse } from '../types';

/**
 * Resolves Bearer authentication headers from the active ticket, refreshing once if absent.
 */
export async function resolveCommsAuthHeaders(
  activeTicket: CommsTicketResponse | null,
  refreshTicket?: () => Promise<CommsTicketResponse>
): Promise<Record<string, string>> {
  let ticket = activeTicket?.ticket;
  if (!ticket && refreshTicket) {
    try {
      const refreshed = await refreshTicket();
      ticket = refreshed?.ticket;
    } catch {
      // Non-blocking: caller handles unauthenticated HTTP responses
    }
  }
  return {
    'Content-Type': 'application/json',
    ...(ticket ? { Authorization: `Bearer ${ticket}` } : {})
  };
}
