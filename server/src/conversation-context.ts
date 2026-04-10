/**
 * Conversation Context Registry — General-purpose framework for context-aware conversations.
 *
 * Features (focus areas, projects, data sources, etc.) register as context providers
 * for specific conversations. This enables:
 *   1. Context-aware system prompt injection (agent knows what the conversation is about)
 *   2. Proactive messages (agent reaches out when state changes)
 *   3. Event-driven triggers (external events surface relevant insights)
 *
 * The registry is a singleton — import `contextRegistry` and use it anywhere.
 */

import { logAction, logError } from "./action-log.js";

// ── Types ──

export interface ProactiveMessage {
  text: string;
  priority: "low" | "medium" | "high";
  /** Prevent duplicate delivery — messages with same dedupKey within 1h are suppressed */
  dedupKey?: string;
}

export interface ContextEvent {
  type: string;                          // e.g. "cortex.entity.created", "sprint.completed"
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface ConversationContextProvider {
  /** Provider type — "focus", "project", "data-source", etc. */
  type: string;
  /** ID of the source object — focusId, projectId, etc. */
  sourceId: string;

  /** Build context string for injection into the agent's system prompt */
  getContextForPrompt(): Promise<string>;

  /** Check for pending proactive messages (called periodically by the delivery loop) */
  getProactiveMessages(): Promise<ProactiveMessage[]>;

  /** Handle an external event — return a message if relevant, null otherwise */
  onEvent(event: ContextEvent): Promise<ProactiveMessage | null>;
}

// ── Registry ──

const DEDUP_TTL = 60 * 60 * 1000; // 1 hour

class ConversationContextRegistry {
  /** conversationId → provider */
  private providers = new Map<string, ConversationContextProvider>();
  /** dedupKey → delivery timestamp */
  private delivered = new Map<string, number>();

  register(conversationId: string, provider: ConversationContextProvider): void {
    this.providers.set(conversationId, provider);
    logAction({
      ts: Date.now(), type: "action", category: "conversation-context",
      message: `Registered ${provider.type} provider for conv=${conversationId.slice(0, 20)} (source=${provider.sourceId})`,
    });
  }

  unregister(conversationId: string): void {
    this.providers.delete(conversationId);
  }

  getProvider(conversationId: string): ConversationContextProvider | null {
    return this.providers.get(conversationId) ?? null;
  }

  /** Get context string for system prompt injection (returns "" if no provider) */
  async getContextForPrompt(conversationId: string): Promise<string> {
    const provider = this.providers.get(conversationId);
    if (!provider) return "";
    try {
      return await provider.getContextForPrompt();
    } catch (err) {
      logError("conversation-context", `getContextForPrompt failed for ${provider.type}:${provider.sourceId}`, err);
      return "";
    }
  }

  /**
   * Emit an event to ALL registered providers.
   * Returns a map of conversationId → triggered message (only for providers that responded).
   */
  async emitEvent(event: ContextEvent): Promise<Map<string, ProactiveMessage>> {
    const results = new Map<string, ProactiveMessage>();
    const entries = Array.from(this.providers.entries());

    await Promise.all(entries.map(async ([convId, provider]) => {
      try {
        const msg = await provider.onEvent(event);
        if (msg && this.shouldDeliver(msg)) {
          results.set(convId, msg);
          this.markDelivered(msg);
        }
      } catch (err) {
        logError("conversation-context", `onEvent failed for ${provider.type}:${provider.sourceId}`, err);
      }
    }));

    return results;
  }

  /**
   * Check all providers for pending proactive messages.
   * Returns a map of conversationId → messages (only non-empty).
   */
  async checkProactive(): Promise<Map<string, ProactiveMessage[]>> {
    const results = new Map<string, ProactiveMessage[]>();
    const entries = Array.from(this.providers.entries());

    await Promise.all(entries.map(async ([convId, provider]) => {
      try {
        const msgs = await provider.getProactiveMessages();
        const filtered = msgs.filter(m => this.shouldDeliver(m));
        if (filtered.length > 0) {
          results.set(convId, filtered);
          for (const m of filtered) this.markDelivered(m);
        }
      } catch (err) {
        logError("conversation-context", `checkProactive failed for ${provider.type}:${provider.sourceId}`, err);
      }
    }));

    return results;
  }

  /** List all registered conversations (for debugging / status) */
  listRegistered(): Array<{ conversationId: string; type: string; sourceId: string }> {
    return Array.from(this.providers.entries()).map(([convId, p]) => ({
      conversationId: convId,
      type: p.type,
      sourceId: p.sourceId,
    }));
  }

  // ── Dedup ──

  private shouldDeliver(msg: ProactiveMessage): boolean {
    if (!msg.dedupKey) return true;
    const lastDelivered = this.delivered.get(msg.dedupKey);
    if (!lastDelivered) return true;
    return Date.now() - lastDelivered > DEDUP_TTL;
  }

  private markDelivered(msg: ProactiveMessage): void {
    if (msg.dedupKey) {
      this.delivered.set(msg.dedupKey, Date.now());
    }
    // Prune stale dedup entries
    if (this.delivered.size > 200) {
      const cutoff = Date.now() - DEDUP_TTL;
      for (const [key, ts] of this.delivered) {
        if (ts < cutoff) this.delivered.delete(key);
      }
    }
  }
}

/** Singleton registry — import this everywhere */
export const contextRegistry = new ConversationContextRegistry();
