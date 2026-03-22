/**
 * card-evolution.ts — Focused card evolution via the orchestration engine.
 *
 * Follows the same "themed orchestration" pattern as evolution.ts and
 * discovery.ts: builds a card-type-specific planning prompt and delegates
 * to handleOrchestration for parallel DAG execution.
 */

import { handleOrchestration } from "./orchestrator.js";
import { extractCardContent } from "./card-summarizer.js";
import { logAction, logError } from "./action-log.js";
import type { ConnectedClient } from "./server.js";
import type { ResolvedEnsoAccount } from "./accounts.js";
import type { CardSummary } from "./card-summarizer.js";

// ── Types ──

export interface CardEvolutionParams {
  cardId: string;
  cardType: string;
  cardContent: {
    text?: string;
    data?: unknown;
    taskTerminals?: Record<string, { text: string; status: string }>;
    summary?: CardSummary;
  };
  evolutionGoal?: string;
  includeResearch?: boolean;
  client: ConnectedClient;
  account: ResolvedEnsoAccount;
}

// ── Per-card-type planning prompts ──

function buildCardEvolutionPlanningPrompt(
  params: CardEvolutionParams,
  orchestrationId: string,
  planFilePath: string,
): string {
  const { cardType, cardContent, evolutionGoal, includeResearch } = params;

  const extracted = extractCardContent(
    cardType,
    cardContent.text,
    cardContent.data,
    cardContent.taskTerminals,
  );

  const summaryBlock = cardContent.summary
    ? `\n## Pre-computed Summary\nOverview: ${cardContent.summary.overview}\nKey Outcomes:\n${cardContent.summary.keyOutcomes.map((o) => `- ${o}`).join("\n")}\nNarrative:\n${cardContent.summary.narrative}\n`
    : "";

  const contentBlock = `## Card Content (${extracted.cardType})\nTitle: ${extracted.title}\n\n${extracted.body.slice(0, 6000)}`;

  const typeGuidance = getTypeGuidance(cardType, includeResearch);
  const userGoalBlock = evolutionGoal
    ? `\n## User's Evolution Goal\n${evolutionGoal}\n`
    : "";

  return `You are planning a focused evolution sprint for a single Enso card. Your job is to create a short, targeted plan that transforms this card's content into a polished interactive app experience.

${contentBlock}
${summaryBlock}${userGoalBlock}
## Card Type: ${cardType}

${typeGuidance}

## Task Guidelines

Design 2-4 focused tasks. Each task should have a clear, achievable outcome.
${includeResearch ? "Include a researcher task to gather real-world data that enriches the final result." : ""}

Available agent roles: researcher, architect, builder, coder, reviewer
Available output types: app, research, code, document, decision, review

IMPORTANT: The final task MUST be a builder that creates a polished .orchestration-ui.jsx file at the project root. This file will be delivered as the evolved card UI.

Write the plan as a JSON file to: ${planFilePath}

The JSON must have this structure:
{
  "tasks": [
    {
      "taskId": "t1",
      "title": "Task title",
      "description": "What to do",
      "agentRole": "researcher|architect|builder|coder|reviewer",
      "dependsOn": [],
      "outputType": "research|document|app|code|review"
    }
  ]
}

Orchestration ID: ${orchestrationId}
Keep the plan lean. 2-4 tasks. Focus on quality over quantity.`;
}

function getTypeGuidance(cardType: string, includeResearch?: boolean): string {
  const researchNote = includeResearch
    ? "\nInclude a researcher task first to gather real-world data, statistics, and examples that make the final app authoritative and data-rich."
    : "";

  switch (cardType) {
    case "chat":
      return `This is a chat response from an AI assistant. Transform it into a comprehensive interactive app.
- Identify the core topic and domain
- Design a UI that makes the content explorable, not just readable
- Add structure: sections, tabs, comparison tables, visual hierarchies
- If the topic involves data, include visualizations
- Make it useful as a reference tool, not just a pretty display${researchNote}`;

    case "terminal":
      return `This is a Claude Code session transcript. Create a project status dashboard.
- Extract files changed, created, or deleted
- Identify key decisions made during the session
- Show test results and coverage if mentioned
- Create a timeline of actions taken
- Highlight any errors encountered and how they were resolved
- Include a "what changed" summary section${researchNote}`;

    case "orchestration":
      return `This is a multi-agent orchestration run. Build an executive dashboard.
- Show each task's status, outcome, and key deliverables
- Create a visual task dependency graph or timeline
- Highlight successes and failures with clear indicators
- Summarize agent contributions
- Include a "next steps" section based on what was accomplished vs what failed
- If tasks produced research or code, make it browseable${researchNote}`;

    case "dynamic-ui":
      return `This is an existing dynamic app. Evolve it to the next level.
- Analyze the current data and UI structure
- Identify missing features that would make it more useful
- Improve data visualization and interactivity
- Add filtering, sorting, export, or comparison capabilities
- Enhance the visual design with better layouts and typography
- Keep all existing functionality while adding depth${researchNote}`;

    default:
      return `Transform this card content into a polished interactive application.
- Identify the key information and structure it for exploration
- Design a clear, intuitive UI with appropriate visualizations
- Make it interactive: filterable, sortable, or expandable
- Focus on making the content actionable and referenceable${researchNote}`;
  }
}

// ── Main Entry Point ──

export async function handleCardEvolution(params: CardEvolutionParams): Promise<void> {
  const { cardId, cardType, evolutionGoal, client, account } = params;

  logAction({
    ts: Date.now(),
    type: "action",
    category: "card-evolution",
    message: `Card evolution start: ${cardType} card ${cardId.slice(0, 20)}${evolutionGoal ? ` — goal: ${evolutionGoal.slice(0, 80)}` : ""}`,
  });

  try {
    await handleOrchestration({
      userMessage: `Evolve this ${cardType} card into a polished interactive application${evolutionGoal ? `: ${evolutionGoal}` : ""}`,
      classification: {
        complexity: "orchestrated" as const,
        reasoning: `Focused card evolution for ${cardType} card — multi-agent sprint to transform card content into an interactive app`,
      },
      client,
      account,
      maxConcurrency: 3,
      planningModel: "opus",
      targetCardId: cardId,
      planningPromptBuilder: (orchestrationId, planFilePath) =>
        buildCardEvolutionPlanningPrompt(params, orchestrationId, planFilePath),
      onComplete: (orchId, status) => {
        logAction({
          ts: Date.now(),
          type: "action",
          category: "card-evolution",
          message: `Card evolution ${orchId} ${status} for ${cardType} card ${cardId.slice(0, 20)}`,
        });
      },
    });
  } catch (err) {
    logError("card-evolution", `Evolution failed for ${cardType} card`, err, { cardId });
    throw err;
  }
}
