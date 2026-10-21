import type {
  ParsedTrustFlowEvent,
  EventHandler,
  EventHandlerFor,
  MonitorEventName,
  TrustFlowEventType,
} from '../types/events';
import type { CursorStore, RawContractEvent } from '../events';
import { InMemoryCursorStore, parseEvents } from '../events';
import { logger } from '../utils/logger';
import { retry } from '../utils/retry';

/**
 * The phase in which a polling error occurred.
 */
export type EscrowMonitorErrorPhase = 'fetch' | 'handler';

/**
 * Context passed to the {@link EscrowMonitor.onError} callback describing where
 * the error originated and, for handler failures, the event and handler involved.
 */
export interface EscrowMonitorErrorContext {
  /** The phase of polling in which the error occurred. */
  phase: EscrowMonitorErrorPhase;
  /** The event that triggered the failing handler, when `phase === 'handler'`. */
  event?: ParsedTrustFlowEvent;
  /** The handler that threw, when `phase === 'handler'`. */
  handler?: EventHandler;
}

/**
 * Callback invoked by {@link EscrowMonitor} when a poll (fetchFn) or an event
 * handler fails. Consumers that register this callback can react to otherwise
 * silently-discarded errors.
 */
export type EscrowMonitorOnError = (error: unknown, context: EscrowMonitorErrorContext) => void;

/** Info passed to `onReconnect` after polling recovers from failures. */
export interface MonitorReconnectInfo {
  /** Cursor polling resumed from. */
  cursor?: string;
  /** Number of consecutive failures before recovery. */
  failures: number;
}

/** Describes a potential gap in event coverage. */
export interface MonitorGapInfo {
  /** Human-readable cause: ledger jump or expired cursor. */
  reason: 'ledger-discontinuity' | 'cursor-expired' | 'unknown';
  /** Last ledger successfully processed before the gap (if known). */
  fromLedger?: number;
  /** First ledger seen after the gap (if known). */
  toLedger?: number;
  /** Cursor that could not be backfilled (for `cursor-expired`). */
  cursor?: string;
}

export type EscrowMonitorOnReconnect = (info: MonitorReconnectInfo) => void;
export type EscrowMonitorOnGap = (gap: MonitorGapInfo) => void;

/** Options for {@link EscrowMonitor.startResilientPolling}. */
export interface ResilientPollingOptions {
  /** Pluggable cursor store (in-memory default). */
  store?: CursorStore;
  /** Max dedup keys retained (default 1000). */
  dedupSize?: number;
  /** Base backoff in ms after a failed poll (default 1000). */
  baseBackoffMs?: number;
  /** Max backoff in ms (default 30000). */
  maxBackoffMs?: number;
  /** Initial cursor when the store is empty. */
  initialCursor?: string;
  /**
   * If true, preserves seenKeys, seenSet, lastLedger, and lastCursor across stop/restart cycles.
   * Defaults to false, resetting deduplication and gap-detection state for the new session.
   */
  resume?: boolean;
}

/** Options for {@link EscrowMonitor.getEventsIterator}. */
export interface EventsIteratorOptions {
  /** Starting cursor for pagination. If not provided, starts from the beginning. */
  fromCursor?: string;
  /** Maximum number of events to fetch in each batch. */
  limit?: number;
  /** Signal to cancel iteration. */
  signal?: AbortSignal;
}

/** Async iterator for paginating through contract events. */
export class EventsIterator implements AsyncIterable<ParsedTrustFlowEvent> {
  constructor(
    private fetchFn: CursorAwareFetchFn,
    private options: EventsIteratorOptions = {},
  ) {}

  async *[Symbol.asyncIterator](): AsyncIterator<ParsedTrustFlowEvent> {
    let cursor = this.options.fromCursor;
    const { signal } = this.options;

    while (true) {
      if (signal?.aborted) {
        throw new DOMException('Iterator aborted', 'AbortError');
      }

      try {
        const events = await this.fetchFn(cursor);
        if (!events || events.length === 0) {
          break;
        }

        for (const event of events) {
          if (signal?.aborted) {
            throw new DOMException('Iterator aborted', 'AbortError');
          }
          yield event;
        }

        const lastEvent = events[events.length - 1];
        cursor = lastEvent.pagingToken || lastEvent.id;
      } catch (error) {
        // Re-throw abort errors as-is
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw error;
        }
        // For other errors, rethrow with context
        throw error;
      }
    }
  }
}

