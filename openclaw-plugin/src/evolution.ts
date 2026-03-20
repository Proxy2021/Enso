/**
 * Enso Evolution Sprint — Project-scoped self-evolution system.
 *
 * STREAMLINED closed-loop evolution for ANY project:
 *   0. Project Leader meta-evaluation (sets focus, selects personas)
 *   1. Persona Testing — customers test the product via Puppeteer (BEFORE team agents)
 *   2. PL Review — Project Leader reviews persona findings, decides which team agents to involve
 *   3. Selective Team Evaluation — only the agents PL chose (Architect/Eng/QA always, Marketing/Sales on-demand)
 *   4. Synthesis + Discussion-Design (merged) — cross-report analysis → prioritized backlog → technical design
 *   5. Implementation (parallel tracks if independent) → Review + Fix-Verify Loop
 *   6. Validation re-testing + Dashboard + Meta-Review (parallel)
 *
 * KEY DESIGN: Personas test FIRST to ground the sprint in real user feedback.
 * Team agents are brought in AFTER to analyze and act on that feedback.
 * Marketing/Sales are optional — PL decides based on sprint focus.
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
  const testUrl = project.testUrl || "http://localhost:5173";

  // Persona catalog
  const personaCatalog = personas.map((p) => {
    const scenarioList = p.testScenarios.map((s, j) => `  ${j + 1}. ${s}`).join("\n");
    return [
      `  - **${p.name}** (${p.role}, ID: ${p.id})`,
      `    Background: ${p.background}`,
      `    Goals: ${p.goals.join("; ")}`,
      `    Frustrations: ${p.frustrations.join("; ")}`,
      `    Test scenarios:`,
      scenarioList,
    ].join("\n");
  });

  // Browser testing template
  const browserTestTemplate = [
    `**Instructions for browser-based persona testing:**`,
    `1. Write a Node.js script \`test-persona-<PERSONA_ID>.mjs\` using Puppeteer (already installed in node_modules) that:`,
    `   - Launches a headless browser and navigates to ${testUrl}`,
    `   - Waits for the page to load`,
    `   - For each test scenario: types the message, clicks Send, waits for response (10-30s), takes a screenshot`,
    `   - Saves screenshots to ./evolution-screenshots/`,
    `   - Outputs a JSON summary of each scenario result`,
    `2. Execute the script: \`node test-persona-<PERSONA_ID>.mjs\``,
    `3. Analyze the screenshots and results from the persona's perspective`,
    `4. Write a detailed report to \`.evolution-persona-<PERSONA_ID>.md\` with:`,
    `   - Each scenario: what was tried, what happened, assessment`,
    `   - Ratings (1-10): ease_of_use, speed, quality, delight, discoverability`,
    `   - Top 3 friction points`,
    `   - Top 3 enhancement suggestions from this persona's perspective`,
    `   - Overall assessment quote in character`,
  ].join("\n");

  // Identify key agent categories
  const projectLeader = teamAgents.find(a => a.id === "project-leader");
  const coreEngAgents = teamAgents.filter(a =>
    ["architect", "engineering-manager", "test-manager"].includes(a.id)
  );
  const optionalAgents = teamAgents.filter(a =>
    ["marketing-director", "sales-director", "ai-technology-strategist"].includes(a.id)
  );

  // Build agent descriptions for PL's reference
  const agentDescriptions = teamAgents
    .filter(a => a.id !== "project-leader")
    .map(a => `  - **${a.name}** (${a.role}, ID: team-${a.id}): ${a.perspective}`)
    .join("\n");

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
    `## Streamlined Sprint Structure`,
    ``,
    `This sprint follows an EFFICIENT pipeline where real user feedback comes FIRST, then the team analyzes and acts on it:`,
    ``,
    `1. **Phase 0: PL Meta-Evaluation** — Project Leader sets priorities, selects personas`,
    `2. **Phase 1: Persona Testing** — Customer personas test the product (BEFORE any team agents)`,
    `3. **Phase 2: PL Triage** — Project Leader reviews persona findings, decides which team agents to involve`,
    `4. **Phase 3: Selective Team Evaluation** — Only agents the PL selected (core engineering always, marketing/sales on-demand)`,
    `5. **Phase 4: Synthesis + Discussion-Design** — Cross-report analysis → prioritized enhancements → technical specs (MERGED into single task)`,
    `6. **Phase 5: Implementation** — Parallel tracks if independent → Review + Fix-Verify Loop`,
    `7. **Phase 6: Validation + Report** — Re-testing + Dashboard + Meta-Review (all parallel)`,
    ``,
    `## Phase 0: Project Leader Meta-Evaluation`,
    ``,
    `- **Task ID:** team-project-leader`,
    `- **Agent role:** architect`,
    `- **Dependencies:** none`,
    `- **Instructions:** You are ${projectLeader?.name || "the Project Leader"}, the META-CONTROLLER of this project's evolution.`,
    `  1. Read any previous sprint reports in the project directory`,
    `  2. Review the current project.json to understand team composition and goals`,
    `  3. Evaluate: Are we building the right things? Is the team effective?`,
    `  4. You may MODIFY project.json to: adjust personas, change agent goals, update vision`,
    `  5. Set priorities for what THIS sprint should focus on`,
    `  6. DECIDE which 2-3 personas to test (from the catalog below) based on sprint focus`,
    `  7. Write \`.evolution-team-project-leader.md\` with your meta-evaluation, selected personas, and sprint priorities`,
    ``,
    `## Phase 1: Persona Testing (runs FIRST — before team agents)`,
    ``,
    `The planner selects 2-3 personas most relevant to the sprint focus. These run in parallel, all depending only on \`team-project-leader\`.`,
    ``,
    `### Available Persona Catalog`,
    ``,
    ...personaCatalog,
    ``,
    `### Browser Testing Template (for each selected persona)`,
    ``,
    browserTestTemplate,
    ``,
    `## Phase 2: PL Triage — Project Leader Reviews Persona Findings`,
    ``,
    `- **Task ID:** pl-triage`,
    `- **Agent role:** architect`,
    `- **Dependencies:** ALL persona-* tasks from Phase 1`,
    `- **Instructions:** You are ${projectLeader?.name || "the Project Leader"} again. Read ALL persona test reports (\`.evolution-persona-*.md\`).`,
    `  1. Summarize the key findings across all personas`,
    `  2. Identify the top pain points and opportunities`,
    `  3. DECIDE which team agents to involve for THIS sprint:`,
    `     - **Always include:** Architect (${coreEngAgents.find(a => a.id === "architect")?.name}), Engineering Manager (${coreEngAgents.find(a => a.id === "engineering-manager")?.name}), QA/Test Manager (${coreEngAgents.find(a => a.id === "test-manager")?.name})`,
    `     - **Include if relevant:** Marketing Director (${optionalAgents.find(a => a.id === "marketing-director")?.name}), Sales/Adoption Lead (${optionalAgents.find(a => a.id === "sales-director")?.name}), AI Strategist (${optionalAgents.find(a => a.id === "ai-technology-strategist")?.name})`,
    `  4. For each agent you DON'T include, explain briefly why (e.g., "Marketing not needed — sprint is purely technical")`,
    `  5. Write \`.evolution-pl-triage.md\` with: persona summary, selected agents with rationale, preliminary enhancement ideas`,
    ``,
    `  Available team agents:`,
    agentDescriptions,
    ``,
    `## Phase 3: Selective Team Evaluation (PL-selected agents only)`,
    ``,
    `The planner creates tasks ONLY for the agents the PL selected in the triage. Core engineering agents (Architect, Eng Manager, Test Manager) are ALWAYS included. Marketing, Sales, and AI Strategist are included ONLY when the PL determines they add value for this sprint.`,
    ``,
    `Each selected team agent task:`,
    `- **Task ID:** team-<agent-id>`,
    `- **Agent role:** <agent's agentRole>`,
    `- **Dependencies:** pl-triage`,
    `- **Instructions:** Evaluate the project from your unique perspective as <role>.`,
    `  1. Read the PL triage report (\`.evolution-pl-triage.md\`) to understand persona findings and sprint priorities`,
    `  2. Review the project's current state relevant to your role`,
    `  3. Perform web research if relevant to your role`,
    `  4. Evaluate against your goals`,
    `  5. Write \`.evolution-team-<agent-id>.md\` with your evaluation, findings, and recommendations`,
    ``,
    `### Core Engineering Agents (always included):`,
    ...coreEngAgents.map(a => [
      `- **${a.name}** (${a.role}, ID: team-${a.id}, agentRole: ${a.agentRole})`,
      `  Responsibilities: ${a.responsibilities}`,
      `  Goals: ${a.goals.join("; ")}`,
      `  Perspective: ${a.perspective}`,
    ].join("\n")),
    ``,
    `### Optional Agents (PL decides):`,
    ...optionalAgents.map(a => [
      `- **${a.name}** (${a.role}, ID: team-${a.id}, agentRole: ${a.agentRole})`,
      `  Responsibilities: ${a.responsibilities}`,
      `  Goals: ${a.goals.join("; ")}`,
      `  Perspective: ${a.perspective}`,
    ].join("\n")),
    ``,
    `## Phase 4: Synthesis + Discussion-Design (MERGED single task)`,
    ``,
    `- **Task ID:** synthesis-and-design`,
    `- **Agent role:** architect`,
    `- **Dependencies:** ALL team-* tasks from Phase 3 AND pl-triage`,
    `- **Instructions:** Read ALL \`.evolution-persona-*.md\`, \`.evolution-pl-triage.md\`, and \`.evolution-team-*.md\` files.`,
    ``,
    `  PART 1 — SYNTHESIS: Identify common themes across BOTH customer personas AND team agents. Categorize: UX Issues, Missing Features, Performance Issues, Bugs, Strategic Gaps. Rank by cross-report impact.`,
    ``,
    `  PART 2 — DISCUSSION: Simulate a product team roundtable. Debate priorities. FINAL DECISION: top 3-5 enhancements to implement THIS sprint. Be AGGRESSIVE — Claude Code implements 10x faster than human engineers.`,
    ``,
    `  PART 3 — DESIGN: For each chosen enhancement, design the CONCRETE technical solution. Read the project codebase. For each: technical design, affected files, implementation approach, risks.`,
    ``,
    `  Write \`.evolution-synthesis.md\`, \`.evolution-discussion.md\`, AND \`.evolution-design.md\`.`,
    ``,
    `## Phase 5: Engineering Implementation`,
    ``,
    `### Implement Changes`,
    `The planner SHOULD split implementation into 2 parallel tasks when the chosen enhancements touch independent files:`,
    `- **Task ID:** implement-a (or implement if not split)`,
    `- **Agent role:** coder`,
    `- **Dependencies:** synthesis-and-design`,
    ``,
    `- **Task ID:** implement-b (optional, only if splittable)`,
    `- **Agent role:** coder`,
    `- **Dependencies:** synthesis-and-design`,
    ``,
    `Each implement task MUST follow these rules:`,
    `  Read \`.evolution-design.md\`. IMPLEMENT the changes in the actual project codebase at ${project.codebasePath}.`,
    `  CRITICAL RULES:`,
    `  - Read each file BEFORE editing`,
    `  - Make surgical, minimal changes`,
    `  - Follow existing code conventions`,
    `  - Write \`.evolution-implementation.md\` listing every file changed`,
    `  SAFETY — ABSOLUTELY FORBIDDEN (violating these will CRASH the sprint):`,
    `  - NEVER restart, stop, or kill any server/gateway process — it kills the running sprint`,
    `  - NEVER run restart.ps1, restart.sh, or any restart scripts`,
    `  - NEVER use Stop-Process, taskkill, kill, pkill, or terminate ANY process`,
    `  - NEVER modify package.json (especially version/versionCode), package-lock.json, or any lock files`,
    `  - NEVER run npm install, npm update, npx cap sync, or any package manager commands`,
    `  - NEVER push to git (git push, git commit) — changes are LOCAL only`,
    `  - NEVER bump versions — version management is handled by the release process, not evolution sprints`,
    `  - NEVER run the build command after implementing — the review task handles build verification`,
    ``,
    `### Review & Validate`,
    `- **Task ID:** review`,
    `- **Agent role:** reviewer`,
    `- **Dependencies:** implement (or implement-a AND implement-b if split)`,
    `- **Instructions:** Validate the implementation:`,
    `  1. Read \`.evolution-implementation.md\` and all changed source files`,
    `  2. Run \`npx tsc --noEmit\` — this is MANDATORY, record exact output`,
    `  3. Check for regressions, code quality issues, missing edge cases`,
    `  4. Write \`.evolution-review.md\` with:`,
    `     - **VERDICT: PASS** or **VERDICT: FAIL** as the FIRST LINE (mandatory)`,
    `     - Build output (exact tsc output)`,
    `     - Issues table: severity | file | description`,
    `  5. If the build fails, VERDICT MUST be FAIL. No exceptions.`,
    `  6. Append structured summary: <!-- STRUCTURED_SUMMARY {"verdict":"PASS|FAIL", "buildPassed":true|false, ...} -->`,
    ``,
    `## Phase 6: Validation + Report (ALL PARALLEL)`,
    ``,
    `All three tasks below depend on \`review\` and any \`retest-*\` tasks, but NOT on each other — they run in parallel.`,
    ``,
    `### Re-Testing (1-2 personas)`,
    `Select 1-2 personas from Phase 1 to re-test. Each:`,
    `- **Task ID:** retest-<persona-id>`,
    `- **Agent role:** coder`,
    `- **Dependencies:** review`,
    `- **Instructions:** Re-test as the persona. Focus on CODE QUALITY of changes and existing behavior.`,
    `  1. Read \`.evolution-implementation.md\` and changed source files`,
    `  2. Read original report \`.evolution-persona-<persona-id>.md\` for baseline`,
    `  3. Write Puppeteer re-test script and execute it`,
    `  4. Write \`.evolution-retest-<persona-id>.md\` with before/after comparison`,
    ``,
    `### Build Evolution Dashboard`,
    `- **Task ID:** build-dashboard`,
    `- **Agent role:** builder`,
    `- **Dependencies:** review`,
    `- **Instructions:** Read ALL evolution files. Build a BESPOKE interactive dashboard. Write EXACTLY \`.orchestration-ui.jsx\`. Under 500KB. NO import statements. Use var (not const/let). All hooks at top level. Use EnsoUI components + Recharts.`,
    `  Tabs: Overview | Personas | Team | Implementation | Validation | Backlog`,
    ``,
    `### Project Leader Meta-Review & Follow-Up Assignments`,
    `- **Task ID:** meta-review`,
    `- **Agent role:** architect`,
    `- **Dependencies:** review`,
    `- **Instructions:** Final meta-review by ${projectLeader?.name || "the Project Leader"}.`,
    `  1. Read ALL sprint outputs (persona reports, team evaluations, synthesis, implementation, review)`,
    `  2. Evaluate: Was this sprint effective? What worked? What didn't?`,
    `  3. FOLLOW-UP ASSIGNMENTS: Determine if any team member has deliverables needed for the NEXT sprint.`,
    `     For each assignment: who (agent name + ID), what (specific deliverable), why (how it advances the product).`,
    `     Examples: "Marketing should prepare a feature announcement for the new UX improvements"`,
    `              "QA should write integration tests for the orchestration pipeline"`,
    `              "AI Strategist should research MCP integration patterns for next sprint"`,
    `  4. Update project.json with: adjusted goals, sprint priorities, role adjustments, follow-up assignments`,
    `  5. Write \`.evolution-meta-review.md\` with:`,
    `     - Sprint effectiveness score and justification`,
    `     - What worked well / what didn't`,
    `     - Follow-up assignments table (agent | deliverable | deadline | rationale)`,
    `     - Next sprint focus recommendations`,
    ``,
    `## Agent Output Standards`,
    ``,
    `ALL tasks MUST include:`,
    `1. Lead with verdict/recommendation, not evidence`,
    `2. Structured summary block: <!-- STRUCTURED_SUMMARY {JSON} -->`,
    `3. Calibrated ratings (1-3: broken, 4-5: poor, 6-7: adequate, 8-9: strong, 10: exceptional)`,
    ``,
    `## DAG Shape Guidance`,
    ``,
    `The sprint should form this SPECIFIC shape:`,
    ``,
    `  team-project-leader (Phase 0)`,
    `        |`,
    `  {persona-* tests} (Phase 1, parallel, 2-3 tasks)`,
    `        |`,
    `    pl-triage (Phase 2, PL reviews persona findings)`,
    `        |`,
    `  {team-architect, team-engineering-manager, team-test-manager, [optional agents]} (Phase 3, parallel)`,
    `        |`,
    `  synthesis-and-design (Phase 4, SINGLE merged task)`,
    `        |`,
    `  {implement-a, implement-b} (Phase 5, parallel if splittable)`,
    `        |`,
    `      review`,
    `        |`,
    `  {retest-*, build-dashboard, meta-review} (Phase 6, ALL parallel)`,
    ``,
    `CRITICAL RULES for the plan:`,
    `1. Personas test BEFORE team agents (personas depend on PL only, team agents depend on pl-triage)`,
    `2. Only include Marketing/Sales/AI-Strategist if the sprint focus clearly needs them`,
    `3. synthesis-and-design is ONE task (not separate synthesis + discussion + design)`,
    `4. Dashboard, meta-review, and retests are ALL parallel (depend on review, NOT on each other)`,
    `5. The planner MUST follow this exact dependency structure — do not add extra serial steps`,
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
        reasoning: `Evolution sprint for project "${project.name}" — streamlined closed-loop product testing with implementation and validation`,
      },
      client,
      account,
      maxConcurrency: 6,
      planningModel: "opus",
      planningPromptBuilder: (orchestrationId, planFilePath) =>
        buildEvolutionPlanningPrompt(project, goal || "", orchestrationId, planFilePath),
      onComplete: (_orchId, status) => {
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
