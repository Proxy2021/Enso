/**
 * Enso Evolution Sprint — Self-evolving product development system.
 *
 * CLOSED-LOOP evolution: AI personas test Enso → team discusses → engineering
 * implements the top enhancements → user personas re-test → evolution report.
 *
 * This is a specialized orchestration — it reuses 100% of the orchestrator
 * infrastructure (same card type, same execution engine, same UI). The only
 * new code is persona definitions and an evolution-specific planning prompt.
 *
 * PHASES:
 *   1. Persona Testing — 6 personas use Enso via Puppeteer + architecture review
 *   2. Synthesis + Discussion — architect synthesizes, team debates priorities
 *   3. Engineering — architect designs, coder implements, reviewer validates
 *   4. Validation — 2 user personas re-test the changed areas
 *   5. Evolution Report — bespoke dashboard with before/after + next iteration backlog
 */

import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logAction, logError } from "./action-log.js";
import type { ConnectedClient } from "./server.js";
import type { ResolvedEnsoAccount } from "./accounts.js";
import { handleOrchestration } from "./orchestrator.js";
import { archiveEvolutionSprint, cleanEvolutionTempFiles } from "./evolution-archive.js";

const __filename = fileURLToPath(import.meta.url);
const PLUGIN_DIR = dirname(__filename);
const PROJECT_ROOT = join(PLUGIN_DIR, "..", "..");

// ── Persona Definitions ──

interface Persona {
  id: string;
  name: string;
  role: string;
  background: string;
  goals: string[];
  frustrations: string[];
  testScenarios: string[];
}