/**
 * Cursor-aware fetch function for resilient polling. Receives the last saved
 * cursor (or `undefined` on first poll) and returns parsed events.
 */
export type CursorAwareFetchFn = (cursor?: string) => Promise<ParsedTrustFlowEvent[]>;

/**
 * Subscribes handlers to parsed TrustFlow events and dispatches them.
 *
 * Events come in as {@link ParsedTrustFlowEvent} — exactly what
 * `parseEvents(rawEvents, contractId)` (`src/events.ts`) produces — so a
 * caller can wire the SDK's own parser straight into this without any
 * translation step (#108). Handlers narrow `event.data` by switching on
 * `event.type`.
 *
 * Register {@link EscrowMonitor.onError} to observe fetch/handler failures
 * that are otherwise only surfaced through the SDK logger (#112).
 *
 * For production polling against Soroban RPC `getEvents`, prefer
 * {@link EscrowMonitor.startResilientPolling}: it resumes from the last saved
 * cursor after transient failures (exponential backoff), dedups across
 * reconnects by `pagingToken`/`id`, and surfaces gaps via `onGapDetected`.
 * Soroban RPC serves events through polling (no push WebSocket), so
 * "reconnect" means resuming polling from the saved position. If the cursor
 * is older than the RPC retention window it cannot be backfilled and is
 * reported as a gap.
 */
export interface TopicFilter {
  /** Event type to filter */
  type: TrustFlowEventType;
  /** Topic index to match (e.g., 0 for event type, 1 for escrowId, 2 for sender) */
  topicIndex: number;
  /** Expected value at the topic index */
  value: string;
}

export class EscrowMonitor {
  private handlers = new Map<string, Set<EventHandler>>();
  private topicFilters: TopicFilter[] = [];
  private pollingInterval?: ReturnType<typeof setInterval>;
  private resilientTimer?: ReturnType<typeof setTimeout>;
  private resilientStopped = true;
  private errorCallback?: EscrowMonitorOnError;
  private reconnectCallback?: EscrowMonitorOnReconnect;
  private gapCallback?: EscrowMonitorOnGap;
  private seenKeys: string[] = [];
  private seenSet = new Set<string>();
  private lastLedger?: number;
  private lastCursor?: string;
  private consecutiveFailures = 0;
  private catchingUp = false;

  /**
   * Register a handler for `type`, narrowed to that event's payload (#287).
   *
   * The handler's `event` parameter is contextually typed from the literal, so
   * `monitor.on('escrow_created', (e) => e.data.amount)` compiles — no second
   * `if (e.type === ...)` narrowing needed. Passing a name the parser never
   * emits is a compile error instead of a handler that silently never fires.
   *
   * Overloads, in resolution order:
   *
   * 1. a `TrustFlowEventType` literal (or union of them) — narrowed handler;
   * 2. `'*'` — wildcard handler receiving the full union;
   * 3. a `MonitorEventName` or `string` variable — un-narrowed, since the name
   *    is not statically known.
   *
   * @example
   * ```ts
   * monitor.on('escrow_created', (e) => console.log(e.data.escrowId, e.data.amount));
   * monitor.on('*', (e) => console.log('any event', e.type));
   * ```
   */
  on<T extends TrustFlowEventType>(type: T, handler: EventHandlerFor<T>): this;
  on(type: '*', handler: EventHandler): this;
  /**
   * Non-literal names — a {@link MonitorEventName} variable, or the
   * deprecated `string` escape hatch below. `string extends T` is true only
   * when `T` is the full `string` type, so a *literal* argument resolves to
   * `never` here and is rejected: this overload cannot be used to slip a typo
   * past the narrowed signatures.
   *
   * @deprecated The event name should be a {@link TrustFlowEventType} literal
   * or a {@link MonitorEventName} value. Kept for callers that hold the name in
   * a `string` variable; narrow to `MonitorEventName`, or cast at the boundary,
   * instead of widening to `string`.
   */
  on<T extends string>(type: string extends T ? T : MonitorEventName, handler: EventHandler): this;
  on(type: MonitorEventName | string, handler: EventHandler): this {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return this;
  }

  /**
   * Remove a handler registered with {@link EscrowMonitor.on}. Mirrors its
   * overloads, so a handler is removed with the same literal it was added
   * with — no cast for a narrowed registration (#287).
   */
  off<T extends TrustFlowEventType>(type: T, handler: EventHandlerFor<T>): this;
  off(type: '*', handler: EventHandler): this;
  /** @deprecated See the matching note on {@link EscrowMonitor.on}. */
  off<T extends string>(type: string extends T ? T : MonitorEventName, handler: EventHandler): this;
  off(type: MonitorEventName | string, handler: EventHandler): this {
    this.handlers.get(type)?.delete(handler);
    return this;
  }

