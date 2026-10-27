import { CommsTicketClaims } from '../types';

export type TicketProvider = () => Promise<string>;

export interface TicketRenewalOptions {
  leadTimeRatio?: number;      // Ratio of TTL for refresh (default 0.75, i.e. 75% elapsed)
  minLeadTimeSeconds?: number; // Minimum seconds before expiry to trigger refresh (default 30s)
  maxLeadTimeSeconds?: number; // Maximum lead time before expiry (default 60s)
  onTicketRenewed?: (newTicket: string, claims: CommsTicketClaims) => void;
  onRenewalError?: (error: Error) => void;
}

export class TicketRenewalTimer {
  private readonly ticketProvider: TicketProvider;
  private readonly options: Required<TicketRenewalOptions>;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private currentTicket: string | null = null;
  private currentClaims: CommsTicketClaims | null = null;
  private isDisposed: boolean = false;

  constructor(ticketProvider: TicketProvider, options?: TicketRenewalOptions) {
    this.ticketProvider = ticketProvider;
    this.options = {
      leadTimeRatio: options?.leadTimeRatio ?? 0.75,
      minLeadTimeSeconds: options?.minLeadTimeSeconds ?? 30,
      maxLeadTimeSeconds: options?.maxLeadTimeSeconds ?? 60,
      onTicketRenewed: options?.onTicketRenewed ?? (() => {}),
      onRenewalError: options?.onRenewalError ?? (() => {})
    };
  }

  public async start(initialTicket?: string): Promise<string> {
    this.isDisposed = false;
    const ticket = initialTicket ?? (await this.ticketProvider());
    this.updateTicket(ticket);
    return ticket;
  }

  public stop(): void {
    this.isDisposed = true;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  public getActiveTicket(): string | null {
    return this.currentTicket;
  }

  public getActiveClaims(): CommsTicketClaims | null {
    return this.currentClaims;
  }

  public updateTicket(rawTicket: string): void {
    this.currentTicket = rawTicket;
    this.currentClaims = this.parseClaims(rawTicket);
    this.scheduleNextRenewal(this.currentClaims);
    this.options.onTicketRenewed(rawTicket, this.currentClaims);
  }

  public parseClaims(rawTicket: string): CommsTicketClaims {
    const parts = rawTicket.split('.');
    if (parts.length !== 2) {
      throw new Error('Malformed comms ticket: expected {payload}.{signature}');
    }

    const base64 = parts[0].replace(/-/g, '+').replace(/_/g, '/');
    const globalBuffer = (globalThis as any).Buffer;
    const jsonStr = typeof atob === 'function'
      ? atob(base64)
      : globalBuffer
        ? globalBuffer.from(base64, 'base64').toString('utf-8')
        : '';

    return JSON.parse(jsonStr) as CommsTicketClaims;
  }

  private scheduleNextRenewal(claims: CommsTicketClaims): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }

    if (this.isDisposed) return;

    const nowSec = Math.floor(Date.now() / 1000);
    const ttlSec = Math.max(1, claims.exp - claims.iat);

    // Refresh at leadTimeRatio (e.g. 75% elapsed TTL, leaving 25% remaining)
    const leadTimeSec = Math.max(
      this.options.minLeadTimeSeconds,
      Math.min(this.options.maxLeadTimeSeconds, ttlSec * (1 - this.options.leadTimeRatio))
    );

    const targetRefreshSec = claims.exp - leadTimeSec;
    const delayMs = Math.max(1000, (targetRefreshSec - nowSec) * 1000);

    this.timerId = setTimeout(() => {
      this.executeRenewal();
    }, delayMs);
  }

  private async executeRenewal(): Promise<void> {
    if (this.isDisposed) return;

    try {
      const freshTicket = await this.ticketProvider();
      if (this.isDisposed) return;
      this.updateTicket(freshTicket);
    } catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.options.onRenewalError(error);
      // Retry in 15 seconds if renewal fails, as long as timer is not disposed
      if (!this.isDisposed) {
        this.timerId = setTimeout(() => this.executeRenewal(), 15000);
      }
    }
  }
}
