import { ICommsClient } from '../../core/types';

export class SubscriptionTracker {
  private readonly roomRefCounts: Map<string, number> = new Map();

  public async retainRoom(client: ICommsClient, conversationId: string): Promise<void> {
    const current = this.roomRefCounts.get(conversationId) ?? 0;
    this.roomRefCounts.set(conversationId, current + 1);

    if (current === 0 && client.getConnectionState() === 'Connected') {
      try {
        await client.joinConversation(conversationId);
      } catch (err) {
        console.warn(`Failed to join conversation room '${conversationId}':`, err);
      }
    }
  }

  public async releaseRoom(client: ICommsClient, conversationId: string): Promise<void> {
    const current = this.roomRefCounts.get(conversationId) ?? 0;
    if (current <= 1) {
      this.roomRefCounts.delete(conversationId);
      if (client.getConnectionState() === 'Connected') {
        try {
          await client.leaveConversation(conversationId);
        } catch (err) {
          console.warn(`Failed to leave conversation room '${conversationId}':`, err);
        }
      }
    } else {
      this.roomRefCounts.set(conversationId, current - 1);
    }
  }

  public getRefCount(conversationId: string): number {
    return this.roomRefCounts.get(conversationId) ?? 0;
  }

  public getActiveRooms(): string[] {
    return Array.from(this.roomRefCounts.keys());
  }

  public clear(): void {
    this.roomRefCounts.clear();
  }
}