  /**
   * Register an optional error callback that is invoked whenever a poll
   * (`fetchFn`) or an event handler fails. Without it, failures are only
   * surfaced through the SDK's logger and existing polling behavior is
   * unchanged.
   *
   * @param callback - Called with the thrown error and context describing
   *   whether it originated from fetching events or handling an event.
   * @returns `this` for chaining.
   */
  onError(callback: EscrowMonitorOnError): this {
    this.errorCallback = callback;
    return this;
  }

  /**
   * Register a callback invoked when polling recovers after one or more
   * failed polls (resilient polling only).
   */
  onReconnect(callback: EscrowMonitorOnReconnect): this {
    this.reconnectCallback = callback;
    return this;
  }

  /**
   * Register a callback invoked when a potential coverage gap is detected:
   * a ledger discontinuity between polls, or a cursor older than the RPC
   * retention window that cannot be backfilled.
   */
  onGapDetected(callback: EscrowMonitorOnGap): this {
    this.gapCallback = callback;
    return this;
  }

  /**
   * Add a topic-based filter for contract events.
   * Events matching the filter will only be delivered to handlers registered for that event type.
   *
   * Useful for filtering events by specific values in the contract event topics,
   * such as listening only for events related to a specific escrow ID or account.
   *
   * @param filter - Topic filter criteria
   * @returns `this` for chaining
   *
   * @example
   * ```ts
   * // Only deliver escrow_created events where sender is 'GSENDER...'
   * monitor.addTopicFilter({
   *   type: 'escrow_created',
   *   topicIndex: 2,
   *   value: 'GSENDER...'
   * });
   * ```
   */
  addTopicFilter(filter: TopicFilter): this {
    // Prevent duplicate filters
    const exists = this.topicFilters.some(
      (f) =>
        f.type === filter.type && f.topicIndex === filter.topicIndex && f.value === filter.value,
    );
    if (!exists) {
      this.topicFilters.push(filter);
    }
    return this;
  }

  /**
   * Remove a previously registered topic filter.
   *
   * @param filter - Topic filter to remove
   * @returns `this` for chaining
   */
  removeTopicFilter(filter: TopicFilter): this {
    this.topicFilters = this.topicFilters.filter(
      (f) =>
        !(f.type === filter.type && f.topicIndex === filter.topicIndex && f.value === filter.value),
    );
    return this;
  }

  /**
   * Check if an event matches all registered topic filters for its type.
   * @internal
   */
  private matchesTopicFilters(event: ParsedTrustFlowEvent): boolean {
    const filtersForType = this.topicFilters.filter((f) => f.type === event.type);
    if (filtersForType.length === 0) {
      return true; // No filters for this type, passes
    }
    // All filters for this event type must match
    return filtersForType.every((filter) => {
      // This would require access to raw topics, which we don't have in ParsedTrustFlowEvent
      // For now, we match based on data properties when available
      if (event.type === 'escrow_created' && 'data' in event) {
        const data = event.data as any;
        if (filter.topicIndex === 1) return data.escrowId === filter.value;
        if (filter.topicIndex === 2) return data.sender === filter.value;
        if (filter.topicIndex === 3) return data.recipient === filter.value;
      }
      if (event.type === 'escrow_released' && 'data' in event) {
        const data = event.data as any;
        if (filter.topicIndex === 1) return data.escrowId === filter.value;
        if (filter.topicIndex === 2) return data.recipient === filter.value;
      }
      if (event.type === 'dispute_raised' && 'data' in event) {
        const data = event.data as any;
        if (filter.topicIndex === 1) return data.escrowId === filter.value;
        if (filter.topicIndex === 2) return data.raisedBy === filter.value;
      }
      return false;
    });
  }

  /**
   * Dispatch a batch of already-parsed events to their registered handlers
   * (plus any `'*'` wildcard handlers). Handler rejections are logged and
   * forwarded to {@link EscrowMonitor.onError}, not thrown, so one bad handler
   * can't stop the rest.
   *
   * Events are filtered by any registered topic filters before dispatch.
   */
  deliver(events: ParsedTrustFlowEvent[]): void {
    if (!Array.isArray(events)) return;
    for (const event of events) {
      if (!event || !event.type) continue;
      // Apply topic filters
      if (!this.matchesTopicFilters(event)) continue;
      const handlers = this.handlers.get(event.type) ?? new Set<EventHandler>();
      const wildcards = this.handlers.get('*') ?? new Set<EventHandler>();
      [...handlers, ...wildcards].forEach((h) => {
        Promise.resolve(h(event)).catch((error: unknown) => {
          logger.error('Event handler failed', { error, event });
          this.errorCallback?.(error, { phase: 'handler', event, handler: h });
        });
      });
    }
  }

