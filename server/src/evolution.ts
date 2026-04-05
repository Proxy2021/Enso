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
import { execSync } from "child_process";
import { logAction, logError } from "./action-log.js";
import type { ConnectedClient } from "./server.js";
import type { ResolvedEnsoAccount } from "./accounts.js";
import { handleOrchestration } from "./orchestrator.js";
import { archiveEvolutionSprint, cleanEvolutionTempFiles, listEvolutionSprints, getEvolutionFile } from "./evolution-archive.js";
import { loadProject, ensureDefaultProject, getProjectBranch, loadProjectBrain, getProjectBrainPath } from "./project-manager.js";
import type { Project, Persona, TeamAgent } from "./project-manager.js";
import { APP_CATALOG } from "./app-catalog.js";
import { loadAllApps, SHIPPED_APPS_DIR } from "./app-persistence.js";
import { getWorkspace } from "./orchestration-workspace.js";

const __filename = fileURLToPath(import.meta.url);
const PLUGIN_DIR = dirname(__filename);

// ── App Ecosystem Discovery ──

function buildAppEcosystemContext(): string {
  const lines: string[] = [];

  try {
    const allApps = loadAllApps();
    if (allApps.length === 0 && APP_CATALOG.length === 0) {
      return "No apps currently installed.";
    }

    lines.push(`Currently installed apps (${allApps.length} loaded, ${APP_CATALOG.length} cataloged):\n`);

    for (const entry of APP_CATALOG) {
      const loaded = allApps.find(a => a.spec.toolFamily === entry.appId);
      const toolCount = loaded ? loaded.spec.tools.length : entry.actions.length;
      lines.push(`  - **${entry.appId}** (${toolCount} tools): ${entry.description}`);
      if (loaded) {
        const toolNames = loaded.spec.tools.map((t: any) => t.suffix).join(", ");
        lines.push(`    Tools: ${toolNames}`);
      } else {
        lines.push(`    Actions: ${entry.actions.join(", ")}`);
      }
    }

    // Include loaded apps that aren't in the static catalog
    for (const app of allApps) {
      if (!APP_CATALOG.some(c => c.appId === app.spec.toolFamily)) {
        const toolNames = app.spec.tools.map((t: any) => t.suffix).join(", ");
        lines.push(`  - **${app.spec.toolFamily}** (${app.spec.tools.length} tools): ${app.spec.description}`);
        lines.push(`    Tools: ${toolNames}`);
      }
    }
  } catch {
    lines.push("App discovery unavailable — proceed with awareness that apps may exist.");
  }

  return lines.join("\n");
}

// ── Sprint History Context ──

/**
 * Condenses the last N sprint meta-reviews into a compact context block.
 * Extracts: score, build verdict, key findings, next-sprint seeds.
 * This is injected into Phase 0 so the PL has a fast read on trajectory.
 */
