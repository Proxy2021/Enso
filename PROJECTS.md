# Enso Projects — AI-Native Project Incubator & Evolution System

## Vision

Enso is a **universal AI project incubator** — it can build, manage, and continuously evolve any software project through autonomous AI teams. Each project has its own git repository, technology stack, AI team, customer personas, and evolution loop. Enso itself is just one project that uses this same system for self-evolution.

## Core Concepts

### Project

A project is any independent software product with its own codebase and identity:

```
Project = {
  id: "enso" | "acme-saas" | "mobile-game" | ...
  name: "Enso"
  description: "Claude Code-powered AI agent platform"
  vision: "Every answer is an app. Full engineering team for any task."
  codebasePath: "D:/Github/Enso"          # Independent git repo
  techStack: "TypeScript/React/Node.js"    # Any stack
  testUrl: "http://localhost:5173"          # For Puppeteer testing (web apps)
  testCommand: "npm test"                  # For CLI/API testing
}
```

Projects can be anything — a React SaaS app, a Python CLI tool, a Rust library, a mobile game, a data pipeline. The technology stack is defined by the project, not by Enso.

### AI Team

Each project has a team of AI agents with distinct roles. The team composition is **customizable per project** — different projects need different expertise.

#### Team Agents (Leadership & Strategy)

These agents provide strategic direction and evaluation:

| Role | Responsibility | Authority |
|------|---------------|-----------|
| **Project Leader** | Meta-controller of the entire evolution system. Defines vision, sets goals for all agents, monitors evolution effectiveness, adjusts team composition and sprint structure as needed. | Can modify ALL aspects: team agents, personas, goals, evolution mechanism |
| **Marketing Director** | Evaluates positioning, messaging, competitive landscape. Proposes go-to-market improvements. | Advises on public-facing decisions |
| **Sales Director** | Evaluates commercialization, pricing, customer acquisition strategy. | Advises on revenue/growth decisions |

#### Customer Personas (User Testing)

These agents simulate real users testing the product:

| Persona | Perspective |
|---------|-------------|
| Startup Founder | Time-starved decision-maker needing fast, actionable insights |
| Student Researcher | Depth-focused academic needing comprehensive sourcing |
| Developer | Precision-focused engineer needing working code |
| Business Analyst | Data-focused professional needing visualizations |
| Creative Professional | Inspiration-focused creator needing campaign tools |
| AI Technology Strategist | Frontier-focused advisor evaluating against state-of-art |

Each project defines its own personas appropriate to its target users. A B2B SaaS project might have "Enterprise Admin", "End User", "IT Security Officer". A consumer app might have "Power User", "First-Time User", "Casual Browser".

### Collaborative Team Dynamics

Team agents are **not just evaluators** — they are **collaborative participants**:

1. **Goal Negotiation**: Each agent works out their responsibilities and goals with the Project Leader. Goals evolve each sprint based on what's working.

2. **Capability Gap Surfacing**: When any agent identifies a task they can't do because the tooling doesn't exist (e.g., "I need to analyze real user analytics but there's no integration"), they surface it as a pain point. The engineering team can then prioritize building those capabilities.

3. **Compound Evolution Loop**: Both the product AND the team's tooling improve together. The Marketing Director might need social media posting → engineering builds the integration → next sprint, Marketing can actually execute campaigns.

## Evolution Sprint (Closed Loop)

The evolution sprint is the core mechanism by which projects improve themselves. Each sprint has 6 phases:

### Phase 0: Meta-Evaluation (Project Leader)
- Reviews previous sprint results and current project state
- Can MODIFY project.json: add/change personas, adjust goals, update vision, restructure team
- Sets priorities for this sprint
- Evaluates whether the evolution mechanism itself is effective

### Phase 1: Persona Testing (Customer Personas)
- Each customer persona tests the product through real interaction (Puppeteer for web, CLI for tools)
- Tests 3-5 scenarios from their unique perspective
- Writes detailed report: scenarios tried, ratings (1-10), friction points, enhancement suggestions

### Phase 2: Team Evaluation (Leadership Agents)
- Marketing Director evaluates positioning, messaging, first impressions
- Sales Director evaluates commercialization, pricing, customer objections
- AI Strategist (if applicable) evaluates against frontier technology

### Phase 3: Synthesis + Discussion
- Architect synthesizes ALL reports (personas + team agents)
- Simulates product team roundtable — each voice debates priorities
- Produces ranked list of 3-5 enhancements to implement THIS sprint
- Identifies capability gaps surfaced by team agents

### Phase 4: Engineering Implementation
- Architect designs concrete technical solutions
- Coder implements changes in the project's OWN codebase (not Enso's)
- Reviewer validates: code review, build check, regression testing
- Be AGGRESSIVE — Claude Code implements 10x faster than human teams

### Phase 5: Validation Re-Testing
- 2 customer personas re-test the changed areas
- Focus on code quality review + Puppeteer testing of existing behavior
- Compare before/after scores
- Remaining friction points become backlog for next sprint