  startPolling(intervalMs = 5000, fetchFn: () => Promise<ParsedTrustFlowEvent[]>): void {
    this.pollingInterval = setInterval(async () => {
      let events: ParsedTrustFlowEvent[];
      try {
        events = await fetchFn();
      } catch (error) {
        logger.error('Failed to fetch events during polling', error);
        this.errorCallback?.(error, { phase: 'fetch' });
        return;
      }
      this.deliver(events);
    }, intervalMs);
  }

  /**
   * Start cursor-aware resilient polling.
   *
   * Each tick calls `fetchFn` with the last saved cursor, dedups by
   * `pagingToken`/`id` across resumes, persists the newest cursor, backs off
   * exponentially after failures (reusing the shared `retry` helper for the
   * fetch itself), and notifies `onReconnect` / `onGapDetected`.
   *
   * @param intervalMs - Base interval between successful polls
   * @param fetchFn - Cursor-aware fetcher returning parsed events
   * @param options - Cursor store, dedup size, backoff tuning
   *
   * @example
   * ```ts
   * const monitor = new EscrowMonitor();
   * monitor.on('escrow_created', (e) => console.log(e.data.escrowId));
   * monitor.onReconnect(({ failures }) => console.log(`reconnected after ${failures} failures`));
   * monitor.onGapDetected((gap) => console.warn('possible missed events', gap));
   * monitor.startResilientPolling(5000, async (cursor) => {
   *   const page = await fetchContractEvents(server, { contractId, cursor });
   *   return parseEvents(page.events, contractId);
   * });
   * ```
   */
  startResilientPolling(
    intervalMs = 5000,
    fetchFn: CursorAwareFetchFn,
    options: ResilientPollingOptions = {},
  ): void {
    this.stopPolling();
    this.resilientStopped = false;
    if (!options.resume) {
      this.seenKeys = [];
      this.seenSet.clear();
      this.lastLedger = undefined;
      this.lastCursor = undefined;
    }
    const store = options.store ?? new InMemoryCursorStore(options.initialCursor);
    const dedupSize = options.dedupSize ?? 1000;
    const baseBackoffMs = options.baseBackoffMs ?? 1000;
    const maxBackoffMs = options.maxBackoffMs ?? 30000;
    this.consecutiveFailures = 0;
    this.catchingUp = false;

    const remember = (key: string): void => {
      if (this.seenSet.has(key)) return;
      this.seenSet.add(key);
      this.seenKeys.push(key);
      if (this.seenKeys.length > dedupSize) {
        const oldest = this.seenKeys.shift();
        if (oldest) this.seenSet.delete(oldest);
      }
    };

    const schedule = (delayMs: number): void => {
      if (this.resilientStopped) return;
      this.resilientTimer = setTimeout(tick, delayMs);
    };

    const tick = async (): Promise<void> => {
      if (this.resilientStopped) return;
      let cursor: string | undefined;
      try {
        cursor = (await store.get()) ?? this.lastCursor;
      } catch (error) {
        logger.error('Cursor store read failed', error);
      }

      let events: ParsedTrustFlowEvent[];
      try {
        // Reuse the shared retry helper: one immediate retry with
        // exponential delay before the outer backoff loop takes over.
        events = await retry(() => fetchFn(cursor), {
          attempts: 2,
          delayMs: (attempt) => Math.min(baseBackoffMs * 2 ** (attempt - 1), maxBackoffMs),
        });
      } catch (error) {
        this.consecutiveFailures += 1;
        logger.error('Resilient poll failed', { cursor, failures: this.consecutiveFailures });
        this.errorCallback?.(error, { phase: 'fetch' });
        if (isCursorExpiredError(error)) {
          this.gapCallback?.({ reason: 'cursor-expired', cursor, fromLedger: this.lastLedger });
        }
        const backoff = Math.min(baseBackoffMs * 2 ** (this.consecutiveFailures - 1), maxBackoffMs);
        schedule(intervalMs + backoff);
        return;
      }

      const recovering = this.consecutiveFailures > 0;
      if (recovering) {
        this.reconnectCallback?.({ cursor, failures: this.consecutiveFailures });
        logger.info('Event polling reconnected', { failures: this.consecutiveFailures });
      }
      this.consecutiveFailures = 0;

      const fresh = events.filter(
        (e): e is ParsedTrustFlowEvent => Boolean(e) && typeof e.type === 'string',
      );
      // Track keys accepted earlier in this same batch too, so a page that repeats an
      // event (common when the RPC resends the cursor's event) dispatches it once.
      const batchKeys = new Set<string>();
      const deduped = fresh.filter((e) => {
        const key = e.pagingToken || e.id;
        if (this.seenSet.has(key) || batchKeys.has(key)) return false;
        batchKeys.add(key);
        return true;
      });

      if (deduped.length > 0 && this.lastLedger !== undefined) {
        const minLedger = Math.min(...deduped.map((e) => e.ledger));
        if (minLedger > this.lastLedger + 1) {
          this.gapCallback?.({
            reason: 'ledger-discontinuity',
            fromLedger: this.lastLedger,
            toLedger: minLedger,
          });
          logger.warn('Event ledger gap detected', { from: this.lastLedger, to: minLedger });
        }
      }

      if (deduped.length > 0) {
        this.deliver(deduped);
        for (const e of deduped) remember(e.pagingToken || e.id);
        this.lastLedger = Math.max(...deduped.map((e) => e.ledger), this.lastLedger ?? -Infinity);
        const newest = deduped[deduped.length - 1];
        const nextCursor = newest.pagingToken || newest.id;
        this.lastCursor = nextCursor;
        try {
          await store.set(nextCursor);
        } catch (error) {
          logger.error('Cursor store write failed', error);
        }
        logger.debug('Resilient poll delivered events', {
          count: deduped.length,
          cursor: nextCursor,
        });
      }

      // After a reconnect, poll again straight away while new events keep arriving, so the
      // missed ledgers are replayed in order before live polling resumes at `intervalMs`.
      if (deduped.length === 0) {
        this.catchingUp = false;
      } else if (recovering) {
        this.catchingUp = true;
      }
      schedule(this.catchingUp ? 0 : intervalMs);
    };

    void tick();
  }

