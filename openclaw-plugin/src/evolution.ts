/**
 * Enso Evolution Sprint — Project-scoped self-evolution system.
 *
 * CLOSED-LOOP evolution for ANY project: AI personas test the product →
 * team agents evaluate → engineering implements → personas re-test.
 *
 * Each project defines its own team agents, customer personas, and
 * codebase. The "enso" project is just one project among many.
 *
 * PHASES:
 *   0. Meta-Evaluation — Project Leader reviews previous sprint, adjusts team/goals
 *   1. Persona Testing — Customer personas test the product via Puppeteer
 *   2. Team Evaluation — Leadership agents evaluate positioning, commercialization
 *   3. Synthesis + Discussion — Architect synthesizes, team debates priorities
 *   4. Engineering — Architect designs, coder implements, reviewer validates
 *   5. Validation — Customer personas re-test changed areas
 *   6. Evolution Report — Dashboard + Project Leader meta-review
 */

import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logAction, logError } from "./action-log.js";
import type { ConnectedClient } from "./server.js";
import type { ResolvedEnsoAccount } from "./accounts.js";
import { handleOrchestration } from "./orchestrator.js";
import { archiveEvolutionSprint, cleanEvolutionTempFiles } from "./evolution-archive.js";
import { loadProject, ensureDefaultProject } from "./project-manager.js";
import type { Project, Persona, TeamAgent } from "./project-manager.js";

const __filename = fileURLToPath(import.meta.url);
const PLUGIN_DIR = dirname(__filename);

// ── Planning Prompt Builder ──

