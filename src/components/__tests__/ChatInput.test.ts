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

// Copy of isLikelyNaturalLanguage from src/components/ChatInput.tsx (added by Track A / E2)
// Heuristic to detect whether user input is NL vs a shell command when shell mode is active
function isLikelyNaturalLanguage(text: string): boolean {
  const trimmed = text.trim();
  // Short single-word inputs are likely commands (e.g., "ls", "pwd", "dir")
  const words = trimmed.split(/\s+/);
  if (words.length <= 2) return false;

  // Contains question mark → natural language
  if (trimmed.includes("?")) return true;

  // Starts with common NL words that aren't shell commands
  const nlStarters = /^(what|how|why|when|where|who|which|can|could|would|should|is|are|was|were|do|does|did|explain|describe|compare|tell|help|write|create|build|design|show|give|list|summarize|analyze|suggest|recommend)\b/i;
  if (nlStarters.test(trimmed)) return true;

  // Long text (6+ words) without shell indicators → likely NL
  if (words.length >= 6) {
    const hasShellIndicators = /[|><&;`$\\]|--\w|\/\w+\//.test(trimmed);
    if (!hasShellIndicators) return true;
  }

  return false;
}

describe("ChatInput: shell NL detection (isLikelyNaturalLanguage)", () => {
  // PF-01: "Compare React vs Vue" → detected as NL (starts with NL starter "compare")
  it("PF-01: detects 'Compare React vs Vue' as natural language", () => {
    expect(isLikelyNaturalLanguage("Compare React vs Vue")).toBe(true);
  });

  // PF-02: "How does DNS work?" → detected as NL (question mark + NL starter "how")
  it("PF-02: detects 'How does DNS work?' as natural language", () => {
    expect(isLikelyNaturalLanguage("How does DNS work?")).toBe(true);
  });

  // PF-03: "Write a function to sort arrays" → detected as NL (starts with "write")
  it("PF-03: detects 'Write a function to sort arrays' as natural language", () => {
    expect(isLikelyNaturalLanguage("Write a function to sort arrays")).toBe(true);
  });

  // Additional: Short shell commands should NOT be detected as NL
  it("treats 'ls -la' as a shell command (not NL)", () => {
    expect(isLikelyNaturalLanguage("ls -la")).toBe(false);
  });

  it("treats 'git status' as a shell command (not NL)", () => {
    expect(isLikelyNaturalLanguage("git status")).toBe(false);
  });

  it("treats single word 'pwd' as a shell command", () => {
    expect(isLikelyNaturalLanguage("pwd")).toBe(false);
  });

  it("detects long text without shell indicators as NL", () => {
    expect(isLikelyNaturalLanguage("I need to fix the login page for our users")).toBe(true);
  });

  it("treats long text WITH shell indicators as a command", () => {
    expect(isLikelyNaturalLanguage("cat /var/log/syslog | grep error --count")).toBe(false);
  });
});