const PERSONAS: Persona[] = [
  {
    id: "startup-founder",
    name: "Alex Chen",
    role: "Startup Founder & CEO",
    background: "Serial entrepreneur running a 15-person B2B SaaS startup. Time-starved, needs to make fast decisions with incomplete information. Uses AI daily for competitive analysis, market research, investor prep, and strategic planning.",
    goals: [
      "Get comprehensive competitive analysis in minutes, not hours",
      "Make data-driven decisions with interactive dashboards",
      "Prepare investor-ready materials quickly",
      "Compare tools/vendors/strategies with clear recommendations",
    ],
    frustrations: [
      "Generic advice without actionable specifics",
      "Having to re-explain context every session",
      "Slow responses when urgency matters",
      "Results that look nice but lack depth",
    ],
    testScenarios: [
      "Ask Enso to compare 3 CRM platforms for a B2B SaaS startup",
      "Request a competitive landscape analysis of the AI agent market",
      "Ask for a go-to-market strategy for launching in Europe",
      "Try the research feature for 'latest Series A funding trends 2026'",
      "Ask Enso to plan a product launch timeline with milestones",
    ],
  },
  {
    id: "student-researcher",
    name: "Maya Patel",
    role: "Graduate Student & Researcher",
    background: "PhD student in computational biology. Uses AI for literature reviews, data analysis, understanding complex papers, and organizing research notes. Values depth and accuracy over speed.",
    goals: [
      "Deep dive into scientific topics with comprehensive sourcing",
      "Understand complex concepts with clear explanations",
      "Organize and synthesize information from multiple sources",
      "Generate visualizations of data and relationships",
    ],
    frustrations: [
      "Shallow summaries that miss nuances",
      "Lack of proper citations and source verification",
      "Cannot handle technical/domain-specific queries well",
      "No way to build on previous research sessions",
    ],
    testScenarios: [
      "Research 'CRISPR gene editing applications in agriculture 2026'",
      "Ask Enso to explain transformer attention mechanisms with diagrams",
      "Request a comparison of statistical methods for genomic analysis",
      "Try deep research on 'quantum computing impact on drug discovery'",
      "Ask for a literature review structure on machine learning in biology",
    ],
  },
  {
    id: "developer",
    name: "Jordan Kim",
    role: "Senior Full-Stack Developer",
    background: "10 years experience, primarily TypeScript/React/Node.js. Uses AI for code review, debugging, architecture decisions, and learning new technologies. Values precision and working code over explanations.",
    goals: [
      "Get working code solutions, not just concepts",
      "Debug complex issues with full context awareness",
      "Explore new frameworks and libraries efficiently",
      "Automate repetitive development tasks",
    ],
    frustrations: [
      "AI-generated code that doesn't compile or has subtle bugs",
      "Outdated library recommendations",
      "Lack of integration with actual development workflow",
      "Having to copy-paste between AI and IDE constantly",
    ],
    testScenarios: [
      "Open Claude Code via /code and ask to analyze a TypeScript error",
      "Try the terminal via /shell and run some system commands",
      "Ask Enso to compare React Server Components vs traditional SSR",
      "Request an architecture diagram for a microservices migration",
      "Try orchestrating: 'Build a REST API boilerplate with tests'",
    ],
  },
  {
    id: "business-analyst",
    name: "Sarah Thompson",
    role: "Business Intelligence Analyst",
    background: "Works at a mid-size e-commerce company. Spends most of her day analyzing sales data, creating reports, and building dashboards. Needs to present findings to non-technical stakeholders.",
    goals: [
      "Analyze data and generate insights without writing SQL",
      "Create polished visualizations and dashboards",
      "Automate recurring report generation",
      "Translate technical findings into business language",
    ],
    frustrations: [
      "AI tools that can't handle real spreadsheet data",
      "Pretty charts without actionable insights",
      "No memory of company-specific metrics and KPIs",
      "Results that need heavy reformatting for presentations",
    ],
    testScenarios: [
      "Ask Enso for a market size analysis of the e-commerce industry",
      "Request a dashboard comparing quarterly performance metrics",
      "Try: 'Analyze the pros and cons of subscription vs one-time pricing'",
      "Ask for a customer segmentation framework with visualizations",
      "Request an executive summary template for board presentation",
    ],
  },
  {
    id: "creative-professional",
    name: "Leo Morales",
    role: "Content Creator & Brand Strategist",
    background: "Freelance content strategist working with tech startups. Creates brand identities, marketing campaigns, social media content, and copywriting. Values creative inspiration alongside practical execution.",
    goals: [
      "Generate creative concepts and campaign ideas quickly",
      "Research trends and audience preferences",
      "Create content calendars and campaign plans",
      "Get inspiration while maintaining brand voice consistency",
    ],
    frustrations: [
      "Generic, cliche creative suggestions",
      "AI that doesn't understand brand tone and personality",
      "Cannot work with visual assets or design references",
      "Content that sounds robotic and needs heavy editing",
    ],
    testScenarios: [
      "Ask Enso for a social media campaign strategy for a fintech app",
      "Request creative tagline options for a sustainability brand",
      "Try: 'Research the latest content marketing trends for B2B SaaS'",
      "Ask for a 30-day content calendar with post ideas and hashtags",
      "Try the photo gallery or media features if available",
    ],
  },
  {
    id: "ai-technology-strategist",
    name: "Dr. Riya Nakamura",
    role: "AI Technology Strategist",
    background: "Former ML researcher at a top AI lab, now advises companies on AI strategy. Deep expertise in LLM capabilities, agent architectures, multimodal AI, and emerging AI tools. Always at the cutting edge of what's possible.",
    goals: [
      "Identify the most impactful emerging AI capabilities Enso should adopt",
      "Propose architectural improvements based on latest agent research",
      "Evaluate Enso against state-of-the-art AI agent platforms",
      "Recommend technology integrations that would leapfrog competitors",
    ],
    frustrations: [
      "AI products that use yesterday's techniques for tomorrow's problems",
      "Missed opportunities to leverage new model capabilities",
      "Lack of agentic depth — tools that chat but don't act",
      "No systematic way to absorb emerging AI advances",
    ],
    testScenarios: [
      "Review Enso's CLAUDE.md to understand current architecture and capabilities",
      "Research the latest agentic AI patterns: tool use, multi-agent orchestration, memory systems, and browser automation trends in 2026",
      "Evaluate emerging capabilities: real-time collaboration, voice interfaces, persistent agent memory, code generation quality improvements",
      "Compare Enso's approach against Manus AI, Devin, OpenAI Operator, Google Mariner, and other frontier agent platforms",
      "Identify 5 specific technology adoptions that would make Enso dramatically more capable",
    ],
  },
];

