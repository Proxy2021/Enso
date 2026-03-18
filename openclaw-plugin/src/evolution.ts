/**
 * Enso Evolution Sprint — Self-evolving product development system.
 *
 * AI persona agents actually USE Enso through browser automation, provide
 * critical feedback from their unique perspectives, engage in a product
 * discussion, and generate prioritized enhancement proposals.
 *
 * This is a specialized orchestration — it reuses 100% of the orchestrator
 * infrastructure (same card type, same execution engine, same UI). The only
 * new code is persona definitions and an evolution-specific planning prompt.
 */

import { logAction, logError } from "./action-log.js";
import type { ConnectedClient, ResolvedEnsoAccount } from "./types.js";
import { handleOrchestration } from "./orchestrator.js";

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

const PLUGIN_DIR = new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1").replace(/\/$/, "");
const PROJECT_ROOT = join(PLUGIN_DIR, "..", "..");

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

  const lines = [
    `You are the Evolution Sprint Planner for Enso, an AI platform that builds interactive apps and handles complex tasks.`,
    ``,
    `Your job: Create a task plan for a PRODUCT EVOLUTION SPRINT. This is a self-improvement cycle where AI personas test Enso, provide feedback, and propose enhancements.`,
    ``,
    goal ? `**User focus area:** ${goal}` : `**Focus:** General product assessment — test all major capabilities.`,
    ``,
    `## Sprint Phases`,
    ``,
    `The sprint has 4 phases:`,
    `1. **Persona Testing** — Each persona uses Enso through a real browser (Puppeteer) and writes a report`,
    `2. **Synthesis** — An architect reads all reports and identifies themes/patterns`,
    `3. **Product Discussion** — A reviewer simulates a product team roundtable with each persona's voice`,
    `4. **Dashboard** — A builder creates a bespoke interactive UI showing the evolution results`,
    ``,
    `## Persona Definitions`,
    ``,
    ...personaBlocks,
    ``,
    `## Post-Persona Tasks`,
    ``,
    `### Synthesis`,
    `- **Task ID:** synthesis`,
    `- **Agent role:** architect`,
    `- **Dependencies:** ${allPersonaIds.join(", ")}`,
    `- **Instructions:** Read ALL \`.evolution-persona-*.md\` files. Identify common themes, patterns, and divergences across personas. Categorize findings into: UX Issues, Missing Features, Performance Issues, Bugs, AI Technology Opportunities. Write \`.evolution-synthesis.md\` with prioritized findings.`,
    ``,
    `### Product Discussion`,
    `- **Task ID:** discussion`,
    `- **Agent role:** reviewer`,
    `- **Dependencies:** synthesis`,
    `- **Instructions:** Read \`.evolution-synthesis.md\` and all persona reports. Simulate a product team roundtable discussion where EACH persona's voice is represented (use their names and speaking style). Debate priorities, trade-offs between different user needs, feasibility. The AI Technology Strategist should inject frontier technology insights. Write \`.evolution-discussion.md\` as a structured conversation log. End with a FINAL RANKED LIST of the top 10 enhancement proposals, each with: title, description, impact (high/medium/low), effort (high/medium/low), which personas benefit.`,
    ``,
    `### Build Evolution Dashboard`,
    `- **Task ID:** build-dashboard`,
    `- **Agent role:** builder`,
    `- **Dependencies:** discussion`,
    `- **Instructions:** Read \`.evolution-discussion.md\` and \`.evolution-synthesis.md\`. Build a BESPOKE one-off interactive dashboard. Write a single file named EXACTLY \`.orchestration-ui.jsx\` in the current working directory. The file must be under 500KB. The dashboard should show:`,
    `  - **Overview tab:** System health score, sprint summary stats`,
    `  - **Personas tab:** Scorecard for each persona with radar charts (ratings per dimension)`,
    `  - **Enhancements tab:** Ranked enhancement proposals with impact/effort badges, expandable descriptions`,
    `  - **Discussion tab:** Key highlights from the product discussion (the conversation between personas)`,
    `  - **Technology tab:** AI frontier insights from the strategist`,
    `  Use EnsoUI components (Tabs, DataTable, Stat, Badge, UICard, Progress, Accordion). Use Recharts for radar charts. Use var (not const/let). All hooks at top level.`,
    ``,
    `## Output Format`,
    ``,
    `Write a JSON file to: ${planFilePath}`,
    ``,
    `The JSON must have this exact structure:`,
    `{`,
    `  "orchestrationId": "${orchestrationId}",`,
    `  "goal": "Evolution Sprint: ${goal || "Full product assessment"}",`,
    `  "tasks": [`,
    `    { "taskId": "persona-startup-founder", "title": "Test as Startup Founder", "description": "...", "role": "coder", "dependsOn": [] },`,
    `    ... (one per persona)`,
    `    { "taskId": "synthesis", "title": "Synthesize Persona Feedback", "description": "...", "role": "architect", "dependsOn": ["persona-startup-founder", "persona-student-researcher", ...] },`,
    `    { "taskId": "discussion", "title": "Product Team Discussion", "description": "...", "role": "reviewer", "dependsOn": ["synthesis"] },`,
    `    { "taskId": "build-dashboard", "title": "Build Evolution Dashboard", "description": "...", "role": "builder", "dependsOn": ["discussion"] }`,
    `  ],`,
    `  "agents": [`,
    `    { "role": "coder", "count": ${PERSONAS.filter(p => p.id !== "ai-technology-strategist").length} },`,
    `    { "role": "researcher", "count": 1 },`,
    `    { "role": "architect", "count": 1 },`,
    `    { "role": "reviewer", "count": 1 },`,
    `    { "role": "builder", "count": 1 }`,
    `  ],`,
    `  "status": "reviewing"`,
    `}`,
    ``,
    `CRITICAL: Each task's "description" must contain the FULL persona profile AND detailed instructions from above. The execution agent will ONLY see the task description, not this planning prompt. Include everything needed.`,
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

  try {
    await handleOrchestration({
      userMessage: `Evolution Sprint: ${goal || "Test Enso from multiple persona perspectives and propose enhancements"}`,
      classification: {
        complexity: "orchestrated" as const,
        reasoning: "Evolution sprint — multi-persona product testing with synthesis and proposals",
      },
      client,
      account,
      planningPromptBuilder: (orchestrationId, planFilePath) =>
        buildEvolutionPlanningPrompt(goal || "", orchestrationId, planFilePath),
    });
  } catch (err) {
    logError("evolution", "Evolution sprint failed", err);
  }
}
