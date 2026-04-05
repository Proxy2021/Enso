/**
 * SharedContextBus — Cross-card context sharing infrastructure.
 *
 * Enables Enso cards to publish structured data to named channels and
 * subscribe to updates from other cards.  Uses an EventEmitter-based
 * pub/sub pattern with per-client isolation, size limits, and TTL eviction.
 *
 * Design principles:
 * - Cards share **structured data only**, never raw conversation history.
 * - All channels are scoped to a `clientId` (per-browser-session isolation).
 * - Channels auto-evict after 30 minutes with no subscribers.
 */
import { EventEmitter } from "events";
import { logAction } from "./action-log.js";

// ── Types ────────────────────────────────────────────────────────────

export interface ContextChannel {
  name: string;                    // e.g., "research:findings", "photo:processed"
  publisherCardId: string;         // Card that created this channel
  clientId: string;                // Owner client (isolation boundary)
  lastUpdate: ContextUpdate;       // Most recent value (last-value cache)
  subscriberCardIds: Set<string>;  // Cards receiving updates
  createdAt: number;
  updatedAt: number;
}

export interface ContextUpdate {
  channelName: string;
  publisherCardId: string;
  summary: string;                 // Human-readable description (for agent prompts)
  data: Record<string, unknown>;   // Structured payload
  timestamp: number;
  version: number;                 // Monotonic counter for ordering
}

// ── Limits ───────────────────────────────────────────────────────────

const MAX_CHANNELS_PER_CLIENT = 50;
const MAX_CHANNEL_SIZE_BYTES = 256 * 1024;  // 256 KB per channel payload
const CHANNEL_TTL_MS = 30 * 60 * 1000;      // 30 minutes with no subscribers
const EVICTION_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

// ── SharedContextBus ─────────────────────────────────────────────────

export class SharedContextBus {
  private channels = new Map<string, ContextChannel>();
  private emitter = new EventEmitter();
  private evictionTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.emitter.setMaxListeners(200);
    this.evictionTimer = setInterval(() => this.evictStale(), EVICTION_INTERVAL_MS);
  }

  // ── Publish ──────────────────────────────────────────────────────

  /**
   * Publish structured data to a channel (creates if not exists).
   * Returns `true` on success, `false` if size/channel-limit exceeded.
   */
  publish(
    clientId: string,
    channelName: string,
    publisherCardId: string,
    summary: string,
    data: Record<string, unknown>,
  ): boolean {
    const key = this.key(clientId, channelName);

    // Size guard
    const dataSize = JSON.stringify(data).length;
    if (dataSize > MAX_CHANNEL_SIZE_BYTES) return false;

    // Channel limit guard
    if (!this.channels.has(key)) {
      const clientCount = this.countClientChannels(clientId);
      if (clientCount >= MAX_CHANNELS_PER_CLIENT) return false;
    }

    let channel = this.channels.get(key);
    const version = channel ? channel.lastUpdate.version + 1 : 1;

    const update: ContextUpdate = {
      channelName,
      publisherCardId,
      summary,
      data,
      timestamp: Date.now(),
      version,
    };

    if (!channel) {
      channel = {
        name: channelName,
        publisherCardId,
        clientId,
        lastUpdate: update,
        subscriberCardIds: new Set(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.channels.set(key, channel);
    } else {
      channel.lastUpdate = update;
      channel.updatedAt = Date.now();
    }

    // Emit to subscribers
    this.emitter.emit(key, update);
    return true;
  }

  // ── Subscribe ────────────────────────────────────────────────────

  /**
   * Subscribe a card to a channel.  Returns an unsubscribe function.
   * If the channel already has data, the callback is NOT invoked
   * retroactively — use `getLatest()` for the current value.
   */
  subscribe(
    clientId: string,
    channelName: string,
    subscriberCardId: string,
    callback: (update: ContextUpdate) => void,
  ): () => void {
    const key = this.key(clientId, channelName);

    const channel = this.channels.get(key);
    if (channel) {
      channel.subscriberCardIds.add(subscriberCardId);
    }

    const listener = (update: ContextUpdate) => callback(update);
    this.emitter.on(key, listener);

    return () => {
      this.emitter.off(key, listener);
      const ch = this.channels.get(key);
      if (ch) ch.subscriberCardIds.delete(subscriberCardId);
    };
  }

  // ── Read ─────────────────────────────────────────────────────────

  /** Get the most recent update for a channel (last-value cache). */
  getLatest(clientId: string, channelName: string): ContextUpdate | null {
    return this.channels.get(this.key(clientId, channelName))?.lastUpdate ?? null;
  }

  /** List all channels for a client (for discovery). */
  listChannels(clientId: string): Array<{
    name: string;
    publisherCardId: string;
    summary: string;
    updatedAt: number;
    subscriberCount: number;
  }> {
    const prefix = `${clientId}:`;
    const result: Array<{
      name: string;
      publisherCardId: string;
      summary: string;
      updatedAt: number;
      subscriberCount: number;
    }> = [];
    for (const [key, channel] of this.channels) {
      if (key.startsWith(prefix)) {
        result.push({
          name: channel.name,
          publisherCardId: channel.publisherCardId,
          summary: channel.lastUpdate.summary,
          updatedAt: channel.updatedAt,
          subscriberCount: channel.subscriberCardIds.size,
        });
      }
    }
    return result;
  }

  // ── Cleanup ──────────────────────────────────────────────────────

  /** Remove all subscriptions for a given card (call on card close). */
  unsubscribeAll(cardId: string): void {
    for (const channel of this.channels.values()) {
      channel.subscriberCardIds.delete(cardId);
    }
    // Note: EventEmitter listeners are cleaned up via the unsubscribe
    // functions returned by subscribe(). This method only cleans the
    // subscriber tracking set.
  }

  /** Remove a channel entirely (e.g., when the publisher card is deleted). */
  removeChannel(clientId: string, channelName: string): boolean {
    const key = this.key(clientId, channelName);
    return this.channels.delete(key);
  }

  /** Tear down the bus (for tests and graceful shutdown). */
  destroy(): void {
    clearInterval(this.evictionTimer);
    this.emitter.removeAllListeners();
    this.channels.clear();
  }

  // ── Internals ────────────────────────────────────────────────────

  private key(clientId: string, channelName: string): string {
    return `${clientId}:${channelName}`;
  }

  private countClientChannels(clientId: string): number {
    const prefix = `${clientId}:`;
    let count = 0;
    for (const key of this.channels.keys()) {
      if (key.startsWith(prefix)) count++;
    }
    return count;
  }

  private evictStale(): void {
    const now = Date.now();
    for (const [key, channel] of this.channels) {
      if (
        channel.subscriberCardIds.size === 0 &&
        now - channel.updatedAt > CHANNEL_TTL_MS
      ) {
        this.channels.delete(key);
        logAction({
          ts: now,
          type: "info",
          category: "context-bus",
          message: `Evicted stale channel: ${channel.name}`,
        });
      }
    }
  }
}

// ── Singleton ────────────────────────────────────────────────────────

export const contextBus = new SharedContextBus();
