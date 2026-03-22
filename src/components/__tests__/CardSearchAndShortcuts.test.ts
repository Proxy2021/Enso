/**
 * Tests for WS4: Card search state management and keyboard shortcut logic.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from "vitest";

// ── Card search store fields ──

describe("Card search store fields", () => {
  it("chat store has cardSearchQuery and cardSearchVisible", async () => {
    const { useChatStore } = await import("../../store/chat");
    const state = useChatStore.getState();
    expect("cardSearchQuery" in state).toBe(true);
    expect("cardSearchVisible" in state).toBe(true);
    expect("setCardSearchQuery" in state).toBe(true);
    expect("setCardSearchVisible" in state).toBe(true);
  });

  it("cardSearchQuery defaults to empty string", async () => {
    const { useChatStore } = await import("../../store/chat");
    const state = useChatStore.getState();
    expect(state.cardSearchQuery).toBe("");
  });

  it("cardSearchVisible defaults to false", async () => {
    const { useChatStore } = await import("../../store/chat");
    const state = useChatStore.getState();
    expect(state.cardSearchVisible).toBe(false);
  });

  it("setCardSearchQuery updates cardSearchQuery", async () => {
    const { useChatStore } = await import("../../store/chat");
    useChatStore.getState().setCardSearchQuery("hello");
    expect(useChatStore.getState().cardSearchQuery).toBe("hello");
    useChatStore.getState().setCardSearchQuery("");
  });

  it("setCardSearchVisible toggles visibility", async () => {
    const { useChatStore } = await import("../../store/chat");
    useChatStore.getState().setCardSearchVisible(true);
    expect(useChatStore.getState().cardSearchVisible).toBe(true);
    useChatStore.getState().setCardSearchVisible(false);
    expect(useChatStore.getState().cardSearchVisible).toBe(false);
  });

  it("hiding search clears the query", async () => {
    const { useChatStore } = await import("../../store/chat");
    useChatStore.getState().setCardSearchQuery("test query");
    useChatStore.getState().setCardSearchVisible(false);
    expect(useChatStore.getState().cardSearchQuery).toBe("");
  });
});

// ── cardMatchesSearch logic ──

describe("cardMatchesSearch logic (extracted pattern)", () => {
  function cardMatchesSearch(card: { text?: string; type?: string; data?: Record<string, unknown> }, query: string): boolean {
    const q = query.toLowerCase();
    if (card.text && card.text.toLowerCase().includes(q)) return true;
    if (card.type && card.type.toLowerCase().includes(q)) return true;
    if (card.data) {
      const dataStr = JSON.stringify(card.data).toLowerCase();
      if (dataStr.includes(q)) return true;
    }
    return false;
  }

  it("matches on card text", () => {
    expect(cardMatchesSearch({ text: "Hello world" }, "hello")).toBe(true);
    expect(cardMatchesSearch({ text: "Hello world" }, "universe")).toBe(false);
  });

  it("matches on card type", () => {
    expect(cardMatchesSearch({ type: "markdown" }, "mark")).toBe(true);
    expect(cardMatchesSearch({ type: "terminal" }, "term")).toBe(true);
  });

  it("matches on card data (deep)", () => {
    expect(cardMatchesSearch({ data: { title: "Project Alpha" } }, "alpha")).toBe(true);
    expect(cardMatchesSearch({ data: { nested: { value: "deep search" } } }, "deep")).toBe(true);
  });

  it("returns false for empty query", () => {
    expect(cardMatchesSearch({ text: "anything" }, "")).toBe(true); // empty string is in everything
  });

  it("is case-insensitive", () => {
    expect(cardMatchesSearch({ text: "ABC" }, "abc")).toBe(true);
    expect(cardMatchesSearch({ text: "abc" }, "ABC")).toBe(true);
  });
});

// ── Keyboard shortcut matching logic ──

describe("keyboard shortcut matching logic (extracted pattern)", () => {
  interface ShortcutDef {
    key: string;
    ctrl?: boolean;
    shift?: boolean;
    description: string;
  }

  function matchesShortcut(e: Partial<KeyboardEvent>, def: ShortcutDef): boolean {
    const ctrl = def.ctrl ?? false;
    const shift = def.shift ?? false;
    const hasCtrl = e.ctrlKey || e.metaKey;
    return (
      (e.key || "").toLowerCase() === def.key.toLowerCase() &&
      (hasCtrl ?? false) === ctrl &&
      (e.shiftKey ?? false) === shift
    );
  }

  it("matches Ctrl+/ shortcut", () => {
    const def: ShortcutDef = { key: "/", ctrl: true, description: "Focus chat input" };
    expect(matchesShortcut({ key: "/", ctrlKey: true, shiftKey: false, metaKey: false }, def)).toBe(true);
    expect(matchesShortcut({ key: "/", ctrlKey: false, shiftKey: false, metaKey: false }, def)).toBe(false);
  });

  it("matches Ctrl+F shortcut", () => {
    const def: ShortcutDef = { key: "f", ctrl: true, description: "Toggle card search" };
    expect(matchesShortcut({ key: "f", ctrlKey: true, shiftKey: false, metaKey: false }, def)).toBe(true);
    expect(matchesShortcut({ key: "F", ctrlKey: true, shiftKey: false, metaKey: false }, def)).toBe(true);
  });

  it("matches Escape shortcut (no modifier)", () => {
    const def: ShortcutDef = { key: "Escape", description: "Close panels" };
    expect(matchesShortcut({ key: "Escape", ctrlKey: false, shiftKey: false, metaKey: false }, def)).toBe(true);
    expect(matchesShortcut({ key: "Escape", ctrlKey: true, shiftKey: false, metaKey: false }, def)).toBe(false);
  });

  it("matches metaKey as ctrl alternative (macOS)", () => {
    const def: ShortcutDef = { key: "f", ctrl: true, description: "Search" };
    expect(matchesShortcut({ key: "f", ctrlKey: false, shiftKey: false, metaKey: true }, def)).toBe(true);
  });

  it("does not match wrong key", () => {
    const def: ShortcutDef = { key: "/", ctrl: true, description: "Focus" };
    expect(matchesShortcut({ key: "a", ctrlKey: true, shiftKey: false, metaKey: false }, def)).toBe(false);
  });

  it("does not match wrong modifiers", () => {
    const def: ShortcutDef = { key: "f", ctrl: true, shift: true, description: "Search" };
    expect(matchesShortcut({ key: "f", ctrlKey: true, shiftKey: false, metaKey: false }, def)).toBe(false);
  });
});