### Phase 6: Evolution Report + Meta-Review
- Builder creates interactive dashboard with sprint results
- Project Leader does final meta-review:
  - Was this sprint effective?
  - What should change for next iteration?
  - Any team composition adjustments needed?
  - Writes changes back to project.json

## Storage

```
~/.enso/projects/
├── enso/
│   ├── project.json              # Project definition + team + personas
│   └── sprints/
│       ├── sprint-<timestamp>/
│       │   ├── meta.json         # Sprint metadata
│       │   ├── personas/         # Customer persona reports
│       │   ├── team/             # Team agent evaluations
│       │   ├── synthesis.md
│       │   ├── discussion.md
│       │   ├── design.md
│       │   ├── implementation.md
│       │   ├── review.md
│       │   ├── validation/
│       │   └── dashboard-ui.jsx
│       └── sprint-<timestamp>/
├── acme-saas/
│   ├── project.json
│   └── sprints/
```

## The Enso Project (Default)

Enso is pre-configured as the default project with:

**Team Agents:**
- **James Rodriguez** — Project Leader: Defines Enso's vision, manages the AI team, monitors evolution effectiveness
- **Victoria Park** — Marketing Director: Evaluates how Enso should be positioned and presented to the world
- **Marcus Thompson** — Sales Director: Evaluates how to commercialize and popularize Enso

**Customer Personas:**
- Alex Chen (Startup Founder)
- Maya Patel (Graduate Student)
- Jordan Kim (Senior Developer)
- Sarah Thompson (Business Analyst)
- Leo Morales (Creative Professional)
- Dr. Riya Nakamura (AI Technology Strategist)

**Config:**
- codebasePath: D:/Github/Enso
- techStack: TypeScript/React 19/Node.js/Vite
- testUrl: http://localhost:5173

## Deliverables

Team agents don't just evaluate — they produce **real deliverables** that the project can use:

### Deliverable Types

| Agent | Deliverable Examples |
|-------|---------------------|
| **Project Leader** | Product roadmap, sprint priorities doc, team performance review, vision statement |
| **Marketing Director** | Landing page copy, feature announcement drafts, competitive positioning doc, brand guidelines, social media content calendar, press release templates |
| **Sales Director** | Pricing strategy doc, customer pitch deck outline, ROI calculator inputs, objection handling guide, partnership proposal templates, case study drafts |
| **AI Strategist** | Technology adoption roadmap, architecture improvement proposals, competitive analysis matrix |
| **Engineers** | Code changes, test suites, documentation, API specs |

### Storage

Deliverables are stored per-project, organized by agent and sprint:

```
~/.enso/projects/<projectId>/
├── deliverables/
│   ├── marketing/
│   │   ├── landing-page-copy-v1.md
│   │   ├── feature-announcement-2026-03.md
│   │   ├── social-media-calendar-q2.md
│   │   └── competitive-positioning.md
│   ├── sales/
│   │   ├── pricing-strategy-v2.md
│   │   ├── enterprise-pitch-outline.md
│   │   └── roi-calculator-inputs.json
│   ├── leadership/
│   │   ├── product-roadmap-q2.md
│   │   ├── sprint-3-retrospective.md
│   │   └── vision-statement-v3.md
│   └── engineering/
│       ├── api-spec-v2.md
│       └── architecture-decision-records/
├── project.json
└── sprints/
```

### Deliverable Lifecycle

1. **Creation**: Team agents create deliverables during evolution sprints (or on-demand via orchestration)
2. **Review**: Project Leader reviews and approves deliverables
3. **Iteration**: Deliverables evolve across sprints — v1 → v2 → v3 as the product matures
4. **Access**: Browsable from the Enso UI via the Projects card — view, download, share

### In Evolution Sprints

During a sprint, team agents are instructed to produce deliverables alongside their evaluation:
- Marketing Director: "In addition to your evaluation, draft a feature announcement for the enhancements implemented this sprint"
- Sales Director: "Update the pricing strategy doc if the new features change the value proposition"
- Project Leader: "Update the product roadmap based on this sprint's outcomes"

Deliverables accumulate across sprints, creating a growing body of project assets that compound in value.

## Safety Rules

During evolution sprints, engineering agents MUST NOT:
- Restart, stop, or kill the gateway/server process
- Run restart scripts (restart.ps1, restart.sh)
- Kill node processes (Stop-Process, taskkill)
- Modify package.json version fields or lock files
- Run npm install/update
- Push to git (changes are local only)
- Changes take effect on next server restart AFTER the sprint

## Future Evolution

As we learn more through evolution cycles, this document will be updated with:
- New patterns discovered for effective team composition
- Better sprint structures for different project types
- Lessons learned from cross-project evolution
- New agent roles that prove valuable
- Integration patterns for real-world tools (APIs, databases, monitoring)