function buildSprintHistoryContext(projectId: string, limit = 3): string {
  const sprints = listEvolutionSprints(projectId).slice(0, limit);
  if (sprints.length === 0) return "";

  const lines: string[] = [`## Recent Sprint History (last ${sprints.length})\n`];
  for (const sprint of sprints) {
    const date = new Date(sprint.completedAt).toISOString().split("T")[0];
    lines.push(`### ${date} — ${sprint.goal || "General assessment"} [${sprint.status}]`);

    const metaReview = getEvolutionFile(sprint.sprintId, "meta-review.md", projectId);
    if (metaReview) {
      // Extract structured summary for score + verdict
      const summaryMatch = metaReview.match(/<!--\s*STRUCTURED_SUMMARY\s+(\{[\s\S]*?\})\s*-->/);
      if (summaryMatch) {
        try {
          const s = JSON.parse(summaryMatch[1]);
          const parts: string[] = [];
          if (s.sprintScore !== undefined) parts.push(`Score: ${s.sprintScore}/10`);
          if (s.verdict) parts.push(`Build: ${s.verdict}`);
          if (parts.length) lines.push(parts.join(" | "));
          if (s.keyFindings && Array.isArray(s.keyFindings) && s.keyFindings.length) {
            lines.push(`Findings: ${(s.keyFindings as string[]).slice(0, 3).join("; ")}`);
          }
        } catch { /* malformed JSON — skip */ }
      }
      // Extract next sprint seeds section (first 500 chars)
      const seedMatch = metaReview.match(/(?:##?\s*)?Next Sprint Seed[^\n]*\n([\s\S]{0,600})/i);
      if (seedMatch) {
        const seeds = seedMatch[1].trim().slice(0, 450);
        if (seeds) lines.push(`Seeds:\n${seeds}`);
      }
    } else {
      lines.push(`(meta-review not available)`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ── Planning Prompt Builder ──

/** Inject Knowledge Cortex pages relevant to the project for domain-aware sprint planning. */
function getCortexEvolutionContext(project: { name: string; id: string }): string {
  try {
    const { readIndex } = require("./wiki-tools.js") as { readIndex: () => Array<{ path: string; title: string; summary: string; tags: string[] }> };
    const index = readIndex();
    if (index.length === 0) return "";
    const terms = (project.name + " " + project.id).toLowerCase().split(/[\s-_]+/).filter(t => t.length > 2);
    const relevant = index.filter(e => {
      const hay = (e.title + " " + e.summary + " " + e.tags.join(" ")).toLowerCase();
      return terms.some(t => hay.includes(t));
    }).slice(0, 5);
    if (relevant.length === 0) return "";
    return [
      `## Project Knowledge (from Knowledge Cortex)`,
      ``,
      `Documented knowledge about this project and its domain:`,
      ...relevant.map(e => `- **${e.title}**: ${e.summary}`),
      `Use these insights to inform sprint planning, persona scenarios, and implementation choices.`,
      ``,
    ].join("\n");
  } catch { return ""; }
}

function buildEvolutionPlanningPrompt(
  project: Project,
  goal: string,
  orchestrationId: string,
  planFilePath: string,
): string {
  const { personas, teamAgents, validationPersonaIds } = project;
  const testUrl = project.testUrl || "http://localhost:5173";

  // Resolve workspace for absolute artifact paths
  const workspace = getWorkspace(orchestrationId);

  // ── Load accumulated institutional memory ──
  const brain = loadProjectBrain(project.id);
  const brainPath = getProjectBrainPath(project.id);
  const sprintHistory = buildSprintHistoryContext(project.id, 3);

  // ── Persona catalog with evolving history ──
  const personaCatalog = personas.map((p) => {
    const scenarioList = p.testScenarios.map((s, j) => `  ${j + 1}. ${s}`).join("\n");

    const historyLines: string[] = [];
    if (p.history && p.history.length > 0) {
      const recent = p.history.slice(-3); // last 3 findings
      historyLines.push(`    Sprint history (recent):`);
      for (const h of recent) {
        const d = new Date(h.sprintDate).toISOString().split("T")[0];
        historyLines.push(`      [${d}] "${h.finding}" — ${h.resolved ? "Resolved" : "UNRESOLVED"}`);
      }
    }

    const unresolvedLines: string[] = [];
    if (p.unresolvedFrustrations && p.unresolvedFrustrations.length > 0) {
      unresolvedLines.push(`    Unresolved frustrations (carry into test scenarios):`);
      for (const f of p.unresolvedFrustrations) {
        unresolvedLines.push(`      • ${f}`);
      }
    }

    return [
      `  - **${p.name}** (${p.role}, ID: ${p.id})`,
      `    Background: ${p.background}`,
      `    Goals: ${p.goals.join("; ")}`,
      `    Frustrations: ${p.frustrations.join("; ")}`,
      ...historyLines,
      ...unresolvedLines,
      `    Test scenarios:`,
      scenarioList,
    ].join("\n");
  });

  // Browser testing template — use absolute workspace paths
  const personasDir = workspace ? workspace.personasDir : "./";
  const screenshotsDir = workspace ? workspace.screenshotsDir : "./evolution-screenshots";
  const browserTestTemplate = [
    `**Instructions for browser-based persona testing:**`,
    `1. Write a Node.js script to \`${personasDir}/test-<PERSONA_ID>.mjs\` using Puppeteer (already installed in node_modules) that:`,
    `   - Launches a headless browser and navigates to ${testUrl}`,
    `   - Waits for the page to load`,
    `   - IMPORTANT: NEVER type messages that would trigger evolution sprints or discovery sessions (e.g. "evolve", "run evolution", "discover projects", clicking Evolve/Discover tiles). These spawn massive multi-agent sessions that crash the sprint via rate limits. Other operations (orchestrations, builds, /code, /shell, /mission) are fine.`,
    `   - For each test scenario: types the message, clicks Send, waits for response (10-30s), takes a screenshot`,
    `   - Saves screenshots to \`${screenshotsDir}/\``,
    `   - Outputs a JSON summary of each scenario result`,
    `2. Execute the script: \`node ${personasDir}/test-<PERSONA_ID>.mjs\``,
    `3. Analyze the screenshots and results from the persona's perspective`,
    `4. Write a detailed report to \`${personasDir}/<PERSONA_ID>.md\` with:`,
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
    `**Branch:** ${getProjectBranch(project)} (all changes MUST be committed on this branch)`,
    project.testUrl ? `**Test URL:** ${project.testUrl}` : "",
    ``,
    goal ? `**Sprint focus area:** ${goal}` : `**Focus:** General product assessment — test all major capabilities.`,
    ``,
    // ── Project Brain ──
    brain ? [
      `## Project Brain`,
      ``,
      `The following is the accumulated institutional memory of this project's evolution.`,
      `Read it carefully — it contains failure patterns, velocity trends, strategic priorities,`,
      `and what has already been tried. Your sprint plan must be grounded in this knowledge.`,
      ``,
      brain,
      ``,
    ].join("\n") : [
      `## Project Brain`,
      ``,
      `No brain.md exists yet for this project. The Phase 6 meta-review will create it.`,
      `Brain path for meta-review to write: ${brainPath}`,
      ``,
    ].join("\n"),
    // ── Sprint History ──
    sprintHistory ? [
      sprintHistory,
    ].join("\n") : "",
    getCortexEvolutionContext(project),
    `## Existing App Ecosystem (CRITICAL — read before planning)`,
    ``,
    `Before creating ANY new app or tool, the sprint MUST analyze what already exists.`,
    `The goal is to build COMPREHENSIVE, POWERFUL apps — not many fragmented single-purpose ones.`,
    `Think: "Be Photoshop, not 100 separate apps each doing one Photoshop feature."`,
    ``,
    buildAppEcosystemContext(),
    ``,
    `**App Consolidation Rules:**`,
    `- If a feature belongs to an existing app's domain, EXTEND that app (add tools, improve template)`,
    `- If two or more existing apps overlap significantly, recommend MERGING them`,
    `- Only create a NEW app when no existing app covers the domain`,
    `- When extending an app, study its current template.jsx and executors/ to maintain consistency`,
    `- App family names must be broad categories: "photo_studio" not "portrait_retoucher"`,
    ``,
    `## Sprint Structure`,
    ``,
    `The DEFAULT sprint structure is a 7-phase pipeline designed for comprehensive product assessment.`,
    `The planner SHOULD use this structure for most sprints.`,
    ``,
    `The planner MAY propose an adapted structure when the Project Brain or sprint history clearly calls for it.`,
    `Common adaptations:`,
    `- **Debt-recovery sprint**: Heavier implementation, lighter persona testing (e.g., skip marketing/sales, reduce to 1 persona, add a second implement task)`,
    `- **Architecture sprint**: Architect and EM dominate Phase 3; implementation is design documents + targeted refactors`,
    `- **Deep persona sprint**: 3–4 personas, extended browser testing, lighter team evaluation`,
    `- **Emergency bugfix sprint**: Minimal phases — PL → Implement → Review (skip persona testing entirely when a build is broken)`,
    ``,
    `If adapting: state the adaptation type and rationale in the first task's description.`,
    ``,
    `**Default phases:**`,
    `1. **Phase 0: PL Meta-Evaluation** — Project Leader reads brain, sets priorities, selects personas`,
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
    `  1. Read the Project Brain at \`${brainPath}\` — it contains accumulated insights from all previous sprints. This is your primary context document.`,
    `  2. Review project.json to understand current team composition, agent pain points, and sprint notes`,
    `  3. Cross-reference the brain with the code: verify that known issues are still present, known wins are still holding`,
    `  4. Evaluate: Are we building the right things? Is the team effective? Is the brain's strategic read still accurate?`,
    `  5. You MAY MODIFY project.json to: adjust personas, update agent goals, revise vision, add sprint notes`,
    `  6. Set clear priorities for what THIS sprint should focus on — be specific, not generic`,
    `  7. DECIDE which 2-3 personas to test based on sprint focus AND their unresolved frustrations (visible in persona catalog below)`,
    `  8. Write \`${workspace ? workspace.teamReportPath("project-leader") : ".evolution-team-project-leader.md"}\` with: brain synthesis, selected personas with rationale, sprint priorities (ranked), and any brain sections that need updating`,
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
    `- **Instructions:** You are ${projectLeader?.name || "the Project Leader"} again. Read ALL persona test reports from \`${personasDir}/\` (files named \`<persona-id>.md\`).`,
    ``,
    `  **Your job is to make CRISP DECISIONS, not write verbose analysis.** You are a coordinator — synthesize findings into actionable direction for downstream agents.`,
    ``,
    `  Format your triage as a structured decision document:`,
    ``,
    `  ### 1. Persona Findings (MAX 5 bullet points)`,
    `  Distill ALL persona reports into the top 5 pain points ranked by severity. Each bullet: one sentence, impact rating (P0/P1/P2).`,
    ``,
    `  ### 2. Agent Selection (table format)`,
    `  | Agent | Include? | Rationale (one sentence) |`,
    `  |-------|----------|------------------------|`,
    `  | Architect | YES (always) | ... |`,
    `  | Engineering Manager | YES (always) | ... |`,
    `  | QA/Test Manager | YES (always) | ... |`,
    `  | Marketing Director | YES/NO | ... |`,
    `  | Sales Director | YES/NO | ... |`,
    `  | AI Strategist | YES/NO | ... |`,
    ``,
    `  Core agents (always): Architect (${coreEngAgents.find(a => a.id === "architect")?.name}), Engineering Manager (${coreEngAgents.find(a => a.id === "engineering-manager")?.name}), QA/Test Manager (${coreEngAgents.find(a => a.id === "test-manager")?.name})`,
    `  Optional (by PL decision): Marketing Director (${optionalAgents.find(a => a.id === "marketing-director")?.name}), Sales/Adoption Lead (${optionalAgents.find(a => a.id === "sales-director")?.name}), AI Strategist (${optionalAgents.find(a => a.id === "ai-technology-strategist")?.name})`,
    ``,
    `  ### 3. Sprint Focus (MAX 3 sentences)`,
    `  What should this sprint achieve? What is out of scope? What is the single most important improvement?`,
    ``,
    `  ### 4. Preliminary Enhancement Targets (numbered list, MAX 7)`,
    `  Each: one line with scope (frontend/backend/both) and estimated complexity (trivial/moderate/complex).`,
    ``,
    `  **Anti-patterns — DO NOT:**`,
    `  - Write multi-paragraph analysis of each persona's experience — distill to bullets`,
    `  - Include marketing/sales agents "just in case" — only when this sprint has clear commercial implications`,
    `  - Rehash findings from the brain without adding new judgment — the point is to triage NEW persona data`,
    ``,
    `  Write the triage to \`${workspace ? workspace.evolutionFilePath("pl-triage") : ".evolution-pl-triage.md"}\``,
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
    `  1. Read the PL triage report (\`${workspace ? workspace.evolutionFilePath("pl-triage") : ".evolution-pl-triage.md"}\`) to understand persona findings and sprint priorities`,
    `  2. Review the project's current state relevant to your role`,
    `  3. Perform web research if relevant to your role`,
    `  4. Evaluate against your goals`,
    `  5. Write \`${workspace ? workspace.outputsDir + "/team-<agent-id>.md" : ".evolution-team-<agent-id>.md"}\` with your evaluation, findings, and recommendations`,
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
    `- **Instructions:** Read ALL persona reports from \`${personasDir}/\` (files named \`<persona-id>.md\`), the PL triage at \`${workspace ? workspace.evolutionFilePath("pl-triage") : ".evolution-pl-triage.md"}\`, and all team reports from \`${workspace ? workspace.outputsDir + "/" : "./"}team-*.md\`.`,
    ``,
    `  PART 1 — SYNTHESIS: Identify common themes across BOTH customer personas AND team agents. Categorize: UX Issues, Missing Features, Performance Issues, Bugs, Strategic Gaps. Rank by cross-report impact.`,
    ``,
    `  PART 2 — APP ECOSYSTEM ANALYSIS: Review the existing app inventory (listed above in "Existing App Ecosystem"). For each identified enhancement:`,
    `  - Does it belong to an existing app's domain? → Plan to EXTEND that app`,
    `  - Do multiple apps overlap? → Recommend MERGING into a single comprehensive app`,
    `  - Is this truly a new domain? → Only then plan a new app`,
    `  Write an "App Consolidation Plan" section in the synthesis with specific recommendations.`,
    ``,
    `  PART 3 — DISCUSSION: Simulate a product team roundtable. Debate priorities. FINAL DECISION: top 3-5 enhancements to implement THIS sprint. Be AGGRESSIVE — Claude Code implements 10x faster than human engineers.`,
    `  ABSOLUTE RULE — BUGS BEFORE FEATURES: Every bug, regression, and broken feature identified during Phases 0-2 (persona testing) MUST be fixed in THIS sprint's implementation. Do NOT defer known bugs to future sprints. Fix bugs FIRST, then implement new features. If a persona found that something is broken, the sprint FAILED unless it also fixes that thing. The design doc MUST include a "Bug Fixes" section listing every identified bug with the specific fix. Implementation tasks MUST address ALL bugs from the design doc before adding new capabilities.`,
    ``,
    `  PART 4 — DESIGN: For each chosen enhancement, design the CONCRETE technical solution. Read the project codebase. For each: technical design, affected files, implementation approach, risks.`,
    `  When extending existing apps: read the current app.json, template.jsx, and executors/ to ensure compatibility.`,
    ``,
    `  Write \`${workspace ? workspace.evolutionFilePath("synthesis") : ".evolution-synthesis.md"}\`, \`${workspace ? workspace.evolutionFilePath("discussion") : ".evolution-discussion.md"}\`, AND \`${workspace ? workspace.evolutionFilePath("design") : ".evolution-design.md"}\`.`,
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
    `  Read \`${workspace ? workspace.evolutionFilePath("design") : ".evolution-design.md"}\`. IMPLEMENT the changes in the actual project codebase at ${project.codebasePath}.`,
    ``,
    `  SPRINT RESPONSIBILITY PRINCIPLE — BUGS BEFORE FEATURES: Implementation MUST address ALL bugs listed in the design doc BEFORE implementing new features. Read the design doc's "Bug Fixes" section first and fix every listed bug. Then proceed to new features. A sprint that adds features but leaves known bugs unfixed is a FAILED sprint. Every bug, regression, and broken feature identified during Phases 0-4 MUST be fixed. If the design doc lists it, you implement it — no exceptions, no deferrals.`,
    ``,
    `  APP CONSOLIDATION: When the design calls for extending an existing app, read the existing app's files first (app.json, template.jsx, executors/) and add new tools/views to it. Do NOT create a separate app for features that belong in an existing app's domain.`,
    ``,
    `  CRITICAL RULES:`,
    `  - Read each file BEFORE editing`,
    `  - Make surgical, minimal changes`,
    `  - Follow existing code conventions`,
    `  - When extending an app, preserve all existing tools and template views`,
    `  - Write \`${workspace ? workspace.evolutionFilePath("implementation") : ".evolution-implementation.md"}\` listing every file changed`,
    `  SAFETY — ABSOLUTELY FORBIDDEN (violating these will CRASH the sprint):`,
    `  - NEVER restart, stop, or kill any server/gateway process — it kills the running sprint`,
    `  - NEVER run restart.ps1, restart.sh, or any restart scripts`,
    `  - NEVER use Stop-Process, taskkill, kill, pkill, or terminate ANY process`,
    `  - NEVER modify package.json (especially version/versionCode), package-lock.json, or any lock files`,
    `  - NEVER run npm install, npm update, npx cap sync, or any package manager commands`,
    `  - NEVER push to git (git push) — changes are LOCAL only. You may git commit on the current branch.`,
    `  - NEVER switch git branches — the sprint branch (${getProjectBranch(project)}) is already checked out`,
    `  - NEVER bump versions — version management is handled by the release process, not evolution sprints`,
    `  - NEVER run the build command after implementing — the review task handles build verification`,
    `  - NEVER trigger evolution sprints (/evolve) or discovery sessions (/discover) during persona testing — these spawn massive multi-agent sessions (10-20+ Claude Code sessions each) that consume all available tokens and cause rate limit failures, crashing the sprint`,
    `  - Other operations are fine during persona testing: orchestrations, app builds, /code, /shell, /mission — only /evolve and /discover are forbidden`,
    ``,
    `### Review & Validate`,
    `- **Task ID:** review`,
    `- **Agent role:** reviewer`,
    `- **Dependencies:** implement (or implement-a AND implement-b if split)`,
    `- **Instructions:** Validate the implementation:`,
    `  1. Read \`${workspace ? workspace.evolutionFilePath("implementation") : ".evolution-implementation.md"}\` and all changed source files`,
    `  2. Run \`npx tsc --noEmit\` — this is MANDATORY, record exact output`,
    `  3. Check for regressions, code quality issues, missing edge cases`,
    `  4. Write \`${workspace ? workspace.evolutionFilePath("review") : ".evolution-review.md"}\` with:`,
    `     - **VERDICT: PASS** or **VERDICT: FAIL** as the FIRST LINE (mandatory)`,
    `     - Build output (exact tsc output)`,
    `     - Issues table: severity | file | description`,
    `  5. If the build fails, VERDICT MUST be FAIL. No exceptions.`,
    `  6. BUGS-BEFORE-FEATURES CHECK: Read the design doc's "Bug Fixes" section. Cross-reference with implementation. If ANY listed bug was NOT fixed in the implementation, VERDICT MUST be FAIL with reason "Identified bugs not fixed: [list]". A sprint that adds features but skips bug fixes is a failed sprint.`,
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
    `  1. Read \`${workspace ? workspace.evolutionFilePath("implementation") : ".evolution-implementation.md"}\` and changed source files`,
    `  2. Read original persona report from \`${personasDir}/<persona-id>.md\` for baseline`,
    `  3. Write Puppeteer re-test script to \`${personasDir}/retest-<persona-id>.mjs\` and execute it`,
    `  4. Write \`${personasDir}/retest-<persona-id>.md\` with before/after comparison`,
    ``,
    `### Build Evolution Dashboard`,
    `- **Task ID:** build-dashboard`,
    `- **Agent role:** builder`,
    `- **Dependencies:** review`,
    `- **Instructions:** Read ALL evolution files from \`${workspace ? workspace.outputsDir : "./"}\` and persona reports from \`${personasDir}/\`. Build a BESPOKE interactive dashboard. Write EXACTLY \`${workspace ? workspace.dashboardPath : ".orchestration-ui.jsx"}\`. Under 500KB. NO import statements. Use var (not const/let). All hooks at top level. Use EnsoUI components + Recharts.`,
    `  Tabs: Overview | Personas | Team | Implementation | Validation | Backlog`,
    ``,
    `### Project Leader Meta-Review, Brain Update & Resolution Verification`,
    `- **Task ID:** meta-review`,
    `- **Agent role:** architect`,
    `- **Dependencies:** review`,
    `- **Instructions:** Final meta-review by ${projectLeader?.name || "the Project Leader"}.`,
    `  1. Read ALL sprint outputs (persona reports, team evaluations, synthesis, implementation, review)`,
    `  2. RESOLUTION AUDIT: For every bug, issue, and enhancement identified in Phases 0-4:`,
    `     - Was it addressed in implementation? Mark as RESOLVED / PARTIALLY_RESOLVED / UNRESOLVED`,
    `     - If UNRESOLVED: why? Was it deprioritized with justification, or simply missed?`,
    `     - Unresolved items without justification indicate a sprint process failure — flag them`,
    `  3. APP ECOSYSTEM HEALTH CHECK:`,
    `     - Were app consolidation recommendations from Phase 4 followed?`,
    `     - Are there still fragmented single-purpose apps that should be merged?`,
    `     - Does each app serve a broad domain (comprehensive tool) vs. narrow use case (feature app)?`,
    `  4. Evaluate: Was this sprint effective? What worked? What didn't?`,
    `  5. NEXT SPRINT SEED: Based on unresolved items and new insights, list 3-5 specific focus areas.`,
    `     These are not deferred tasks — they are discovery seeds for the next sprint's Phase 0.`,
    `  6. UPDATE THE PROJECT BRAIN at \`${brainPath}\`:`,
    `     - Add new entries to **Failure Memory** if any recurring pattern appeared or worsened`,
    `     - Update **Improvement Velocity**: adjust trending-up/down lists based on this sprint's evidence`,
    `     - Revise **Strategic Read**: update immediate priorities, confirm or revise medium-term bets`,
    `     - Add to **What's Been Tried**: any new deferred items or approaches that didn't work`,
    `     - Update **Persona Evolution Notes**: add key observations about each tested persona`,
    `     - Update the "Last updated" line at the bottom`,
    `     If brain.md does not exist yet, CREATE it at \`${brainPath}\` using the standard sections.`,
    `  7. UPDATE PERSONA HISTORIES in project.json:`,
    `     For each persona that was tested or re-tested this sprint:`,
    `     - Append a new entry to their \`history\` array: { sprintId, sprintDate: <now ms>, finding: "<key finding>", resolved: false }`,
    `     - Update \`unresolvedFrustrations\`: add newly discovered frustrations, remove any that were resolved`,
    `     - Update \`testScenarios\` if any scenarios should be sharpened based on what the persona found`,
    `  8. Update project.json with: adjusted goals, sprint priorities, role adjustments, sprint score`,
    `  9. Write \`${workspace ? workspace.evolutionFilePath("meta-review") : ".evolution-meta-review.md"}\` with:`,
    `     - Sprint effectiveness score and justification`,
    `     - Resolution audit table (issue | status | evidence | notes)`,
    `     - App ecosystem health assessment`,
    `     - What worked well / what didn't`,
    `     - Next sprint seed topics (NOT deferred tasks — discovery prompts)`,
    `     - Brief summary of brain updates made`,
    ``,
    `## Agent Output Standards`,
    ``,
    `ALL tasks MUST include:`,
    `1. Lead with verdict/recommendation, not evidence`,
    `2. Structured summary block: <!-- STRUCTURED_SUMMARY {JSON} -->`,
    `3. Calibrated ratings (1-3: broken, 4-5: poor, 6-7: adequate, 8-9: strong, 10: exceptional)`,
    ``,
    `## DAG Shape`,
    ``,
    `Default shape for a standard sprint:`,
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
    `Rules that ALWAYS apply regardless of sprint shape:`,
    `1. Personas test BEFORE team agents — personas depend on PL only; team agents depend on pl-triage`,
    `2. synthesis-and-design is ONE task (never split into separate synthesis + discussion + design)`,
    `3. build-dashboard, meta-review, and retests are ALL parallel (depend on review, NOT on each other)`,
    `4. meta-review is ALWAYS the last task — it updates the brain and persona histories`,
    `5. Only include Marketing/Sales/AI-Strategist when the sprint focus clearly benefits from them`,
    ``,
    `When adapting the shape, keep the rules above intact and explain deviations in the first task description.`,
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
  const branch = getProjectBranch(project);

  // Ensure the target branch exists and is checked out in the project's codebase
  if (project.codebasePath) {
    try {
      const cwd = project.codebasePath;
      const existing = execSync(`git branch --list ${branch}`, { cwd, encoding: "utf-8" }).trim();
      if (!existing) {
        execSync(`git checkout -b ${branch}`, { cwd, encoding: "utf-8" });
        logAction({ ts: Date.now(), type: "action", category: "evolution", message: `Created and checked out branch "${branch}" for project "${project.name}"` });
      } else {
        execSync(`git checkout ${branch}`, { cwd, encoding: "utf-8" });
        logAction({ ts: Date.now(), type: "action", category: "evolution", message: `Checked out branch "${branch}" for project "${project.name}"` });
      }
    } catch (err) {
      logError("evolution", `Failed to setup branch "${branch}" for project "${project.name}"`, err);
      // Continue anyway — agents can still work on whatever branch is current
    }
  }

  logAction({
    ts: Date.now(),
    type: "action",
    category: "evolution",
    message: `Evolution sprint start for project "${project.name}" on branch "${branch}": ${goal || "Full product assessment"}`,
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
      onComplete: (orchId, status) => {
        try {
          const ws = getWorkspace(orchId);
          const meta = archiveEvolutionSprint(
            sprintId,
            goal || "Full product assessment",
            project.codebasePath,
            projectId,
            ws?.rootDir,
          );
          if (meta) {
            logAction({
              ts: Date.now(),
              type: "action",
              category: "evolution",
              message: `Sprint archived for "${project.name}" (${status}): ${meta.files.length} files, ${meta.phases.personas.count} personas, dashboard: ${meta.phases.dashboard}`,
            });
            cleanEvolutionTempFiles(project.codebasePath, ws?.rootDir);
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
