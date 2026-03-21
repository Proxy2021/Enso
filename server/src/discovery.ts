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

import { handleOrchestration } from "./orchestrator.js";
import { logAction, logError } from "./action-log.js";
import { archiveDiscoveryResults, cleanDiscoveryTempFiles } from "./discovery-archive.js";
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
          const discoveryId = `discovery-${Date.now()}`;
          const meta = archiveDiscoveryResults(discoveryId, focusLabel, PROJECT_ROOT);
          if (meta) {
            logAction({
              ts: Date.now(), type: "action", category: "discovery",
              message: `Discovery archived (${status}): ${meta.files.length} files, dashboard: ${meta.phases.deliverables.dashboard}`,
            });
            cleanDiscoveryTempFiles(PROJECT_ROOT);
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
  lines.push(`## Required Task DAG Structure (5 Phases)`);
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
  lines.push(`Each partner's task description MUST instruct them to:`);
  lines.push(`1. Do at least 7 real web searches using their specific sourcing lens`);
  lines.push(`2. Read actual web pages, articles, forums, and product reviews`);
  lines.push(`3. Propose 2-3 candidate opportunities (can be in ANY domain — not restricted). For each:`);
  lines.push(`   - **Product concept**: One-paragraph description of what to build`);
  lines.push(`   - **Problem validation**: Evidence that this problem is real (user complaints, forum threads, market data)`);
  lines.push(`   - **Market sizing**: TAM/SAM with real numbers and sources`);
  lines.push(`   - **Existing competition**: Who already does this? Where do they fall short?`);
  lines.push(`   - **Why now?**: What changed recently that makes this the right time?`);
  lines.push(`   - **Why Enso?**: Why is an AI-managed project the right approach vs traditional development?`);
  lines.push(`   - **Revenue model**: How would this make money?`);
  lines.push(`   - **Build estimate**: Rough scope (MVP in X weeks/sprints), tech stack recommendation`);
  lines.push(`4. Write findings to a .md file with full SOURCES section`);
  lines.push(`5. End with <!-- STRUCTURED_SUMMARY --> block`);
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

  // Phase 3
  lines.push(`### Phase 3: Investment Committee Challenge (1 architect task, depends on ALL Phase 2)`);
  lines.push(``);
  lines.push(`**${VC_TEAM.managingPartner.name}** (Managing Partner) chairs the Investment Committee session. She reads all 3 partner pitches and conducts a rigorous challenge debate. This is the MOST CRITICAL phase — the quality gate that separates good ideas from investable opportunities.`);
  lines.push(``);
  lines.push(`The committee MUST evaluate each pitched project against these HARD QUESTIONS:`);
  lines.push(``);
  lines.push(`**A. Market Timing & Prospect (Why now? Why is this a winner?)**`);
  lines.push(`- Is the market growing fast enough to support a new entrant?`);
  lines.push(`- Is this riding a tailwind (regulatory change, technology shift, behavioral change) or fighting headwinds?`);
  lines.push(`- What's the realistic customer acquisition path? Who are the first 100 users?`);
  lines.push(`- Is there evidence of willingness-to-pay at the proposed price point?`);
  lines.push(``);
  lines.push(`**B. Enso Competitive Advantage (Why will Enso's approach win against strong incumbents?)**`);
  lines.push(`- Named competitors already exist with funding, users, and teams. Why would an AI-built product beat them?`);
  lines.push(`- What specific advantage does Enso's AI team model provide? (Speed? Cost? Iteration velocity? Personalization? Multi-agent quality?)`);
  lines.push(`- Where does Enso's approach FAIL compared to a well-funded startup with human engineers?`);
  lines.push(`- Is the moat in the product itself, or in Enso's ability to evolve it faster than competitors?`);
  lines.push(`- Could an incumbent simply copy the features faster than Enso can build market share?`);
  lines.push(``);
  lines.push(`**C. Realistic Feasibility (Can we actually build this?)**`);
  lines.push(`- What are the hardest technical challenges? Can Claude Code agents solve them?`);
  lines.push(`- Does this require capabilities Enso doesn't have yet? (e.g., real-time data, hardware integration, regulatory compliance)`);
  lines.push(`- What's the realistic MVP scope — not aspirational, but what can actually ship in 4-8 weeks of evolution sprints?`);
  lines.push(`- What are the integration dependencies? (APIs, data sources, third-party services)`);
  lines.push(`- What's the testing strategy? How do we validate the product works before shipping?`);
  lines.push(``);
  lines.push(`**D. Cost of Going In (What's the real investment?)**`);
  lines.push(`- Estimated token cost for MVP development (planning + implementation + evolution sprints)`);
  lines.push(`- Monthly ongoing token cost for continuous evolution after launch`);
  lines.push(`- Infrastructure/hosting costs if applicable (servers, APIs, databases)`);
  lines.push(`- Third-party API costs (data feeds, external services)`);
  lines.push(`- Opportunity cost — what else could those tokens be spent on?`);
  lines.push(`- Time cost — how many calendar weeks from start to usable MVP?`);
  lines.push(`- Break-even analysis — at what user/revenue level does the project pay for its own tokens?`);
  lines.push(``);
  lines.push(`**Output format**: For each of the 3 pitched projects, write:`);
  lines.push(`1. **Committee Verdict**: STRONG BUY / BUY / HOLD / PASS`);
  lines.push(`2. **Strengths** (what the committee found compelling)`);
  lines.push(`3. **Challenges** (what concerns were raised)`);
  lines.push(`4. **Conditions** (what must be true for this to succeed)`);
  lines.push(`5. **Final Ranking** with justification`);
  lines.push(`6. Do additional web research if needed to validate or challenge partner claims`);
  lines.push(``);

  // Phase 4
  lines.push(`### Phase 4: Investment Recommendation Deliverables (1 builder task, depends on Phase 3)`);
  lines.push(``);
  lines.push(`**${VC_TEAM.pitchArchitect.name}** (Head of Investment Intelligence) creates TWO deliverables:`);
  lines.push(``);
  lines.push(`#### Deliverable 1: Interactive Investment Dashboard`);
  lines.push(`Write a bespoke React JSX dashboard to exactly \`.orchestration-ui.jsx\` (this filename triggers rendering in the UI).`);
  lines.push(``);
  lines.push(`The dashboard MUST include:`);
  lines.push(`- **Executive Summary** tab: Discovery process overview, total research conducted, committee verdict summary`);
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
  lines.push(`  - Committee strengths/challenges/conditions`);
  lines.push(`- **Comparison Matrix** tab: Side-by-side scoring table of all candidates`);
  lines.push(`- **Research Trail** tab: All URLs, citations, and data sources from the entire discovery process`);
  lines.push(`- **VC Process** tab: Summary of how the discovery was conducted — phases, participants, methodology`);
  lines.push(``);
  lines.push(`#### Deliverable 2: Investment Memo (PPT-style document)`);
  lines.push(`Write a comprehensive investment memo to \`investment-memo.md\` structured as a presentation deck:`);
  lines.push(``);
  lines.push(`Slide structure:`);
  lines.push(`1. **Title Slide**: "AI VC Discovery — ${focus}" + date + VC team names`);
  lines.push(`2. **Executive Summary**: Key findings in 3 bullets`);
  lines.push(`3. **Discovery Process**: How we researched (phases, agents, total searches, sources analyzed)`);
  lines.push(`4. **Market Landscape**: Overview of the ${focus} market with key data points`);
  lines.push(`5-7. **Project Deep Dives** (one per recommended project):`);
  lines.push(`   - The Opportunity (problem + market)`);
  lines.push(`   - The Solution (what to build + why AI)`);
  lines.push(`   - Competitive Position (vs named competitors with strengths/weaknesses table)`);
  lines.push(`   - Why Enso Wins (specific advantages)`);
  lines.push(`   - Build Plan (MVP scope, timeline, tech stack)`);
  lines.push(`   - Financial Model (cost to build, revenue projection, break-even)`);
  lines.push(`   - Risk Assessment`);
  lines.push(`8. **Comparison & Ranking**: All projects scored side-by-side`);
  lines.push(`9. **Investment Committee Verdict**: Final recommendations with conditions`);
  lines.push(`10. **Next Steps**: What happens if approved (Enso project creation, team assembly, first sprint)`);
  lines.push(`11. **Appendix**: Full research sources, raw data tables, methodology notes`);
  lines.push(``);
  lines.push(`Format each slide as a markdown section with \`---\` separators. Use tables, bullet points, and bold formatting for scanability. This should read like a Goldman Sachs investment memo — data-rich, rigorous, and actionable.`);
  lines.push(``);

  // Agent roles
  lines.push(`## Agent Roles Available`);
  lines.push(``);
  lines.push(`- \`researcher\` — Can search the web, read pages, analyze data. Use for Phase 1 sourcing.`);
  lines.push(`- \`architect\` — Can synthesize, design, make strategic decisions. Use for Phase 2 pitches and Phase 3 committee.`);
  lines.push(`- \`builder\` — Can build bespoke UIs and write structured documents. Use for Phase 4 deliverables.`);
  lines.push(`- \`reviewer\` — Can evaluate and validate. Available if needed.`);
  lines.push(`- \`coder\` — Can write code. Available if needed.`);
  lines.push(``);

  // Output format
  lines.push(`## Output Format`);
  lines.push(``);
  lines.push(`Write a JSON plan to: ${planFilePath}`);
  lines.push(``);
  lines.push(`The JSON must have this exact structure:`);
  lines.push(`\`\`\`json`);
  lines.push(`{`);
  lines.push(`  "orchestrationId": "${orchestrationId}",`);
  lines.push(`  "goal": "AI VC Discovery: ${focus}",`);
  lines.push(`  "tasks": [`);
  lines.push(`    {`);
  lines.push(`      "taskId": "sourcing-demand-signals",`);
  lines.push(`      "title": "Deal Sourcing: Demand Signals — Daniel Okafor",`);
  lines.push(`      "description": "FULL agent instructions...",`);
  lines.push(`      "agentRole": "researcher",`);
  lines.push(`      "dependsOn": [],`);
  lines.push(`      "outputType": "research"`);
  lines.push(`    },`);
  lines.push(`    ...more tasks`);
  lines.push(`  ]`);
  lines.push(`}`);
  lines.push(`\`\`\``);
  lines.push(``);

  // Rules
  lines.push(`## Critical Rules`);
  lines.push(``);
  lines.push(`1. Phase 1 (sourcing): 3 parallel tasks, NO dependencies`);
  lines.push(`2. Phase 2 (pitches): 3 parallel tasks, each depends on ALL 3 Phase 1 tasks (so each partner reads everyone's research)`);
  lines.push(`3. Phase 3 (committee): 1 task, depends on ALL 3 Phase 2 tasks`);
  lines.push(`4. Phase 4 (deliverables): 1 task, depends on Phase 3`);
  lines.push(`5. Task descriptions must be COMPLETE and SELF-CONTAINED — agents only see their own task description`);
  lines.push(`6. Every task must end with a <!-- STRUCTURED_SUMMARY {JSON} --> block`);
  lines.push(`7. Phase 4 builder MUST write dashboard to exactly \`.orchestration-ui.jsx\` AND memo to \`investment-memo.md\``);
  lines.push(`8. Research tasks must include SPECIFIC web search queries — don't be vague`);
  lines.push(`9. All monetary figures in USD`);
  lines.push(`10. Recommendations must be ACTIONABLE — specific enough that we can immediately create an Enso project and start building`);
  lines.push(`11. The committee challenge (Phase 3) must be GENUINELY RIGOROUS — not rubber-stamping. Kill weak ideas. Challenge assumptions. Be skeptical.`);
  lines.push(`12. Every recommendation must answer: "Why would someone choose this over [named competitor X]?" with a specific answer, not hand-waving`);

  return lines.join("\n");
}