  /**
   * Start resilient polling from a raw `getEvents`-style fetcher. Events are
   * parsed with `parseEvents(raw, contractId)` before dedup/delivery, so
   * `pagingToken` is preserved for cursor resumption.
   */
  startResilientRawPolling(
    intervalMs: number,
    contractId: string,
    fetchRaw: (cursor?: string) => Promise<RawContractEvent[]>,
    options: ResilientPollingOptions = {},
  ): void {
    this.startResilientPolling(
      intervalMs,
      async (cursor) => parseEvents(await fetchRaw(cursor), contractId),
      options,
    );
  }

  /**
   * Returns an async iterator for paginating through historical contract events.
   *
   * The iterator automatically handles cursor pagination and can be cancelled via AbortSignal.
   * Uses `for await...of` to iterate through events:
   *
   * @param fetchFn - Cursor-aware fetcher that returns parsed events
   * @param options - Iterator options (cursor, limit, abort signal)
   * @returns An async iterable that yields ParsedTrustFlowEvent
   *
   * @example
   * ```ts
   * const monitor = new EscrowMonitor();
   * const iterator = monitor.getEventsIterator(async (cursor) => {
   *   const page = await fetchContractEvents(server, { contractId, cursor });
   *   return parseEvents(page.events, contractId);
   * });
   *
   * for await (const event of iterator) {
   *   console.log(event.type, event.data);
   * }
   * ```
   */
  getEventsIterator(
    fetchFn: CursorAwareFetchFn,
    options: EventsIteratorOptions = {},
  ): AsyncIterable<ParsedTrustFlowEvent> {
    return new EventsIterator(fetchFn, options);
  }

  stopPolling(): void {
    const pollingInterval = this.pollingInterval;
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
    this.resilientStopped = true;
    if (this.resilientTimer) {
      clearTimeout(this.resilientTimer);
      this.resilientTimer = undefined;
    }
  }
}

/** Heuristic: RPC errors mentioning cursor/retention/expiry mean the saved position is gone. */
function isCursorExpiredError(error: unknown): boolean {
  const message =
    error instanceof Error ? `${error.message} ${(error as Error).cause ?? ''}` : String(error);
  return /cursor|retention|expired|prun|behind|gap/i.test(message);
}
