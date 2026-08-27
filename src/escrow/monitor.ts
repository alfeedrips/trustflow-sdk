import { TrustFlowEvent, EventHandler } from '../types/events';

export class EscrowMonitor {
  private handlers = new Map<string, Set<EventHandler>>();
  private pollingInterval?: ReturnType<typeof setInterval>;

  on(type: string, handler: EventHandler): this {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return this;
  }

  off(type: string, handler: EventHandler): this {
    this.handlers.get(type)?.delete(handler);
    return this;
  }

  startPolling(intervalMs = 5000, fetchFn: () => Promise<TrustFlowEvent[]>): void {
    this.pollingInterval = setInterval(async () => {
      const events = await fetchFn().catch(() => []);
      for (const event of events) {
        const handlers = this.handlers.get(event.type) ?? new Set();
        const wildcards = this.handlers.get('*') ?? new Set();
        [...handlers, ...wildcards].forEach((h) => {
          Promise.resolve(h(event)).catch(console.error);
        });
      }
    }, intervalMs);
  }

  stopPolling(): void {
    clearInterval(this.pollingInterval);
  }
}
