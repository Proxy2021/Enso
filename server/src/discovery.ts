/**
 * Discovery Engine — AI VC that identifies high-potential project opportunities.
 *
 * Models a real VC investment process:
 * Phase 1: Investment partners independently source opportunities in different domains
 * Phase 2: Each partner pitches their top recommendation to the team
 * Phase 3: Investment committee debate — rigorous challenge on market timing,
 *          Enso competitive advantage, feasibility, and cost of entry
 * Phase 4: Final deliverables — interactive dashboard + investment memo PPT
 *
 * Uses the orchestration engine (same DAG executor as evolution sprints).
 */

import { randomUUID } from "crypto";
import { handleOrchestration } from "./orchestrator.js";
import { logAction, logError } from "./action-log.js";
import { archiveDiscoveryResults, cleanDiscoveryTempFiles } from "./discovery-archive.js";
import { getWorkspace } from "./orchestration-workspace.js";
import type { ConnectedClient } from "./server.js";
import type { ResolvedEnsoAccount } from "./accounts.js";

// Resolve project root for archiving — same logic as orchestrator
const PROJECT_ROOT = new URL("../..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

export interface DiscoveryParams {
  focus?: string;       // Optional focus area (e.g., "developer tools", "fintech", "healthcare")
  client: ConnectedClient;
  account: ResolvedEnsoAccount;
}

// ── VC Team Definition ──

const VC_TEAM = {
  managingPartner: {
    name: "Catherine Zhou",
    title: "Managing Partner & Investment Committee Chair",
    focus: "Overall investment thesis, portfolio strategy, final go/no-go. Chairs the challenge session.",
  },
  partnerA: {
    name: "Daniel Okafor",
    title: "Investment Partner — Demand Signal Analyst",
    focus: "Sources by analyzing market pain points, user complaints, forum discussions, and unmet demand signals",
  },
  partnerB: {
    name: "Dr. Priya Sharma",
    title: "Investment Partner — Technology Timing Analyst",
    focus: "Sources by analyzing technology breakthroughs, new AI capabilities, cost curve crossings, and what's newly feasible",
  },
  partnerC: {
    name: "Marcus Webb",
    title: "Investment Partner — Competitive Gap Analyst",
    focus: "Sources by analyzing competitive whitespace, market gaps, underserved segments, and pricing opportunities",
  },
  pitchArchitect: {
    name: "Elena Vasquez",
    title: "Head of Investment Intelligence",
    focus: "Synthesizes all partner pitches and committee deliberations into final investment recommendation deliverables",
  },
  techChallenger: {
    name: "Dr. Raj Mehta",
    title: "Investment Committee — Technical Feasibility Challenger",
    focus: "Evaluates technical architecture, infrastructure costs, build complexity, and realistic MVP scope",
  },
  financialRealist: {
    name: "Sarah Park",
    title: "Investment Committee — Financial Realist",
    focus: "Evaluates unit economics, revenue projections, churn assumptions, and opportunity cost analysis",
  },
};

// ── Discovery Orchestration ──

export async function handleDiscovery(params: DiscoveryParams): Promise<void> {
  const { focus, client, account } = params;
  const focusLabel = focus?.trim() || "general high-impact AI-native projects";

  logAction({
    ts: Date.now(), type: "action", category: "discovery",
    message: `Starting discovery sprint — focus: ${focusLabel}`,
  });

  try {
    await handleOrchestration({
      userMessage: `AI VC Discovery Sprint: Identify high-potential project opportunities in "${focusLabel}"`,
      classification: {
        complexity: "orchestrated" as const,
        reasoning: "Discovery sprint — VC-style sourcing, pitching, challenge debate, and investment recommendation",
      },
      client,
      account,
      // Pass discovery context so per-task user context injection runs during execution
      context: {
        type: "discovery",
        goal: `Discover high-potential project opportunities${focusLabel ? ` in: ${focusLabel}` : ""}`,
      },
      maxConcurrency: 4,
      planningModel: "opus",
      planningPromptBuilder: (orchestrationId, planFilePath) =>
        buildDiscoveryPlanningPrompt(focusLabel, orchestrationId, planFilePath),
      onComplete: (orchId, status) => {
        logAction({
          ts: Date.now(), type: "action", category: "discovery",
          message: `Discovery sprint ${orchId} ${status} — focus: ${focusLabel}`,
        });
        // Archive discovery artifacts
        try {
          const ws = getWorkspace(orchId);
          const discoveryId = `discovery-${Date.now()}-${randomUUID().slice(0, 8)}`;
          const meta = archiveDiscoveryResults(discoveryId, focusLabel, PROJECT_ROOT, ws?.rootDir);
          if (meta) {
            logAction({
              ts: Date.now(), type: "action", category: "discovery",
              message: `Discovery archived (${status}): ${meta.files.length} files, dashboard: ${meta.phases.deliverables.dashboard}`,
            });
            cleanDiscoveryTempFiles(PROJECT_ROOT, ws?.rootDir);
          }
        } catch (err) {
          logError("discovery", "Failed to archive discovery results", err);
        }
      },
    });
  } catch (err) {
    logError("discovery", "Discovery sprint failed", err);
    throw err;
  }
}

// ── Planning Prompt ──

function buildDiscoveryPlanningPrompt(
  focus: string,
  orchestrationId: string,
  planFilePath: string,
): string {
  const workspace = getWorkspace(orchestrationId);
  const lines: string[] = [];

  lines.push(`# AI VC Discovery Sprint — Planning`);
  lines.push(``);
  lines.push(`You are the **AI Planning Engine** for an AI Venture Capital firm. Your job is to decompose an investment discovery mission into a task DAG that mirrors how a real VC firm operates: independent sourcing → pitch session → investment committee challenge → final recommendation.`);
  lines.push(``);
  lines.push(`## Mission`);
  lines.push(``);
  lines.push(`Identify **3-5 high-potential project opportunities** that the Enso AI platform should build and manage as portfolio projects.`);
  lines.push(``);
  lines.push(`**Focus area:** ${focus}`);
  lines.push(``);

  // Focus diversity guard — prevent echo-chamber when focus is broad
  if (focus.includes("general") || focus.length < 15) {
    lines.push(`**DIVERSITY REQUIREMENT**: Since the focus is broad, ensure your sourcing produces opportunities across AT LEAST 2 different industry verticals (e.g., healthcare + fintech, or education + logistics). Do NOT let all 3 sourcing lenses converge on the same narrow domain (e.g., all developer tools). Diversity of opportunity set is critical for portfolio decisions.`);
    lines.push(``);
  }

  // ── Enso context ──
  lines.push(`## About Enso (the builder)`);
  lines.push(``);
  lines.push(`Enso is an AI sandbox that generates complete solutions. It discovers project opportunities, assembles AI teams to build, self-evolves, and ships products. Key capabilities:`);
  lines.push(`- **AI Team Assembly**: For each project, Enso auto-generates a domain-specific AI team (Project Leader, Architect, Engineers, QA, domain specialists) and customer personas`);
  lines.push(`- **Autonomous Evolution**: 7-phase sprint cycle — persona testing → team evaluation → synthesis → implementation → review → validation. Each sprint makes the project better without human intervention.`);
  lines.push(`- **Claude Code Agents**: Each team member is a Claude Code session with full web research, code writing, and tool use capabilities`);
  lines.push(`- **Parallel Execution**: Up to 6 concurrent AI agents per sprint`);
  lines.push(`- **Stack Agnostic**: Can build Python, TypeScript, React, Node.js, Electron, mobile — any tech stack`);
  lines.push(`- **Cost Model**: Investment is in AI tokens (~$5-10 per evolution sprint). No salaries, no hiring.`);
  lines.push(`- **Strengths**: Rapid prototyping, iteration speed (daily sprints possible), multi-agent parallelism, built-in QA/testing, self-improving`);
  lines.push(`- **Limitations**: Requires well-defined product scope, best for software products, current focus on desktop/web/API (not hardware), needs human approval for major strategic decisions`);
  lines.push(``);

  // ── VC Team ──
  lines.push(`## The VC Investment Team`);
  lines.push(``);
  for (const [, member] of Object.entries(VC_TEAM)) {
    lines.push(`- **${member.name}** — ${member.title}: ${member.focus}`);
  }
  lines.push(``);

  // ── Phase structure ──
  lines.push(`## Required Task DAG Structure (5 Phases, 11 Tasks)`);
  lines.push(``);

  // Phase 1
  lines.push(`### Phase 1: Independent Deal Sourcing (3 parallel researcher tasks)`);
  lines.push(``);
  lines.push(`Three investment partners independently explore the SAME focus area ("${focus}") but through DIFFERENT sourcing lenses. They are NOT restricted to specific domains — each can find opportunities in any industry or vertical. The different lenses ensure diverse discovery:`);
  lines.push(``);
  lines.push(`**Assign one task per partner:**`);
  lines.push(``);
  lines.push(`- **sourcing-demand-signals** (${VC_TEAM.partnerA.name} — Demand Signal Analyst): Source by hunting for PAIN. Search Reddit, HackerNews, product review sites, support forums, Twitter/X complaints, and "I wish X existed" threads. Find the loudest unmet needs in the "${focus}" space. Identify 2-3 product opportunities where demand is proven but supply is weak. Your edge: you find opportunities others miss because you listen to users, not markets.`);
  lines.push(``);
  lines.push(`- **sourcing-tech-timing** (${VC_TEAM.partnerB.name} — Technology Timing Analyst): Source by analyzing TECHNOLOGY INFLECTION POINTS. What AI/ML capabilities crossed the feasibility threshold in 2024-2026? What was impossible 2 years ago but buildable now? Search for recent breakthroughs, new APIs, cost curves that just dropped, open-source releases that changed the game. Identify 2-3 product opportunities that are newly feasible because of a specific technology shift. Your edge: you find opportunities others miss because you see what's newly possible.`);
  lines.push(``);
  lines.push(`- **sourcing-competitive-gaps** (${VC_TEAM.partnerC.name} — Competitive Gap Analyst): Source by mapping COMPETITIVE WHITESPACE. Research existing products in the "${focus}" space — their pricing, reviews, limitations, customer complaints. Find markets where incumbents are complacent, overpriced, or technically outdated. Identify 2-3 product opportunities in underserved segments or where a 10x better product is possible. Your edge: you find opportunities others miss because you see where existing players are vulnerable.`);
  lines.push(``);
  lines.push(`Each partner's task description MUST instruct them to execute an ITERATIVE RESEARCH LOOP (Agentic RAG pattern):`);
  lines.push(``);
  lines.push(`CYCLE 1 — Initial Exploration:`);
  lines.push(`  a. PLAN: Identify 3 specific search queries based on your sourcing lens`);
  lines.push(`  b. SEARCH: Execute searches and read key results thoroughly`);
  lines.push(`  c. REFLECT: After reading results, ask yourself:`);
  lines.push(`     - Are my sources diverse (research firms, news, forums, vendor sites, academic)?`);
  lines.push(`     - Do I have conflicting data that needs resolution?`);
  lines.push(`     - Are there obvious coverage gaps?`);
  lines.push(`     - Am I finding opportunities across different verticals, or am I in an echo chamber?`);
  lines.push(`  d. ADJUST: Based on reflection, generate 2-3 targeted follow-up queries addressing gaps`);
  lines.push(``);
  lines.push(`CYCLE 2 — Deepening:`);
  lines.push(`  a. SEARCH: Execute follow-up queries`);
  lines.push(`  b. REFLECT: Evaluate whether findings are now sufficient`);
  lines.push(`  c. VERIFY: Cross-check key claims against a second independent source`);
  lines.push(`  d. ADJUST: If gaps remain, generate 1-2 more targeted queries`);
  lines.push(``);
  lines.push(`CYCLE 3 — Validation:`);
  lines.push(`  a. SEARCH: Final targeted searches to resolve any contradictions`);
  lines.push(`  b. SYNTHESIZE: Combine all findings, noting confidence level per claim:`);
  lines.push(`     - HIGH: Multiple credible sources agree`);
  lines.push(`     - MEDIUM: Single credible source or partial agreement`);
  lines.push(`     - LOW: No direct source; inferred from adjacent data`);
  lines.push(``);
  lines.push(`Minimum: 3 search-reflect cycles. Target: 10-15 total searches.`);
  lines.push(`Think step-by-step between each web search — reason about what you learned and what you still need before searching again.`);
  lines.push(``);
  lines.push(`After completing research cycles, propose 2-3 candidate opportunities (can be in ANY domain — not restricted). For each:`);
  lines.push(`   - **Product concept**: One-paragraph description of what to build`);
  lines.push(`   - **Problem validation**: Evidence that this problem is real (user complaints, forum threads, market data) with confidence level (HIGH/MEDIUM/LOW)`);
  lines.push(`   - **Market sizing**: TAM/SAM with real numbers and sources`);
  lines.push(`   - **Existing competition**: Who already does this? Where do they fall short?`);
  lines.push(`   - **Why now?**: What changed recently that makes this the right time?`);
  lines.push(`   - **Why Enso?**: Why is an AI-managed project the right approach vs traditional development?`);
  lines.push(`   - **Revenue model**: How would this make money?`);
  lines.push(`   - **Build estimate**: Rough scope (MVP in X weeks/sprints), tech stack recommendation`);
  lines.push(`   - **Source quality**: List every URL cited with credibility rating (HIGH/MEDIUM/LOW)`);
  lines.push(`Write findings to a .md file with full SOURCES section.`);
  lines.push(`End with <!-- STRUCTURED_SUMMARY --> block.`);
  lines.push(``);

  // Phase 2
  lines.push(`### Phase 2: Partner Pitch Session (3 parallel architect tasks, depends on Phase 1)`);
  lines.push(``);
  lines.push(`Each partner now reads ALL three sourcing reports (not just their own) and writes a formal investment pitch for their single BEST recommendation. They must consider what the other partners found to avoid overlap and to strengthen their own pitch.`);
  lines.push(``);
  lines.push(`**3 parallel pitch tasks:**`);
  lines.push(`- **pitch-demand** (${VC_TEAM.partnerA.name}): Read all 3 sourcing reports. Select your #1 opportunity (from ANY report, not just your own). Write a full investment pitch.`);
  lines.push(`- **pitch-tech** (${VC_TEAM.partnerB.name}): Same — read all 3 reports, pick the single best opportunity you see, write a full pitch.`);
  lines.push(`- **pitch-gaps** (${VC_TEAM.partnerC.name}): Same — read all 3 reports, pick the single best opportunity, write a full pitch.`);
  lines.push(``);
  lines.push(`NOTE: Partners CAN pick the same opportunity if they genuinely believe it's the best. They can also pick from another partner's sourcing report. The point is: each partner brings their own judgment about what's most investable.`);
  lines.push(``);
  lines.push(`Each pitch MUST include:`);
  lines.push(`1. **The Pitch** (2-3 paragraphs): What to build, for whom, why it matters`);
  lines.push(`2. **Market Opportunity**: Size, growth, timing — with real data`);
  lines.push(`3. **Competitive Analysis**: Who are the top 3-5 competitors? Feature comparison table. Where specifically do they fail?`);
  lines.push(`4. **Why This, Why Now**: What market shift or technology breakthrough makes this the right moment?`);
  lines.push(`5. **Why Enso Is the Right Builder**: Specific reasons why Enso's AI team approach gives an advantage over traditional development or existing competitors. Consider: speed, cost, iteration velocity, multi-agent parallelism, self-evolution.`);
  lines.push(`6. **Technical Approach**: Recommended tech stack, architecture sketch, key technical challenges`);
  lines.push(`7. **Revenue Model & Unit Economics**: Pricing strategy, customer acquisition, projected revenue timeline`);
  lines.push(`8. **Build Plan**: MVP scope, estimated sprints to MVP, post-MVP evolution roadmap`);
  lines.push(`9. **Risk Factors**: What could go wrong? What are the assumptions?`);
  lines.push(`10. **Investment Ask**: Estimated token cost for MVP, monthly evolution cost, expected time to market`);
  lines.push(``);

  // Phase 3: Multi-Critic Investment Committee
  lines.push(`### Phase 3: Investment Committee Challenge (4 tasks: 3 parallel critics + 1 synthesis)`);
  lines.push(``);
  lines.push(`The Investment Committee uses a STRUCTURED DEBATE PROTOCOL. Three specialized critics independently evaluate all pitches from different adversarial lenses. A synthesis chair then aggregates their critiques into final verdicts.`);
  lines.push(``);
  lines.push(`**Phase 3a: 3 PARALLEL Critic Tasks (each depends on ALL Phase 2 tasks)**`);
  lines.push(``);
  lines.push(`- **committee-market-skeptic** (${VC_TEAM.managingPartner.name} — Market Skeptic, architect role):`);
  lines.push(`  Read all 3 partner pitches. Challenge EXCLUSIVELY from a market/commercial lens:`);
  lines.push(`  - Is the market timing right? Is this riding a tailwind or fighting headwinds?`);
  lines.push(`  - Who are the first 100 customers? Is there evidence of willingness-to-pay?`);
  lines.push(`  - What's the realistic customer acquisition path?`);
  lines.push(`  - Are the market size figures credible? (Do your own web research to verify)`);
  lines.push(`  - What competitors already have traction that the pitches understated?`);
  lines.push(`  Output: Per-project market critique + 6-axis SCORING block.`);
  lines.push(``);
  lines.push(`- **committee-tech-feasibility** (${VC_TEAM.techChallenger.name} — Technical Feasibility Challenger, architect role):`);
  lines.push(`  Read all 3 partner pitches. Challenge EXCLUSIVELY from a technical/feasibility lens:`);
  lines.push(`  - Can Claude Code agents actually build this? What are the hardest technical challenges?`);
  lines.push(`  - Are the infrastructure cost estimates realistic? (Do your own research on API costs, hosting)`);
  lines.push(`  - What's the realistic MVP scope — cut the aspirational features, what ACTUALLY ships in 4-8 weeks?`);
  lines.push(`  - What are the integration dependencies and failure modes?`);
  lines.push(`  - Are the tech stack recommendations sound?`);
  lines.push(`  Output: Per-project technical critique + 6-axis SCORING block.`);
  lines.push(``);
  lines.push(`- **committee-financial-realist** (${VC_TEAM.financialRealist.name} — Financial Realist, architect role):`);
  lines.push(`  Read all 3 partner pitches. Challenge EXCLUSIVELY from a financial/unit economics lens:`);
  lines.push(`  - Are the revenue projections realistic? What are comparable SaaS benchmarks?`);
  lines.push(`  - What's the real LTV/CAC ratio? Use churn benchmarks from LiveX AI, ProfitWell, etc.`);
  lines.push(`  - At what user count does this break even on token costs?`);
  lines.push(`  - What's the opportunity cost — what else could those tokens build?`);
  lines.push(`  - Are the pricing assumptions defensible? (Research competitor pricing)`);
  lines.push(`  Output: Per-project financial critique + 6-axis SCORING block.`);
  lines.push(``);
  lines.push(`Each critic MUST:`);
  lines.push(`1. Do independent web research to validate or challenge claims`);
  lines.push(`2. Rate confidence per challenge (HIGH/MEDIUM/LOW)`);
  lines.push(`3. End with a per-project verdict: STRONG BUY / BUY / HOLD / PASS`);
  lines.push(`4. Include a <!-- SCORING {...} --> block with 6-axis scores per project (see format below)`);
  lines.push(``);
  lines.push(`**Phase 3b: 1 Synthesis Task (depends on ALL 3 critic tasks)**`);
  lines.push(``);
  lines.push(`- **committee-synthesis** (${VC_TEAM.managingPartner.name} — Investment Committee Chair, architect role):`);
  lines.push(`  Read all 3 critic reports. Produce the FINAL committee verdict:`);
  lines.push(`  1. For each project, aggregate the 3 critics' scores using MAJORITY VOTING:`);
  lines.push(`     - If 2+ critics say BUY/STRONG BUY → verdict is BUY (or STRONG BUY if unanimous)`);
  lines.push(`     - If 2+ critics say HOLD/PASS → verdict is HOLD or PASS`);
  lines.push(`     - Capture dissenting views explicitly`);
  lines.push(`  2. Produce a unified SCORING block with averaged scores across critics`);
  lines.push(`  3. Rank all projects by composite score`);
  lines.push(`  4. Write "Dissenting Views" section capturing where critics disagreed`);
  lines.push(`  5. Include final <!-- SCORING {...} --> and <!-- PROJECT_SCAFFOLD {...} --> blocks`);
  lines.push(``);
  lines.push(`**MANDATORY: Structured Scoring Block**`);
  lines.push(`For EACH evaluated project, every critic and the synthesis MUST include a machine-readable scoring block:`);
  lines.push(``);
  lines.push(`<!-- SCORING {`);
  lines.push(`  "projects": [`);
  lines.push(`    {`);
  lines.push(`      "name": "Project Name",`);
  lines.push(`      "verdict": "STRONG BUY | BUY | HOLD | PASS",`);
  lines.push(`      "scores": {`);
  lines.push(`        "marketTiming": <1-10>,`);
  lines.push(`        "ensoAdvantage": <1-10>,`);
  lines.push(`        "feasibility": <1-10>,`);
  lines.push(`        "revenuePotential": <1-10>,`);
  lines.push(`        "moatStrength": <1-10>,`);
  lines.push(`        "costEfficiency": <1-10>`);
  lines.push(`      },`);
  lines.push(`      "investmentRange": "$X-$Y",`);
  lines.push(`      "estimatedROI": "Nx-Mx",`);
  lines.push(`      "rank": <1|2|3>`);
  lines.push(`    }`);
  lines.push(`  ]`);
  lines.push(`} -->`);
  lines.push(``);
  lines.push(`Score Calibration (apply consistently):`);
  lines.push(`- 1-3: Fundamentally broken / critical failure / non-viable`);
  lines.push(`- 4-5: Significant concerns / barely viable`);
  lines.push(`- 6-7: Adequate / viable with conditions`);
  lines.push(`- 8-9: Strong / compelling / minor concerns only`);
  lines.push(`- 10: Exceptional / best-in-class`);
  lines.push(``);
  lines.push(`This scoring block enables the dashboard builder to render actual comparison charts, radar visualizations, and data-driven rankings. Do NOT skip it.`);
  lines.push(``);
  lines.push(`**MANDATORY: Project Scaffold Block (for BUY/STRONG BUY only)**`);
  lines.push(`For each project with a BUY or STRONG BUY verdict, the synthesis MUST include:`);
  lines.push(``);
  lines.push(`<!-- PROJECT_SCAFFOLD {`);
  lines.push(`  "name": "Suggested Project Name",`);
  lines.push(`  "tagline": "One-line description",`);
  lines.push(`  "techStack": "React, Node.js, PostgreSQL, etc.",`);
  lines.push(`  "teamComposition": ["Project Leader", "Backend Architect", "Frontend Builder", "QA Engineer", "Domain Specialist"],`);
  lines.push(`  "mvpScope": "3-sentence description of MVP",`);
  lines.push(`  "estimatedSprints": <number>,`);
  lines.push(`  "monthlyTokenBudget": "$X",`);
  lines.push(`  "firstSprintGoal": "What the first evolution sprint should accomplish"`);
  lines.push(`} -->`);
  lines.push(``);

  // Phase 4
  lines.push(`### Phase 4: Investment Recommendation Deliverables (1 builder task, depends on Phase 3b)`);
  lines.push(``);
  lines.push(`**${VC_TEAM.pitchArchitect.name}** (Head of Investment Intelligence) creates TWO deliverables:`);
  lines.push(``);
  lines.push(`#### Deliverable 1: Interactive Investment Dashboard`);
  lines.push(`Write a bespoke React JSX dashboard to exactly \`${workspace ? workspace.dashboardPath : ".orchestration-ui.jsx"}\` (this filename triggers rendering in the UI).`);
  lines.push(``);
  lines.push(`**AVAILABLE LIBRARIES**: React 19, Recharts (import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'), lucide-react icons. Use ResponsiveContainer for all charts. Use Tooltip on every chart for hover interactivity.`);
  lines.push(``);
  lines.push(`**CRITICAL REQUIREMENTS for Dashboard:**`);
  lines.push(`- Front-load the verdict: The FIRST thing visible must be verdict badges (BUY/HOLD/PASS) with key metrics (investment range, ROI, risk level). Users must understand the outcome in 5 seconds.`);
  lines.push(`- Use Recharts library for all charts — it's available in the sandbox. Include: RadarChart with tooltips, BarChart with hover effects, responsive containers.`);
  lines.push(`- Every data point in charts must have a Tooltip component showing context on hover.`);
  lines.push(`- Include a "Recommended Next Steps" section with: sprint plan, team composition, estimated cost, and timeline.`);
  lines.push(`- Include a "Comparison Matrix" tab with sortable data and color-coded scoring (green ≥7, yellow 4-6, red ≤3).`);
  lines.push(``);
  lines.push(`The FIRST section of the dashboard (above the fold) MUST be:`);
  lines.push(`- A row of VerdictBadge components showing each project's verdict (BUY/HOLD/PASS) with colored backgrounds`);
  lines.push(`- A row of StatBox components: Total Opportunities Sourced, Total Web Searches, Total Sources Cited, Committee Score Range`);
  lines.push(`- A 1-sentence portfolio recommendation in bold`);
  lines.push(`This must render in < 500px of vertical space so users see the decision immediately.`);
  lines.push(``);
  lines.push(`The dashboard MUST include:`);
  lines.push(`- **Executive Summary** tab: Front-loaded verdicts + stats + portfolio recommendation`);
  lines.push(`- **Per-Recommendation deep dive** (one per project, ordered by committee ranking):`);
  lines.push(`  - Project name, one-line pitch, committee verdict badge (STRONG BUY/BUY/HOLD/PASS)`);
  lines.push(`  - Problem → Solution → Why AI → Why Now narrative`);
  lines.push(`  - Market size with source citations`);
  lines.push(`  - Competitive advantage analysis with comparison table`);
  lines.push(`  - Why Enso wins: specific advantages of AI-managed development`);
  lines.push(`  - Technical feasibility assessment with build estimate`);
  lines.push(`  - Revenue model and path to break-even`);
  lines.push(`  - Cost breakdown (tokens, infrastructure, APIs, timeline)`);
  lines.push(`  - Radar chart comparing scores (market-timing, enso-advantage, feasibility, revenue-potential, moat-strength, cost-efficiency)`);
  lines.push(`  - Risk factors with mitigation strategies`);
  lines.push(`  - Committee strengths/challenges/conditions + dissenting views`);
  lines.push(`- **Comparison Matrix** tab: Side-by-side scoring table with color-coded cells (green ≥7, yellow 4-6, red ≤3)`);
  lines.push(`- **Recommended Next Steps** tab:`);
  lines.push(`  - For each BUY project: "Create [ProjectName] Project" CTA text, suggested team composition, first sprint goal, estimated token investment`);
  lines.push(`  - Timeline: "Week 1: MVP sprint. Week 2-3: Evolution sprints. Week 4: User testing."`);
  lines.push(`  - Token cost breakdown: planning tokens + implementation tokens + evolution tokens`);
  lines.push(`  - Include a prominent call-to-action: **"To build any recommendation, say: 'Build [name] as a working product' — Enso will create it automatically."**`);
  lines.push(`- **Research Trail** tab: All URLs, citations, and data sources from the entire discovery process`);
  lines.push(`- **VC Process** tab: Summary of how the discovery was conducted — phases, participants, methodology`);
  lines.push(``);
  lines.push(`#### Deliverable 2: Investment Memo (PPT-style document)`);
  lines.push(`Write a comprehensive investment memo to \`${workspace ? workspace.outputsDir + "/investment-memo.md" : "investment-memo.md"}\` structured as a presentation deck:`);
  lines.push(``);
  lines.push(`**CRITICAL REQUIREMENTS for Investment Memo:**`);
  lines.push(`- Start with a 1-page EXECUTIVE SUMMARY (Slide 0) that fits on a single screen: verdict badges, key metrics table, top 3 risks, recommended action. This is the "board slide."`);
  lines.push(`- Every factual claim MUST include an inline citation: [claim text](source_url). Do NOT use bibliography-only citations. Inline links are mandatory.`);
  lines.push(`- Add a "Decision Matrix" slide mapping each opportunity against Enso-specific criteria: build complexity, evolution sprint suitability, token cost efficiency, time-to-revenue.`);
  lines.push(`- Add confidence badges per section: "Data Confidence: HIGH/MEDIUM/LOW" based on source quality.`);
  lines.push(`- Slides should use tables and bold formatting for scanability — this should read like a Goldman Sachs investment memo.`);
  lines.push(``);
  lines.push(`Slide structure:`);
  lines.push(`0. **Executive Summary (Board Slide)**: Verdict badges, key metrics table, top 3 risks, recommended action — MUST fit on one screen`);
  lines.push(`1. **Title Slide**: "AI VC Discovery — ${focus}" + date + VC team names`);
  lines.push(`2. **Discovery Process**: How we researched (phases, agents, total searches, sources analyzed)`);
  lines.push(`3. **Market Landscape**: Overview of the ${focus} market with key data points + inline citations`);
  lines.push(`4-6. **Project Deep Dives** (one per recommended project):`);
  lines.push(`   - The Opportunity (problem + market) with inline citations`);
  lines.push(`   - The Solution (what to build + why AI)`);
  lines.push(`   - Competitive Position (vs named competitors with strengths/weaknesses table)`);
  lines.push(`   - Why Enso Wins (specific advantages)`);
  lines.push(`   - Build Plan (MVP scope, timeline, tech stack)`);
  lines.push(`   - Financial Model (cost to build, revenue projection, break-even)`);
  lines.push(`   - Risk Assessment with confidence badges`);
  lines.push(`7. **Decision Matrix**: All projects vs Enso-specific criteria (build complexity, sprint suitability, token efficiency, time-to-revenue)`);
  lines.push(`8. **Comparison & Ranking**: All projects scored side-by-side with dissenting views`);
  lines.push(`9. **Investment Committee Verdict**: Final recommendations with conditions`);
  lines.push(`10. **Next Steps**: What happens if approved (Enso project creation, team assembly, first sprint)`);
  lines.push(`11. **Appendix**: Full research sources, raw data tables, methodology notes`);
  lines.push(``);
  lines.push(`Format each slide as a markdown section with \`---\` separators. Use tables, bullet points, and bold formatting for scanability.`);
  lines.push(``);

  // Agent roles
  lines.push(`## Agent Roles Available`);
  lines.push(``);
  lines.push(`- \`researcher\` — Can search the web, read pages, analyze data. Use for Phase 1 sourcing.`);
  lines.push(`- \`architect\` — Can synthesize, design, make strategic decisions. Use for Phase 2 pitches, Phase 3a critics, and Phase 3b synthesis.`);
  lines.push(`- \`builder\` — Can build bespoke UIs and write structured documents. Use for Phase 4 deliverables.`);
  lines.push(`- \`reviewer\` — Can evaluate and validate. Available if needed.`);
  lines.push(`- \`coder\` — Can write code. Available if needed.`);
  lines.push(``);

  // Output format
  lines.push(`## Output Format`);
  lines.push(``);
  lines.push(`Write a JSON plan to: ${planFilePath}`);
  lines.push(``);
  lines.push(`The JSON must have this exact structure (11 tasks total):`);
  lines.push(`\`\`\`json`);
  lines.push(`{`);
  lines.push(`  "orchestrationId": "${orchestrationId}",`);
  lines.push(`  "goal": "AI VC Discovery: ${focus}",`);
  lines.push(`  "tasks": [`);
  lines.push(`    { "taskId": "sourcing-demand-signals", "agentRole": "researcher", "dependsOn": [] },`);
  lines.push(`    { "taskId": "sourcing-tech-timing", "agentRole": "researcher", "dependsOn": [] },`);
  lines.push(`    { "taskId": "sourcing-competitive-gaps", "agentRole": "researcher", "dependsOn": [] },`);
  lines.push(`    { "taskId": "pitch-demand", "agentRole": "architect", "dependsOn": ["sourcing-demand-signals","sourcing-tech-timing","sourcing-competitive-gaps"] },`);
  lines.push(`    { "taskId": "pitch-tech", "agentRole": "architect", "dependsOn": ["sourcing-demand-signals","sourcing-tech-timing","sourcing-competitive-gaps"] },`);
  lines.push(`    { "taskId": "pitch-gaps", "agentRole": "architect", "dependsOn": ["sourcing-demand-signals","sourcing-tech-timing","sourcing-competitive-gaps"] },`);
  lines.push(`    { "taskId": "committee-market-skeptic", "agentRole": "architect", "dependsOn": ["pitch-demand","pitch-tech","pitch-gaps"] },`);
  lines.push(`    { "taskId": "committee-tech-feasibility", "agentRole": "architect", "dependsOn": ["pitch-demand","pitch-tech","pitch-gaps"] },`);
  lines.push(`    { "taskId": "committee-financial-realist", "agentRole": "architect", "dependsOn": ["pitch-demand","pitch-tech","pitch-gaps"] },`);
  lines.push(`    { "taskId": "committee-synthesis", "agentRole": "architect", "dependsOn": ["committee-market-skeptic","committee-tech-feasibility","committee-financial-realist"] },`);
  lines.push(`    { "taskId": "deliverables", "agentRole": "builder", "dependsOn": ["committee-synthesis"] }`);
  lines.push(`  ]`);
  lines.push(`}`);
  lines.push(`\`\`\``);
  lines.push(``);
  lines.push(`Each task object must also include "title", "description" (FULL agent instructions), and "outputType" fields. The above shows the required taskIds, roles, and dependency graph.`);
  lines.push(``);

  // Rules
  lines.push(`## Critical Rules`);
  lines.push(``);
  lines.push(`1. Phase 1 (sourcing): 3 parallel tasks, NO dependencies`);
  lines.push(`2. Phase 2 (pitches): 3 parallel tasks, each depends on ALL 3 Phase 1 tasks (so each partner reads everyone's research)`);
  lines.push(`3. Phase 3a (critics): 3 parallel tasks, each depends on ALL 3 Phase 2 tasks`);
  lines.push(`4. Phase 3b (synthesis): 1 task, depends on ALL 3 Phase 3a tasks`);
  lines.push(`5. Phase 4 (deliverables): 1 task, depends on Phase 3b`);
  lines.push(`6. Task descriptions must be COMPLETE and SELF-CONTAINED — agents only see their own task description`);
  lines.push(`7. Every task must end with a <!-- STRUCTURED_SUMMARY {JSON} --> block`);
  lines.push(`8. Phase 4 builder MUST write dashboard to exactly \`${workspace ? workspace.dashboardPath : ".orchestration-ui.jsx"}\` AND memo to \`${workspace ? workspace.outputsDir + "/investment-memo.md" : "investment-memo.md"}\``);
  lines.push(`9. Research tasks must include SPECIFIC web search queries — don't be vague`);
  lines.push(`10. All monetary figures in USD`);
  lines.push(`11. Recommendations must be ACTIONABLE — specific enough that we can immediately create an Enso project and start building`);
  lines.push(`12. The committee critics (Phase 3a) must be GENUINELY ADVERSARIAL — each critic attacks from their specific lens. Do NOT rubber-stamp. Kill weak ideas. Challenge assumptions. Be skeptical.`);
  lines.push(`13. Every recommendation must answer: "Why would someone choose this over [named competitor X]?" with a specific answer, not hand-waving`);
  lines.push(`14. Every critic and the synthesis MUST include a <!-- SCORING {...} --> block. The dashboard builder depends on this data.`);
  lines.push(`15. The synthesis (Phase 3b) MUST include <!-- PROJECT_SCAFFOLD {...} --> for every BUY/STRONG BUY verdict.`);

  return lines.join("\n");
}
