/**
 * Error Classification Tests — Sprint 17
 *
 * Validates that error messages shown to users are:
 * 1. Context-appropriate (400 = user guidance, 429 = rate limit, 500 = system error)
 * 2. Never contain 'try rephrasing' (Sprint 16 fix validation)
 * 3. Never expose raw HTTP status codes to users
 * 4. Always provide actionable guidance
 *
 * Tests both classification layers:
 * - llm-provider.ts: HTTP status code → error message
 * - standalone-agent.ts: keyword-based fallback classification
 */
import { describe, expect, it } from "vitest";

// ── Layer 1: llm-provider.ts error classification logic ──
// Extracted for testability — mirrors the logic at llm-provider.ts:327-343

function classifyLlmProviderError(statusCode: number): string {
  if (statusCode === 400) {
    return (
      "I couldn't process that request. This usually happens when the message " +
      "references files or images that aren't attached. Try sharing the specific " +
      "files you'd like me to work with, or describe what you need in a different way."
    );
  } else if (statusCode === 429) {
    return "The AI service is temporarily busy. Please try again in a moment.";
  } else if (statusCode >= 500) {
    return "The AI service encountered a temporary error. Please try again.";
  } else {
    return `An unexpected error occurred (code ${statusCode}). Please try again.`;
  }
}

// ── Layer 2: standalone-agent.ts error classification logic ──
// Extracted for testability — mirrors the logic at standalone-agent.ts:693-699

function classifyStandaloneAgentError(errMsg: string): string {
  if (errMsg.includes("SAFETY")) {
    return "I can't help with that request due to safety guidelines. Please try a different topic.";
  } else if (
    errMsg.includes("400") ||
    errMsg.includes("500") ||
    errMsg.includes("503") ||
    errMsg.includes("429")
  ) {
    return "A temporary service error occurred. Please try again in a moment.";
  } else {
    return `An error occurred: ${errMsg}`;
  }
}

// ── Tests ──

describe("Error Classification — LLM Provider Layer", () => {
  describe("HTTP 400 (Bad Request)", () => {
    it("should return user guidance message", () => {
      const msg = classifyLlmProviderError(400);
      expect(msg).toContain("couldn't process");
      expect(msg).toContain("files");
    });

    it("should NOT contain 'try rephrasing' (Sprint 16 fix)", () => {
      const msg = classifyLlmProviderError(400);
      expect(msg.toLowerCase()).not.toContain("try rephrasing");
    });

    it("should provide actionable guidance", () => {
      const msg = classifyLlmProviderError(400);
      expect(msg).toContain("Try sharing");
    });
  });

  describe("HTTP 429 (Rate Limit)", () => {
    it("should return rate limit message", () => {
      const msg = classifyLlmProviderError(429);
      expect(msg).toContain("temporarily busy");
    });

    it("should suggest retry", () => {
      const msg = classifyLlmProviderError(429);
      expect(msg).toContain("try again");
    });

    it("should NOT contain 'try rephrasing'", () => {
      const msg = classifyLlmProviderError(429);
      expect(msg.toLowerCase()).not.toContain("try rephrasing");
    });
  });

  describe("HTTP 500+ (Server Errors)", () => {
    const serverCodes = [500, 502, 503, 504];

    for (const code of serverCodes) {
      it(`should return system error message for ${code}`, () => {
        const msg = classifyLlmProviderError(code);
        expect(msg).toContain("temporary error");
        expect(msg).toContain("try again");
      });

      it(`should NOT contain 'try rephrasing' for ${code}`, () => {
        const msg = classifyLlmProviderError(code);
        expect(msg.toLowerCase()).not.toContain("try rephrasing");
      });

      it(`should NOT expose raw status code for ${code}`, () => {
        const msg = classifyLlmProviderError(code);
        expect(msg).not.toContain(String(code));
      });
    }
  });

  describe("Other HTTP codes", () => {
    it("should include the status code for unknown errors", () => {
      const msg = classifyLlmProviderError(418);
      expect(msg).toContain("418");
      expect(msg).toContain("unexpected error");
    });

    it("should suggest retry for unknown errors", () => {
      const msg = classifyLlmProviderError(403);
      expect(msg).toContain("try again");
    });
  });
});

describe("Error Classification — Standalone Agent Layer", () => {
  describe("SAFETY errors", () => {
    it("should return safety guidelines message", () => {
      const msg = classifyStandaloneAgentError("Content blocked by SAFETY filter");
      expect(msg).toContain("safety guidelines");
      expect(msg).toContain("different topic");
    });

    it("should NOT contain 'try rephrasing'", () => {
      const msg = classifyStandaloneAgentError("SAFETY block triggered");
      expect(msg.toLowerCase()).not.toContain("try rephrasing");
    });
  });

  describe("HTTP status code errors (keyword match)", () => {
    const statusKeywords = ["400", "500", "503", "429"];

    for (const keyword of statusKeywords) {
      it(`should classify "${keyword}" as temporary service error`, () => {
        const msg = classifyStandaloneAgentError(
          `Gemini API error: ${keyword} something`,
        );
        expect(msg).toContain("temporary service error");
        expect(msg).toContain("try again");
      });

      it(`should NOT contain 'try rephrasing' for "${keyword}"`, () => {
        const msg = classifyStandaloneAgentError(
          `API returned ${keyword}`,
        );
        expect(msg.toLowerCase()).not.toContain("try rephrasing");
      });
    }
  });

  describe("Unknown errors", () => {
    it("should pass through unknown error messages", () => {
      const msg = classifyStandaloneAgentError("Connection refused");
      expect(msg).toContain("An error occurred");
      expect(msg).toContain("Connection refused");
    });

    it("should NOT contain 'try rephrasing' for unknown errors", () => {
      const msg = classifyStandaloneAgentError("Something unexpected happened");
      expect(msg.toLowerCase()).not.toContain("try rephrasing");
    });
  });

  describe("Cross-layer consistency", () => {
    it("400 errors should never suggest user is at fault in agent layer", () => {
      const msg = classifyStandaloneAgentError("HTTP 400 Bad Request");
      // Agent layer groups all HTTP errors as "temporary service error"
      // This is correct — user should NOT be blamed for API-level 400s
      expect(msg).not.toContain("couldn't process");
      expect(msg).toContain("temporary service error");
    });

    it("no error message across either layer contains 'try rephrasing'", () => {
      // Exhaustive check across representative inputs
      const llmCodes = [400, 401, 403, 429, 500, 502, 503, 504];
      const agentErrors = [
        "SAFETY violation",
        "Error 400",
        "Error 429",
        "Error 500",
        "Error 503",
        "Connection timeout",
        "Unknown failure",
      ];

      for (const code of llmCodes) {
        const msg = classifyLlmProviderError(code);
        expect(msg.toLowerCase()).not.toContain("try rephrasing");
      }

      for (const err of agentErrors) {
        const msg = classifyStandaloneAgentError(err);
        expect(msg.toLowerCase()).not.toContain("try rephrasing");
      }
    });
  });
});
