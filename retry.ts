/**
 * @module events
 * Event subscription system for Sui on-chain events.
 * Enables reactive agents that respond to TaskPosted, ReputationChanged, etc.
 */

import type { SuiClient, SuiEvent, EventId } from "@mysten/sui/client";

// ── Types ────────────────────────────────────────────────────────────────────

export interface EventFilter {
  /** Move event type, e.g. "0x...::sui_task_market::TaskPosted" */
  eventType: string;
  /** Optional field-level filter on parsed JSON */
  match?: Record<string, unknown>;
}

export type EventHandler = (event: SuiEvent) => void | Promise<void>;

export interface SubscriptionOptions {
  /** Polling interval in ms (default: 2000) */
  pollIntervalMs?: number;
  /** Start from this cursor (default: latest) */
  startCursor?: EventId;
  /** Max events per poll (default: 50) */
  limit?: number;
  /** Error callback */
  onError?: (error: Error) => void;
}

interface ActiveSubscription {
  filter: EventFilter;
  handler: EventHandler;
  options: Required<SubscriptionOptions>;
  cursor: EventId | null;
  timer: ReturnType<typeof setInterval> | null;
  active: boolean;
}

// ── Event Subscriber ─────────────────────────────────────────────────────────

export class EventSubscriber {
  private subscriptions = new Map<string, ActiveSubscription>();
  private subCounter = 0;

  constructor(private readonly client: SuiClient) {}

  /**
   * Subscribe to a Sui Move event type with optional field-level filtering.
   *
   * @returns Subscription ID — pass to `unsubscribe()` to stop.
   *
   * @example
   * ```ts
   * const sub = subscriber.on(
   *   { eventType: `${PKG}::sui_task_market::TaskPosted` },
   *   async (event) => {
   *     const task = event.parsedJson as TaskPostedEvent;
   *     if (task.capability === "data") {
   *       await claimTask(task.id);
   *     }
   *   }
   * );
   * ```
   */
  on(filter: EventFilter, handler: EventHandler, options?: SubscriptionOptions): string {
    const id = `sub_${++this.subCounter}`;
    const opts: Required<SubscriptionOptions> = {
      pollIntervalMs: options?.pollIntervalMs ?? 2000,
      startCursor: options?.startCursor ?? (null as unknown as EventId),
      limit: options?.limit ?? 50,
      onError: options?.onError ?? ((err) => console.error(`[sui-agent-kit] Event error:`, err)),
    };

    const sub: ActiveSubscription = {
      filter,
      handler,
      options: opts,
      cursor: opts.startCursor || null,
      timer: null,
      active: true,
    };

    sub.timer = setInterval(() => this.poll(id), opts.pollIntervalMs);
    this.subscriptions.set(id, sub);

    // Fire immediate first poll
    this.poll(id);

    return id;
  }

  /**
   * Stop a subscription.
   */
  unsubscribe(subscriptionId: string): boolean {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return false;

    sub.active = false;
    if (sub.timer) clearInterval(sub.timer);
    this.subscriptions.delete(subscriptionId);
    return true;
  }

  /**
   * Stop all subscriptions.
   */
  unsubscribeAll(): void {
    for (const [id] of this.subscriptions) {
      this.unsubscribe(id);
    }
  }

  /**
   * Get count of active subscriptions.
   */
  get activeCount(): number {
    return this.subscriptions.size;
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private async poll(subId: string): Promise<void> {
    const sub = this.subscriptions.get(subId);
    if (!sub || !sub.active) return;

    try {
      const { data, nextCursor, hasNextPage } = await this.client.queryEvents({
        query: { MoveEventType: sub.filter.eventType },
        cursor: sub.cursor ?? undefined,
        limit: sub.options.limit,
        order: "ascending",
      });

      for (const event of data) {
        // Apply field-level filter if provided
        if (sub.filter.match && !this.matchesFilter(event, sub.filter.match)) {
          continue;
        }

        try {
          await sub.handler(event);
        } catch (handlerErr) {
          sub.options.onError(
            handlerErr instanceof Error
              ? handlerErr
              : new Error(String(handlerErr))
          );
        }
      }

      // Advance cursor
      if (nextCursor) {
        sub.cursor = nextCursor;
      }

      // If there's more data, poll again immediately
      if (hasNextPage && sub.active) {
        await this.poll(subId);
      }
    } catch (err) {
      sub.options.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private matchesFilter(event: SuiEvent, match: Record<string, unknown>): boolean {
    const parsed = event.parsedJson as Record<string, unknown> | undefined;
    if (!parsed) return false;

    return Object.entries(match).every(([key, value]) => parsed[key] === value);
  }
}

// ── Convenience: Typed Event Helpers ─────────────────────────────────────────

/**
 * Create a typed event subscription helper for a specific package.
 *
 * @example
 * ```ts
 * const events = createEventHelpers(client, PACKAGE_ID);
 * events.onTaskPosted((task) => console.log("New task:", task.title));
 * ```
 */
export function createEventHelpers(client: SuiClient, packageId: string) {
  const subscriber = new EventSubscriber(client);
  const eventType = (module: string, event: string) =>
    `${packageId}::${module}::${event}`;

  return {
    subscriber,

    onTaskPosted(handler: (data: Record<string, unknown>) => void | Promise<void>, opts?: SubscriptionOptions) {
      return subscriber.on(
        { eventType: eventType("sui_task_market", "TaskPosted") },
        (e) => handler(e.parsedJson as Record<string, unknown>),
        opts
      );
    },

    onTaskClaimed(handler: (data: Record<string, unknown>) => void | Promise<void>, opts?: SubscriptionOptions) {
      return subscriber.on(
        { eventType: eventType("sui_task_market", "TaskClaimed") },
        (e) => handler(e.parsedJson as Record<string, unknown>),
        opts
      );
    },

    onTaskFulfilled(handler: (data: Record<string, unknown>) => void | Promise<void>, opts?: SubscriptionOptions) {
      return subscriber.on(
        { eventType: eventType("sui_task_market", "TaskFulfilled") },
        (e) => handler(e.parsedJson as Record<string, unknown>),
        opts
      );
    },

    onReputationChanged(handler: (data: Record<string, unknown>) => void | Promise<void>, opts?: SubscriptionOptions) {
      return subscriber.on(
        { eventType: eventType("sui_reputation", "ReputationChanged") },
        (e) => handler(e.parsedJson as Record<string, unknown>),
        opts
      );
    },

    onPaymentReceived(handler: (data: Record<string, unknown>) => void | Promise<void>, opts?: SubscriptionOptions) {
      return subscriber.on(
        { eventType: eventType("sui_x402_pay", "PaymentReceived") },
        (e) => handler(e.parsedJson as Record<string, unknown>),
        opts
      );
    },

    onAgentRegistered(handler: (data: Record<string, unknown>) => void | Promise<void>, opts?: SubscriptionOptions) {
      return subscriber.on(
        { eventType: eventType("sui_agent_identity", "AgentRegistered") },
        (e) => handler(e.parsedJson as Record<string, unknown>),
        opts
      );
    },

    destroy() {
      subscriber.unsubscribeAll();
    },
  };
}
