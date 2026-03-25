import { describe, it, expect } from "vitest";

/**
 * Tests for the hasOnlyBackgroundTasks logic in CardTimeline.
 * Bug B2: When no cards were streaming yet (initial wait after sending
 * a message), the function returned true, which suppressed the typing
 * indicator. Fix: only return true when there ARE streaming cards and
 * all are background tasks.
 */

interface MockCard {
  status: string;
  type?: string;
  deepResearchStatus?: string;
}

/** Extracted and simplified from CardTimeline.tsx hasOnlyBackgroundTasks */
function hasOnlyBackgroundTasks(
  cards: Record<string, MockCard>,
  cardOrder: string[],
): boolean {
  let hasAnyStreaming = false;
  let hasForegroundStreaming = false;
  for (const id of cardOrder) {
    const c = cards[id];
    if (!c || c.status !== "streaming") continue;
    hasAnyStreaming = true;
    if (
      c.type === "terminal" ||
      c.type === "shell" ||
      c.type === "orchestration" ||
      c.deepResearchStatus === "building"
    ) {
      continue;
    }
    hasForegroundStreaming = true;
  }
  return hasAnyStreaming && !hasForegroundStreaming;
}

describe("CardTimeline: hasOnlyBackgroundTasks", () => {
  it("returns false when no cards exist (typing indicator should show)", () => {
    expect(hasOnlyBackgroundTasks({}, [])).toBe(false);
  });

  it("returns false when no cards are streaming (typing indicator should show)", () => {
    const cards: Record<string, MockCard> = {
      "1": { status: "complete", type: "user-bubble" },
    };
    expect(hasOnlyBackgroundTasks(cards, ["1"])).toBe(false);
  });

  it("returns true when only terminal cards are streaming", () => {
    const cards: Record<string, MockCard> = {
      "1": { status: "complete", type: "user-bubble" },
      "2": { status: "streaming", type: "terminal" },
    };
    expect(hasOnlyBackgroundTasks(cards, ["1", "2"])).toBe(true);
  });

  it("returns true when only orchestration cards are streaming", () => {
    const cards: Record<string, MockCard> = {
      "1": { status: "streaming", type: "orchestration" },
    };
    expect(hasOnlyBackgroundTasks(cards, ["1"])).toBe(true);
  });

  it("returns true when only shell cards are streaming", () => {
    const cards: Record<string, MockCard> = {
      "1": { status: "streaming", type: "shell" },
    };
    expect(hasOnlyBackgroundTasks(cards, ["1"])).toBe(true);
  });

  it("returns true when only deep research cards are streaming", () => {
    const cards: Record<string, MockCard> = {
      "1": { status: "streaming", deepResearchStatus: "building" },
    };
    expect(hasOnlyBackgroundTasks(cards, ["1"])).toBe(true);
  });

  it("returns false when a foreground card is streaming", () => {
    const cards: Record<string, MockCard> = {
      "1": { status: "streaming", type: "response" },
    };
    expect(hasOnlyBackgroundTasks(cards, ["1"])).toBe(false);
  });

  it("returns false when mixed background + foreground cards are streaming", () => {
    const cards: Record<string, MockCard> = {
      "1": { status: "streaming", type: "terminal" },
      "2": { status: "streaming", type: "response" },
    };
    expect(hasOnlyBackgroundTasks(cards, ["1", "2"])).toBe(false);
  });

  it("handles missing card gracefully", () => {
    const cards: Record<string, MockCard> = {};
    expect(hasOnlyBackgroundTasks(cards, ["nonexistent"])).toBe(false);
  });
});
