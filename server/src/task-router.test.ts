import { describe, it, expect } from "vitest";
import type { TaskClassification, TaskComplexity, TaskArchetype } from "./task-router.js";

describe("TaskClassification types", () => {
  it("accepts valid complexity values used by downstream modules", () => {
    const complexities: TaskComplexity[] = ["simple", "action", "research", "one-off", "orchestrated"];
    expect(complexities).toHaveLength(5);
  });

  it("accepts valid archetype values", () => {
    const archetypes: TaskArchetype[] = [
      "data_analysis", "travel_planning", "competitive_analysis",
      "document_processing", "project_planning", "market_research",
      "creative_project", "general",
    ];
    expect(archetypes).toHaveLength(8);
  });

  it("constructs a classification for orchestrator use", () => {
    const classification: TaskClassification = {
      complexity: "orchestrated",
      reasoning: "User-initiated via /orchestrate",
      goalSummary: "Build a REST API with auth",
    };
    expect(classification.complexity).toBe("orchestrated");
    expect(classification.goalSummary).toBeDefined();
  });

  it("constructs a classification for evolution use", () => {
    const classification: TaskClassification = {
      complexity: "orchestrated",
      reasoning: "Evolution sprint",
      archetype: "project_planning",
      archetypeHints: { domain: "fintech" },
    };
    expect(classification.archetype).toBe("project_planning");
    expect(classification.archetypeHints?.domain).toBe("fintech");
  });
});
