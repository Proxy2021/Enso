import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SharedContextBus } from "./context-bus.js";

vi.mock("./action-log.js", () => ({
  logAction: vi.fn(),
}));

describe("SharedContextBus", () => {
  let bus: SharedContextBus;

  beforeEach(() => {
    vi.useFakeTimers();
    bus = new SharedContextBus();
  });

  afterEach(() => {
    bus.destroy();
    vi.useRealTimers();
  });

  // ── publish ─────────────────────────────────────────────────────

  it("publishes to a new channel and returns true", () => {
    const ok = bus.publish("c1", "research:findings", "card-a", "Found results", { urls: ["https://example.com"] });
    expect(ok).toBe(true);
  });

  it("rejects payloads exceeding 256 KB", () => {
    const big = { blob: "x".repeat(300 * 1024) };
    const ok = bus.publish("c1", "big-channel", "card-a", "Too large", big);
    expect(ok).toBe(false);
  });

  it("rejects when channel limit (50) is exceeded", () => {
    for (let i = 0; i < 50; i++) {
      expect(bus.publish("c1", `ch-${i}`, "card-a", "ok", {})).toBe(true);
    }
    expect(bus.publish("c1", "ch-50", "card-a", "too many", {})).toBe(false);
  });

  it("channel limit is per-client", () => {
    for (let i = 0; i < 50; i++) {
      bus.publish("c1", `ch-${i}`, "card-a", "ok", {});
    }
    // Different client can still publish
    expect(bus.publish("c2", "ch-0", "card-b", "ok", {})).toBe(true);
  });

  it("increments version on subsequent publishes", () => {
    bus.publish("c1", "ch", "card-a", "v1", { v: 1 });
    bus.publish("c1", "ch", "card-a", "v2", { v: 2 });
    const latest = bus.getLatest("c1", "ch");
    expect(latest?.version).toBe(2);
    expect(latest?.data).toEqual({ v: 2 });
  });

  // ── subscribe ───────────────────────────────────────────────────

  it("subscriber receives updates after subscribing", () => {
    const received: unknown[] = [];
    bus.subscribe("c1", "ch", "card-b", (update) => received.push(update.data));

    bus.publish("c1", "ch", "card-a", "Hello", { msg: "hi" });
    expect(received).toEqual([{ msg: "hi" }]);
  });

  it("subscriber does NOT receive retroactive data", () => {
    bus.publish("c1", "ch", "card-a", "Before sub", { old: true });

    const received: unknown[] = [];
    bus.subscribe("c1", "ch", "card-b", (update) => received.push(update.data));

    expect(received).toEqual([]);
  });

  it("unsubscribe stops delivery", () => {
    const received: unknown[] = [];
    const unsub = bus.subscribe("c1", "ch", "card-b", (update) => received.push(update.data));

    bus.publish("c1", "ch", "card-a", "First", { n: 1 });
    unsub();
    bus.publish("c1", "ch", "card-a", "Second", { n: 2 });

    expect(received).toEqual([{ n: 1 }]);
  });

  it("multiple subscribers on same channel all receive", () => {
    const r1: unknown[] = [];
    const r2: unknown[] = [];
    bus.subscribe("c1", "ch", "card-b", (u) => r1.push(u.data));
    bus.subscribe("c1", "ch", "card-c", (u) => r2.push(u.data));

    bus.publish("c1", "ch", "card-a", "Shared", { x: 1 });
    expect(r1).toEqual([{ x: 1 }]);
    expect(r2).toEqual([{ x: 1 }]);
  });

  // ── getLatest ───────────────────────────────────────────────────

  it("returns null for unknown channel", () => {
    expect(bus.getLatest("c1", "nonexistent")).toBeNull();
  });

  it("returns last published value", () => {
    bus.publish("c1", "ch", "card-a", "First", { n: 1 });
    bus.publish("c1", "ch", "card-a", "Second", { n: 2 });
    expect(bus.getLatest("c1", "ch")?.summary).toBe("Second");
  });

  // ── listChannels ──────────────────────────────────────────────

  it("lists channels for a client", () => {
    bus.publish("c1", "alpha", "card-a", "Alpha", {});
    bus.publish("c1", "beta", "card-a", "Beta", {});
    bus.publish("c2", "gamma", "card-b", "Gamma", {});

    const list = bus.listChannels("c1");
    expect(list).toHaveLength(2);
    expect(list.map((c) => c.name).sort()).toEqual(["alpha", "beta"]);
  });

  it("subscriberCount reflects active subscribers", () => {
    bus.publish("c1", "ch", "card-a", "Init", {});
    bus.subscribe("c1", "ch", "card-b", () => {});
    bus.subscribe("c1", "ch", "card-c", () => {});

    const list = bus.listChannels("c1");
    expect(list[0].subscriberCount).toBe(2);
  });

  // ── unsubscribeAll ────────────────────────────────────────────

  it("removes card from all channel subscriber sets", () => {
    bus.publish("c1", "ch1", "card-a", "Ch1", {});
    bus.publish("c1", "ch2", "card-a", "Ch2", {});
    bus.subscribe("c1", "ch1", "card-b", () => {});
    bus.subscribe("c1", "ch2", "card-b", () => {});

    bus.unsubscribeAll("card-b");

    const list = bus.listChannels("c1");
    expect(list.every((c) => c.subscriberCount === 0)).toBe(true);
  });

  // ── removeChannel ─────────────────────────────────────────────

  it("removes a channel entirely", () => {
    bus.publish("c1", "ch", "card-a", "Data", {});
    expect(bus.removeChannel("c1", "ch")).toBe(true);
    expect(bus.getLatest("c1", "ch")).toBeNull();
  });

  it("returns false for non-existent channel", () => {
    expect(bus.removeChannel("c1", "nope")).toBe(false);
  });

  // ── TTL eviction ──────────────────────────────────────────────

  it("evicts channels with no subscribers after TTL", () => {
    bus.publish("c1", "stale", "card-a", "Will expire", {});

    // Advance past 30-minute TTL + eviction interval
    vi.advanceTimersByTime(35 * 60 * 1000);

    expect(bus.getLatest("c1", "stale")).toBeNull();
  });

  it("does NOT evict channels with active subscribers", () => {
    bus.publish("c1", "active", "card-a", "Has subs", {});
    bus.subscribe("c1", "active", "card-b", () => {});

    vi.advanceTimersByTime(35 * 60 * 1000);

    expect(bus.getLatest("c1", "active")).not.toBeNull();
  });

  // ── client isolation ──────────────────────────────────────────

  it("channels are isolated per client", () => {
    bus.publish("c1", "shared-name", "card-a", "Client 1", { from: "c1" });
    bus.publish("c2", "shared-name", "card-b", "Client 2", { from: "c2" });

    expect(bus.getLatest("c1", "shared-name")?.data).toEqual({ from: "c1" });
    expect(bus.getLatest("c2", "shared-name")?.data).toEqual({ from: "c2" });
  });

  it("subscriber on one client does not receive from another", () => {
    const received: unknown[] = [];
    bus.subscribe("c1", "ch", "card-b", (u) => received.push(u.data));

    bus.publish("c2", "ch", "card-a", "Other client", { wrong: true });
    expect(received).toEqual([]);
  });

  // ── destroy ───────────────────────────────────────────────────

  it("destroy clears all state", () => {
    bus.publish("c1", "ch", "card-a", "Data", {});
    bus.destroy();
    expect(bus.getLatest("c1", "ch")).toBeNull();
    expect(bus.listChannels("c1")).toEqual([]);
  });
});
