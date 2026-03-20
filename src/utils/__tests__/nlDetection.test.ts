import { describe, it, expect } from "vitest";
import { isLikelyNaturalLanguage } from "../nlDetection";

describe("isLikelyNaturalLanguage", () => {
  // NL inputs that should return true (escape shell)
  it.each([
    ["what is TypeScript?", "question with NL starter"],
    ["how does DNS work?", "question with NL starter"],
    ["explain this error message", "NL starter verb"],
    ["compare React vs Vue for this project", "NL starter + content"],
    ["why won't this compile?", "NL starter + question mark"],
    ["write a function that sorts an array and returns it", "NL starter + 6+ words"],
    ["is this a bug or a feature?", "NL starter + question mark"],
    ["can you help me understand this code pattern", "NL starter + long"],
    ["describe the architecture of this system in detail", "NL starter + long"],
  ])("returns true for: %s (%s)", (input) => {
    expect(isLikelyNaturalLanguage(input)).toBe(true);
  });

  // Shell commands that should return false (stay in shell)
  it.each([
    ["ls -la", "short command (2 words)"],
    ["git status", "short command (2 words)"],
    ["npm install react", "3 words but no NL markers"],
    ["docker run --rm -it nginx", "has shell indicators (--)"],
    ["echo hello world", "3 words, echo not NL starter"],
    ["cat README.md | head -20", "has shell indicators (|)"],
    ["cd /usr/local/bin", "has path indicator (/)"],
    ["grep -r 'TODO' src/", "has shell indicators (-)"],
    ["fix this", "only 2 words"],
    ["do it", "only 2 words"],
  ])("returns false for: %s (%s)", (input) => {
    expect(isLikelyNaturalLanguage(input)).toBe(false);
  });

  // Edge cases
  it("returns true for long input without shell indicators", () => {
    // 7 words, no NL starters, no shell indicators → true (6+ word rule)
    expect(isLikelyNaturalLanguage("npm install react router dom typescript vitest")).toBe(true);
  });

  it("returns false for long input with shell indicators", () => {
    expect(isLikelyNaturalLanguage("npm install --save react router dom typescript")).toBe(false);
  });

  // Escape hatch
  it("returns false when ! prefix is used", () => {
    expect(isLikelyNaturalLanguage("!what is TypeScript")).toBe(false);
    expect(isLikelyNaturalLanguage("!explain this error message")).toBe(false);
  });

  // Whitespace edge cases
  it("trims whitespace before checking", () => {
    expect(isLikelyNaturalLanguage("  what is TypeScript?  ")).toBe(true);
    expect(isLikelyNaturalLanguage("  ls -la  ")).toBe(false);
  });
});