// ── Planning Prompt Builder ──

function buildEvolutionPlanningPrompt(
  goal: string,
  orchestrationId: string,
  planFilePath: string,
): string {
  const personaBlocks = PERSONAS.map((p, i) => {
    const isAIStrategist = p.id === "ai-technology-strategist";
    const role = isAIStrategist ? "researcher" : "coder";
    const scenarioList = p.testScenarios.map((s, j) => `  ${j + 1}. ${s}`).join("\n");

    return [
      `### Persona ${i + 1}: ${p.name} (${p.role})`,
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
      isAIStrategist
        ? [
            `**Instructions for this task:** This persona does NOT use the browser. Instead:`,
            `1. Read the project's CLAUDE.md file to understand Enso's current architecture`,
            `2. Perform 5-8 web searches on latest AI agent trends, emerging capabilities, new model features, and competitor platforms`,
            `3. Identify specific gaps between Enso's current state and the AI frontier`,
            `4. Write findings to \`.evolution-persona-${p.id}.md\` with: technology trends discovered, capability gaps, and 5+ specific proposals for adopting new AI patterns`,
          ].join("\n")
        : [
            `**Instructions for this task:**`,
            `1. Write a Node.js script \`test-persona-${p.id}.mjs\` using Puppeteer (already installed in node_modules) that:`,
            `   - Launches a headless browser and navigates to http://localhost:5173`,
            `   - Waits for the page to load (wait for "Message..." placeholder in input)`,
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
          ].join("\n"),
    ].join("\n");
  });

  const allPersonaIds = PERSONAS.map(p => `persona-${p.id}`);

  // Pick 2 representative user personas for validation re-testing
  const validationPersonas = PERSONAS.filter(p =>
    p.id === "startup-founder" || p.id === "student-researcher"
  );

  const lines = [
    `You are the Evolution Sprint Planner for Enso, an AI platform that builds interactive apps and handles complex tasks.`,
    ``,
    `Your job: Create a task plan for a FULL PRODUCT EVOLUTION SPRINT. This is a CLOSED-LOOP self-improvement cycle: personas test Enso, team discusses, engineering IMPLEMENTS the top enhancements, then user personas RE-TEST to validate.`,
    ``,
    goal ? `**User focus area:** ${goal}` : `**Focus:** General product assessment — test all major capabilities.`,
    ``,
    `## Sprint Phases (5 phases — the full loop)`,
    ``,
    `### Phase 1: Persona Testing`,
    `Each persona uses Enso through a real browser (Puppeteer) and writes a report.`,
    ``,
    `### Phase 2: Synthesis + Discussion`,
    `An architect synthesizes all reports, then a reviewer simulates a product team roundtable to debate and prioritize.`,
    ``,
    `### Phase 3: Engineering Implementation`,
    `The team picks the TOP 3-5 highest-impact enhancements from the discussion and ACTUALLY IMPLEMENTS them in the Enso codebase. Be AGGRESSIVE — Claude Code can implement features 10x faster than traditional engineering, so take on MORE enhancements per sprint, not fewer. Every sprint should deliver meaningful, visible improvements.`,
    `- An architect designs the solution (reads discussion + codebase)`,
    `- A coder implements the changes (writes actual TypeScript/React code)`,
    `- A reviewer validates the implementation (runs build, checks for errors)`,
    ``,
    `### Phase 4: Validation Re-Testing`,
    `Two user personas (Alex the founder, Maya the researcher) re-test Enso with the new changes to validate improvements.`,
    ``,
    `### Phase 5: Evolution Report Dashboard`,
    `A builder creates an interactive dashboard showing: before/after scores, what was implemented, validation results, and the backlog for next iteration.`,
    ``,
    `## Phase 1: Persona Definitions`,
    ``,
    ...personaBlocks,
    ``,
    `## Phase 2: Post-Persona Tasks`,
    ``,
    `### Synthesis`,
    `- **Task ID:** synthesis`,
    `- **Agent role:** architect`,
    `- **Dependencies:** ${allPersonaIds.join(", ")}`,
    `- **Instructions:** Read ALL \`.evolution-persona-*.md\` files. Identify common themes, patterns, and divergences across personas. Categorize findings into: UX Issues, Missing Features, Performance Issues, Bugs, AI Technology Opportunities. Rank by how many personas flagged each issue. Write \`.evolution-synthesis.md\` with prioritized findings. End with a clear "TOP 5 ACTIONABLE ENHANCEMENTS" section — each with title, description, impacted personas, estimated effort (small/medium/large), and specific files/areas to change.`,
    ``,
    `### Product Discussion`,
    `- **Task ID:** discussion`,
    `- **Agent role:** reviewer`,
    `- **Dependencies:** synthesis`,
    `- **Instructions:** Read \`.evolution-synthesis.md\` and all persona reports. Simulate a product team roundtable discussion where EACH persona's voice is represented. Debate priorities and trade-offs. End with a FINAL DECISION: the top 3-5 enhancements to implement THIS sprint. Be AGGRESSIVE — Claude Code implements features 10x faster than human engineers, so prioritize by IMPACT not effort. For each chosen enhancement, write a clear SPEC: what to change, which files, expected behavior before/after. Write \`.evolution-discussion.md\`.`,
    ``,
    `## Phase 3: Engineering Implementation`,
    ``,
    `### Design Solution`,
    `- **Task ID:** design-solution`,
    `- **Agent role:** architect`,
    `- **Dependencies:** discussion`,
    `- **Instructions:** Read \`.evolution-discussion.md\` for the chosen enhancements. Read the Enso codebase (CLAUDE.md, relevant source files) to understand current implementation. Design a CONCRETE technical solution:`,
    `  1. List exact files to modify with specific changes`,
    `  2. Consider edge cases and backwards compatibility`,
    `  3. Define acceptance criteria (what "done" looks like)`,
    `  Write \`.evolution-design.md\` with the full technical design.`,
    ``,
    `### Implement Changes`,
    `- **Task ID:** implement`,
    `- **Agent role:** coder`,
    `- **Dependencies:** design-solution`,
    `- **Instructions:** Read \`.evolution-design.md\` for the technical design. IMPLEMENT the changes in the actual Enso codebase. This means editing real TypeScript/React files in the project.`,
    `  CRITICAL RULES:`,
    `  - Read each file BEFORE editing to understand current code`,
    `  - Make surgical, minimal changes — don't rewrite entire files`,
    `  - Follow existing code conventions (check surrounding code style)`,
    `  - Do NOT touch package.json version fields`,
    `  - After all edits, run \`cd D:/Github/Enso && npm run build\` to verify compilation`,
    `  - If build fails, fix the errors immediately`,
    `  - Write \`.evolution-implementation.md\` listing every file changed and what was done`,
    `  SAFETY — ABSOLUTELY FORBIDDEN:`,
    `  - NEVER restart, stop, or kill the gateway/server process (it would kill this sprint!)`,
    `  - NEVER run restart.ps1 or restart.sh`,
    `  - NEVER use Stop-Process, taskkill, kill, or pkill on node processes`,
    `  - NEVER modify package.json, package-lock.json, or any lock files`,
    `  - NEVER run npm install, npm update, or any package manager commands`,
    `  - NEVER push to git (git push) — only make local changes`,
    `  - Changes take effect on next server restart which happens AFTER the sprint`,
    ``,
    `### Review & Validate`,
    `- **Task ID:** review`,
    `- **Agent role:** reviewer`,
    `- **Dependencies:** implement`,
    `- **Instructions:** Validate the implementation:`,
    `  1. Read \`.evolution-implementation.md\` to know what changed`,
    `  2. Read each modified file and verify the changes are correct`,
    `  3. Run \`cd D:/Github/Enso && npm run build\` — it MUST succeed`,
    `  4. If build fails, fix the issues and re-run build until it passes`,
    `  5. Check for regressions: no removed features, no broken imports`,
    `  6. Write \`.evolution-review.md\` with: pass/fail verdict, issues found, fixes applied`,
    ``,
    `## Phase 4: Validation Re-Testing`,
    ``,
    ...validationPersonas.map((p, i) => [
      `### Re-Test as ${p.name}`,
      `- **Task ID:** retest-${p.id}`,
      `- **Agent role:** coder`,
      `- **Dependencies:** review`,
      `- **Instructions:** The engineering team just implemented enhancements to Enso. Now re-test as ${p.name} (${p.role}).`,
      `  IMPORTANT: The code changes were made but the server has NOT been restarted yet. The changes will take effect after the sprint. For re-testing, focus on verifying the CODE QUALITY of what was written (read the changed files) and test existing functionality via Puppeteer. Do NOT attempt to restart the server, kill processes, or reload services.`,
      `  1. Read \`.evolution-implementation.md\` to know what changed`,
      `  2. Read the changed source files to verify code quality and correctness`,
      `  3. Read the original report \`.evolution-persona-${p.id}.md\` for baseline scores`,
      `  4. Write a NEW Puppeteer test script \`retest-persona-${p.id}.mjs\` that tests the existing Enso (pre-change behavior) on the SPECIFIC areas that were enhanced`,
      `  5. Compare the code changes with what was requested — will they solve the issues?`,
      `  6. Write \`.evolution-retest-${p.id}.md\` with:`,
      `     - What was enhanced and whether it improved the experience`,
      `     - Updated ratings (compare with original)`,
      `     - Remaining friction points for next iteration`,
      `     - Overall verdict: did the sprint make Enso better?`,
    ].join("\n")),
    ``,
    `## Phase 5: Evolution Report Dashboard`,
    ``,
    `### Build Evolution Dashboard`,
    `- **Task ID:** build-dashboard`,
    `- **Agent role:** builder`,
    `- **Dependencies:** retest-startup-founder, retest-student-researcher`,
    `- **Instructions:** Read ALL evolution files: \`.evolution-synthesis.md\`, \`.evolution-discussion.md\`, \`.evolution-design.md\`, \`.evolution-implementation.md\`, \`.evolution-review.md\`, \`.evolution-retest-*.md\`, and all original persona reports. Build a BESPOKE interactive dashboard. Write a single file named EXACTLY \`.orchestration-ui.jsx\` in the current working directory. The file must be under 500KB. NO import statements. Use var (not const/let). All React hooks at top level. Use EnsoUI components and Recharts.`,
    `  The dashboard MUST show:`,
    `  - **Overview tab:** Sprint summary — what was tested, what was implemented, validation results. Before/after health scores.`,
    `  - **Personas tab:** Scorecard for each persona with radar charts showing original ratings per dimension`,
    `  - **Implementation tab:** What enhancements were chosen, the design, files changed, review verdict. Show BEFORE and AFTER comparison.`,
    `  - **Validation tab:** Re-test results from Alex and Maya — did the changes actually improve their experience? Show score deltas.`,
    `  - **Backlog tab:** Remaining enhancement proposals ranked for the NEXT evolution sprint iteration.`,
    `  - **Discussion tab:** Key highlights from the product discussion`,
    ``,
    `## Output Format`,
    ``,
    `Write a JSON file to: ${planFilePath}`,
    ``,
    `The JSON must have this structure:`,
    `{`,
    `  "orchestrationId": "${orchestrationId}",`,
    `  "goal": "Evolution Sprint: ${goal || "Full product assessment"}",`,
    `  "tasks": [`,
    `    // Phase 1: Persona testing (6 tasks)`,
    `    { "taskId": "persona-startup-founder", "title": "Test as Startup Founder", "description": "...", "agentRole": "coder", "dependsOn": [] },`,
    `    { "taskId": "persona-student-researcher", "title": "Test as Graduate Student", "description": "...", "agentRole": "coder", "dependsOn": [] },`,
    `    { "taskId": "persona-developer", "title": "Test as Developer", "description": "...", "agentRole": "coder", "dependsOn": [] },`,
    `    { "taskId": "persona-business-analyst", "title": "Test as Business Analyst", "description": "...", "agentRole": "coder", "dependsOn": [] },`,
    `    { "taskId": "persona-creative-professional", "title": "Test as Creative", "description": "...", "agentRole": "coder", "dependsOn": [] },`,
    `    { "taskId": "persona-ai-technology-strategist", "title": "Evaluate as AI Strategist", "description": "...", "agentRole": "researcher", "dependsOn": [] },`,
    `    // Phase 2: Synthesis + Discussion`,
    `    { "taskId": "synthesis", "title": "Synthesize Feedback", "description": "...", "agentRole": "architect", "dependsOn": ["persona-startup-founder", ...all persona IDs] },`,
    `    { "taskId": "discussion", "title": "Product Discussion", "description": "...", "agentRole": "reviewer", "dependsOn": ["synthesis"] },`,
    `    // Phase 3: Engineering`,
    `    { "taskId": "design-solution", "title": "Design Solution", "description": "...", "agentRole": "architect", "dependsOn": ["discussion"] },`,
    `    { "taskId": "implement", "title": "Implement Enhancements", "description": "...", "agentRole": "coder", "dependsOn": ["design-solution"] },`,
    `    { "taskId": "review", "title": "Review & Validate", "description": "...", "agentRole": "reviewer", "dependsOn": ["implement"] },`,
    `    // Phase 4: Validation`,
    `    { "taskId": "retest-startup-founder", "title": "Re-Test as Alex (Founder)", "description": "...", "agentRole": "coder", "dependsOn": ["review"] },`,
    `    { "taskId": "retest-student-researcher", "title": "Re-Test as Maya (Researcher)", "description": "...", "agentRole": "coder", "dependsOn": ["review"] },`,
    `    // Phase 5: Dashboard`,
    `    { "taskId": "build-dashboard", "title": "Build Evolution Report", "description": "...", "agentRole": "builder", "dependsOn": ["retest-startup-founder", "retest-student-researcher"] }`,
    `  ],`,
    `  "agents": [`,
    `    { "role": "coder", "count": 7 },`,
    `    { "role": "researcher", "count": 1 },`,
    `    { "role": "architect", "count": 2 },`,
    `    { "role": "reviewer", "count": 2 },`,
    `    { "role": "builder", "count": 1 }`,
    `  ],`,
    `  "status": "reviewing"`,
    `}`,
    ``,
    `CRITICAL: Each task's "description" must contain the FULL instructions from above. The execution agent will ONLY see the task description, not this planning prompt. Include everything needed — persona profiles, test scenarios, file paths, acceptance criteria.`,
    ``,
    `Write ONLY the JSON file. Do not write any other files or explanations.`,
  ];

  return lines.join("\n");
}