function buildEvolutionPlanningPrompt(
  project: Project,
  goal: string,
  orchestrationId: string,
  planFilePath: string,
): string {
  const { personas, teamAgents, validationPersonaIds } = project;

  // Build persona task blocks
  const personaBlocks = personas.map((p, i) => {
    const isNonBrowser = p.id === "ai-technology-strategist";
    const role = isNonBrowser ? "researcher" : "coder";
    const scenarioList = p.testScenarios.map((s, j) => `  ${j + 1}. ${s}`).join("\n");

    const testUrl = project.testUrl || "http://localhost:5173";
    const browserInstructions = isNonBrowser
      ? [
          `**Instructions for this task:** This persona does NOT use the browser. Instead:`,
          `1. Read the project's documentation/README to understand current architecture`,
          `2. Perform 5-8 web searches on latest trends relevant to this project`,
          `3. Identify specific gaps between the project's current state and the frontier`,
          `4. Write findings to \`.evolution-persona-${p.id}.md\``,
        ].join("\n")
      : [
          `**Instructions for this task:**`,
          `1. Write a Node.js script \`test-persona-${p.id}.mjs\` using Puppeteer (already installed in node_modules) that:`,
          `   - Launches a headless browser and navigates to ${testUrl}`,
          `   - Waits for the page to load`,
          `   - For each test scenario: types the message, clicks Send, waits for response (10-30s), takes a screenshot`,
          `   - Saves screenshots to ./evolution-screenshots/`,
          `   - Outputs a JSON summary of each scenario result`,
          `2. Execute the script: \`node test-persona-${p.id}.mjs\``,
          `3. Analyze the screenshots and results from ${p.name}'s perspective`,
          `4. Write a detailed report to \`.evolution-persona-${p.id}.md\` with:`,
          `   - Each scenario: what was tried, what happened, assessment`,
          `   - Ratings (1-10): ease_of_use, speed, quality, delight, discoverability`,
          `   - Top 3 friction points`,
          `   - Top 3 enhancement suggestions from this persona's perspective`,
          `   - Overall assessment quote in character`,
        ].join("\n");

    return [
      `### Customer Persona ${i + 1}: ${p.name} (${p.role})`,
      `- **Task ID:** persona-${p.id}`,
      `- **Agent role:** ${role}`,
      `- **Dependencies:** none`,
      `- **Background:** ${p.background}`,
      `- **Goals:** ${p.goals.join("; ")}`,
      `- **Frustrations:** ${p.frustrations.join("; ")}`,
      ``,
      `**Test scenarios:**`,
      scenarioList,
      ``,
      browserInstructions,
    ].join("\n");
  });

  // Build team agent task blocks
  const teamBlocks = teamAgents.map((agent, i) => {
    const isProjectLeader = agent.id === "project-leader";
    const instructions = isProjectLeader
      ? [
          `**Instructions:** You are the META-CONTROLLER of this project's evolution.`,
          `1. Read any previous sprint reports in the project directory`,
          `2. Review the current project.json to understand team composition and goals`,
          `3. Evaluate: Are we building the right things? Is the team effective?`,
          `4. You may MODIFY project.json to: adjust personas, change agent goals, update vision`,
          `5. Set priorities for what THIS sprint should focus on`,
          `6. Write \`.evolution-team-${agent.id}.md\` with your meta-evaluation and any changes made`,
        ].join("\n")
      : [
          `**Instructions:** Evaluate the project from your unique perspective as ${agent.role}.`,
          `1. Review the project's current state (README, docs, website if available)`,
          `2. Perform web research relevant to your role (competitive landscape, market trends, pricing models, etc.)`,
          `3. Evaluate against your goals: ${agent.goals.join("; ")}`,
          `4. Identify capability gaps — tools/integrations you need but don't have`,
          `5. Produce a deliverable relevant to your role (see responsibilities)`,
          `6. Write \`.evolution-team-${agent.id}.md\` with:`,
          `   - Your evaluation from ${agent.perspective}`,
          `   - Key findings and recommendations`,
          `   - Pain points / capability gaps surfaced`,
          `   - Deliverable produced (or outline if too large)`,
        ].join("\n");

    return [
      `### Team Agent ${i + 1}: ${agent.name} (${agent.role})`,
      `- **Task ID:** team-${agent.id}`,
      `- **Agent role:** ${agent.agentRole}`,
      `- **Dependencies:** ${isProjectLeader ? "none" : "team-project-leader"}`,
      `- **Responsibilities:** ${agent.responsibilities}`,
      `- **Goals:** ${agent.goals.join("; ")}`,
      `- **Perspective:** ${agent.perspective}`,
      ``,
      instructions,
    ].join("\n");
  });

  // Validation personas
  const validationPersonas = personas.filter(p => validationPersonaIds.includes(p.id));
  const allPersonaIds = personas.map(p => `persona-${p.id}`);
  const allTeamIds = teamAgents.map(a => `team-${a.id}`);
  const allTestingIds = [...allPersonaIds, ...allTeamIds];

  const lines = [
    `You are the Evolution Sprint Planner for the "${project.name}" project.`,
    ``,
    `**Project:** ${project.name}`,
    `**Description:** ${project.description}`,
    `**Vision:** ${project.vision}`,
    `**Tech Stack:** ${project.techStack || "Not specified"}`,
    `**Codebase:** ${project.codebasePath}`,
    project.testUrl ? `**Test URL:** ${project.testUrl}` : "",
    ``,
    goal ? `**Sprint focus area:** ${goal}` : `**Focus:** General product assessment — test all major capabilities.`,
    ``,
    `## Sprint Phases`,
    ``,
    `This sprint has 6 phases:`,
    `1. **Team Evaluation** — Team agents (Project Leader, Marketing, Sales) evaluate from their perspectives`,
    `2. **Persona Testing** — Customer personas test the product through a real browser`,
    `3. **Synthesis + Discussion** — Architect synthesizes all reports, reviewer debates priorities`,
    `4. **Engineering Implementation** — Top 3-5 enhancements ACTUALLY IMPLEMENTED in the codebase`,
    `5. **Validation Re-Testing** — Customer personas re-test changed areas`,
    `6. **Evolution Report** — Interactive dashboard with results`,
    ``,
    `## Phase 1: Team Agent Evaluation`,
    ``,
    ...teamBlocks,
    ``,
    `## Phase 2: Customer Persona Testing`,
    ``,
    ...personaBlocks,
    ``,
    `## Phase 3: Synthesis + Discussion`,
    ``,
    `### Synthesis`,
    `- **Task ID:** synthesis`,
    `- **Agent role:** architect`,
    `- **Dependencies:** ${allTestingIds.join(", ")}`,
    `- **Instructions:** Read ALL \`.evolution-persona-*.md\` and \`.evolution-team-*.md\` files. Identify common themes across BOTH customer personas AND team agents. Categorize: UX Issues, Missing Features, Performance Issues, Bugs, Strategic Gaps, Capability Gaps (tools team agents need). Rank by cross-report impact. Write \`.evolution-synthesis.md\` with TOP 5 ACTIONABLE ENHANCEMENTS.`,
    ``,
    `### Product Discussion`,
    `- **Task ID:** discussion`,
    `- **Agent role:** reviewer`,
    `- **Dependencies:** synthesis`,
    `- **Instructions:** Read \`.evolution-synthesis.md\` and all persona + team reports. Simulate a product team roundtable where EACH voice is represented (customers AND team agents). The Project Leader moderates. Debate priorities. End with FINAL DECISION: top 3-5 enhancements to implement THIS sprint. Be AGGRESSIVE — Claude Code implements 10x faster than human engineers. For each enhancement, write a SPEC: what to change, which files, expected behavior. Write \`.evolution-discussion.md\`.`,
    ``,
    `## Phase 4: Engineering Implementation`,
    ``,
    `### Design Solution`,
    `- **Task ID:** design-solution`,
    `- **Agent role:** architect`,
    `- **Dependencies:** discussion`,
    `- **Instructions:** Read \`.evolution-discussion.md\`. Read the project codebase to understand current implementation. Design CONCRETE technical solutions for each chosen enhancement. Write \`.evolution-design.md\`.`,
    ``,
    `### Implement Changes`,
    `- **Task ID:** implement`,
    `- **Agent role:** coder`,
    `- **Dependencies:** design-solution`,
    `- **Instructions:** Read \`.evolution-design.md\`. IMPLEMENT the changes in the actual project codebase at ${project.codebasePath}.`,
    `  CRITICAL RULES:`,
    `  - Read each file BEFORE editing`,
    `  - Make surgical, minimal changes`,
    `  - Follow existing code conventions`,
    `  - Do NOT touch package.json version fields`,
    `  - After all edits, run the project's build command to verify`,
    `  - Write \`.evolution-implementation.md\` listing every file changed`,
    `  SAFETY — ABSOLUTELY FORBIDDEN:`,
    `  - NEVER restart, stop, or kill any server/gateway process`,
    `  - NEVER run restart scripts`,
    `  - NEVER use Stop-Process, taskkill, kill, or pkill`,
    `  - NEVER modify package.json, lock files, or run npm install`,
    `  - NEVER push to git`,
    ``,
    `### Review & Validate`,
    `- **Task ID:** review`,
    `- **Agent role:** reviewer`,
    `- **Dependencies:** implement`,
    `- **Instructions:** Validate the implementation. Read changed files, run build, check for regressions. Write \`.evolution-review.md\` with pass/fail verdict.`,
    ``,
    `## Phase 5: Validation Re-Testing`,
    ``,
    ...validationPersonas.map(p => [
      `### Re-Test as ${p.name}`,
      `- **Task ID:** retest-${p.id}`,
      `- **Agent role:** coder`,
      `- **Dependencies:** review`,
      `- **Instructions:** Re-test as ${p.name} (${p.role}). Code changes were made but server NOT restarted. Focus on verifying CODE QUALITY of changes and testing existing behavior.`,
      `  1. Read \`.evolution-implementation.md\` and the changed source files`,
      `  2. Read original report \`.evolution-persona-${p.id}.md\` for baseline`,
      `  3. Write Puppeteer re-test script and execute it`,
      `  4. Write \`.evolution-retest-${p.id}.md\` with before/after comparison`,
    ].join("\n")),
    ``,
    `## Phase 6: Evolution Report`,
    ``,
    `### Build Evolution Dashboard`,
    `- **Task ID:** build-dashboard`,
    `- **Agent role:** builder`,
    `- **Dependencies:** ${validationPersonas.map(p => `retest-${p.id}`).join(", ")}`,
    `- **Instructions:** Read ALL evolution files. Build a BESPOKE interactive dashboard. Write EXACTLY \`.orchestration-ui.jsx\`. Under 500KB. NO import statements. Use var (not const/let). All hooks at top level. Use EnsoUI components + Recharts.`,
    `  Tabs: Overview | Team | Personas | Implementation | Validation | Backlog`,
    ``,
    `### Project Leader Meta-Review`,
    `- **Task ID:** meta-review`,
    `- **Agent role:** architect`,
    `- **Dependencies:** build-dashboard`,
    `- **Instructions:** Final meta-review by the Project Leader (${teamAgents.find(a => a.id === "project-leader")?.name || "Project Leader"}).`,
    `  1. Read ALL sprint outputs`,
    `  2. Evaluate: Was this sprint effective? What worked? What didn't?`,
    `  3. Update project.json with any adjustments (goals, priorities, persona tweaks)`,
    `  4. Write \`.evolution-meta-review.md\` with conclusions and next sprint priorities`,
    ``,
    `## Output Format`,
    ``,
    `Write a JSON file to: ${planFilePath}`,
    ``,
    `Include ALL tasks described above. Each task needs: taskId, title, description (FULL instructions — the executor only sees the description), agentRole, dependsOn.`,
    ``,
    `CRITICAL: Each task's "description" must contain the FULL instructions from above. The execution agent will ONLY see the task description, not this planning prompt.`,
    ``,
    `Write ONLY the JSON file. No other files or explanations.`,
  ].filter(Boolean);

  return lines.join("\n");
}

