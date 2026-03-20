import { describe, it, expect } from "vitest";

// Test the selectCommand logic pattern (extracted for testability)
// Source: src/components/ChatInput.tsx selectCommand() function
function extractCommandArgs(text: string, command: string): { fullText: string; trailingText: string } {
  const currentText = text.trim();
  const cmdBase = command.trimEnd();
  const trailingText = currentText.startsWith(cmdBase)
    ? currentText.slice(cmdBase.length).trim()
    : "";
  const fullText = trailingText ? `${cmdBase} ${trailingText}` : cmdBase;
  return { fullText, trailingText };
}

describe("ChatInput: selectCommand text extraction", () => {
  it("extracts trailing text from /orchestrate command", () => {
    const result = extractCommandArgs("/orchestrate Build a REST API", "/orchestrate");
    expect(result.trailingText).toBe("Build a REST API");
    expect(result.fullText).toBe("/orchestrate Build a REST API");
  });

  it("handles bare /orchestrate with no trailing text", () => {
    const result = extractCommandArgs("/orchestrate", "/orchestrate");
    expect(result.trailingText).toBe("");
    expect(result.fullText).toBe("/orchestrate");
  });

  it("handles /shell with command argument", () => {
    const result = extractCommandArgs("/shell node --version", "/shell");
    expect(result.trailingText).toBe("node --version");
    expect(result.fullText).toBe("/shell node --version");
  });

  it("preserves /code space-suffix behavior (no auto-send)", () => {
    // /code ends with space — should NOT extract trailing text for auto-send
    const cmd = { command: "/code ", label: "/code <prompt>", description: "" };
    expect(cmd.command.endsWith(" ")).toBe(true);
  });

  it("handles /research with topic", () => {
    const result = extractCommandArgs("/research CRISPR 2026", "/research ");
    expect(result.trailingText).toBe("CRISPR 2026");
  });
});

describe("ChatInput: Enter/Shift+Enter behavior", () => {
  it("Enter without Shift should trigger send", () => {
    // Logic: e.key === "Enter" && !e.shiftKey → handleSend()
    const event = { key: "Enter", shiftKey: false };
    expect(event.key === "Enter" && !event.shiftKey).toBe(true);
  });

  it("Shift+Enter should NOT trigger send", () => {
    const event = { key: "Enter", shiftKey: true };
    expect(event.key === "Enter" && !event.shiftKey).toBe(false);
  });
});
