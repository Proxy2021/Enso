/**
 * Task Router — Type definitions for task classification
 *
 * The dispatch logic has moved to an agent-first architecture:
 * all messages go through the agent pipeline, which has access to all
 * registered tools (apps, system tools, and enso_launch_task_session
 * for escalating to Claude Code when needed).
 *
 * These type definitions are retained for downstream modules that
 * construct their own classifications (orchestrator, archetype-builder,
 * /evolve, /discover, /orchestrate) — those paths create TaskClassification
 * objects directly without going through a classifier.
 */

// ── Types ──

export type TaskComplexity = "simple" | "action" | "research" | "one-off" | "orchestrated";

export type TaskArchetype =
  | "data_analysis"
  | "travel_planning"
  | "competitive_analysis"
  | "document_processing"
  | "project_planning"
  | "market_research"
  | "creative_project"
  | "general";

export interface TaskClassification {
  complexity: TaskComplexity;
  reasoning: string;
  answer?: string;
  goalSummary?: string;
  directAction?: string;
  researchTopic?: string;
  researchDepth?: "quick" | "standard" | "deep";
  archetype?: TaskArchetype;
  archetypeHints?: Record<string, string>;
  isRecurring?: boolean;
  implicit?: boolean;
}