// ── Entry Point ──

export async function handleEvolutionSprint(params: {
  projectId?: string;
  goal?: string;
  client: ConnectedClient;
  account: ResolvedEnsoAccount;
}): Promise<void> {
  const { goal, client, account } = params;
  const projectId = params.projectId || "enso";

  // Load project
  const project = loadProject(projectId) || ensureDefaultProject();
  if (!project) {
    logError("evolution", `Project not found: ${projectId}`, null);
    return;
  }

  const sprintId = `sprint-${Date.now()}`;

  logAction({
    ts: Date.now(),
    type: "action",
    category: "evolution",
    message: `Evolution sprint start for project "${project.name}": ${goal || "Full product assessment"}`,
  });

  try {
    await handleOrchestration({
      userMessage: `Evolution Sprint for ${project.name}: ${goal || "Test from multiple perspectives, implement top enhancements, and validate improvements"}`,
      classification: {
        complexity: "orchestrated" as const,
        reasoning: `Evolution sprint for project "${project.name}" — closed-loop product testing with implementation and validation`,
      },
      client,
      account,
      planningPromptBuilder: (orchestrationId, planFilePath) =>
        buildEvolutionPlanningPrompt(project, goal || "", orchestrationId, planFilePath),
      onComplete: (_orchId, status) => {
        // Archive all evolution artifacts AFTER orchestration completes
        try {
          const meta = archiveEvolutionSprint(
            sprintId,
            goal || "Full product assessment",
            project.codebasePath,
            projectId,
          );
          if (meta) {
            logAction({
              ts: Date.now(),
              type: "action",
              category: "evolution",
              message: `Sprint archived for "${project.name}" (${status}): ${meta.files.length} files, ${meta.phases.personas.count} personas, dashboard: ${meta.phases.dashboard}`,
            });
            cleanEvolutionTempFiles(project.codebasePath);
          }
        } catch (err) {
          logError("evolution", "Failed to archive sprint", err);
        }
      },
    });
  } catch (err) {
    logError("evolution", "Evolution sprint failed", err);
  }
}