// ── Entry Point ──

export async function handleEvolutionSprint(params: {
  goal?: string;
  client: ConnectedClient;
  account: ResolvedEnsoAccount;
}): Promise<void> {
  const { goal, client, account } = params;

  logAction({
    ts: Date.now(),
    type: "action",
    category: "evolution",
    message: `Evolution sprint start: ${goal || "Full product assessment"}`,
  });

  const sprintId = `sprint-${Date.now()}`;

  try {
    await handleOrchestration({
      userMessage: `Evolution Sprint: ${goal || "Test Enso from multiple persona perspectives, implement top enhancements, and validate improvements"}`,
      classification: {
        complexity: "orchestrated" as const,
        reasoning: "Evolution sprint — closed-loop product testing with implementation and validation",
      },
      client,
      account,
      planningPromptBuilder: (orchestrationId, planFilePath) =>
        buildEvolutionPlanningPrompt(goal || "", orchestrationId, planFilePath),
      onComplete: (_orchId, status) => {
        // Archive all evolution artifacts AFTER orchestration fully completes
        try {
          const meta = archiveEvolutionSprint(
            sprintId,
            goal || "Full product assessment",
            PROJECT_ROOT,
          );
          if (meta) {
            logAction({
              ts: Date.now(),
              type: "action",
              category: "evolution",
              message: `Sprint archived (${status}): ${meta.files.length} files, ${meta.phases.personas.count} personas, dashboard: ${meta.phases.dashboard}`,
            });
            // Clean temp files from project root
            cleanEvolutionTempFiles(PROJECT_ROOT);
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
