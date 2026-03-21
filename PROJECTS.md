# Enso Projects — AI Team Management & Autonomous Evolution

## Vision

Enso is an **AI sandbox that generates complete solutions** — it can import, manage, and continuously evolve any software project through autonomous AI teams. Each project gets its own tailored team, customer personas, and evolution loop. Enso itself is just one project managed by this same system.

The key insight: **Enso doesn't just manage projects it creates — it manages any existing project you point it at.** A Python ML system, a React SaaS app, a Rust library, a mobile game — Enso scans the codebase, understands the domain, assembles the right team, and starts evolving.

## How It Works

### 0. Discover Opportunities (`/discover`)

Before importing or creating a project, Enso can help you **find what's worth building**. The `/discover` command launches an AI VC investment process:

**The VC Team:**

| Member | Role | Sourcing Lens |
|--------|------|--------------|
| Catherine Zhou | Managing Partner & IC Chair | Chairs the challenge session, final go/no-go |
| Daniel Okafor | Investment Partner | **Demand signals** — user pain, complaints, "I wish X existed" |
| Dr. Priya Sharma | Investment Partner | **Technology timing** — what's newly feasible with 2025-2026 AI |
| Marcus Webb | Investment Partner | **Competitive gaps** — where incumbents are vulnerable |
| Elena Vasquez | Head of Investment Intelligence | Produces final deliverables |

**The Process (5 phases, ~30 min, ~$8-12 in tokens):**

| Phase | Tasks | What Happens |
|-------|:-----:|-------------|
| **1. Deal Sourcing** | 3 parallel | Each partner explores the focus area through their unique lens. Same ocean, different nets — ensures diverse discovery. Each sources 2-3 candidates with real market data. |
| **2. Pitch Session** | 3 parallel | Each partner reads ALL sourcing reports (not just their own), selects their single best opportunity, and writes a formal investment pitch with competitive analysis, revenue model, and build estimate. |
| **3. Investment Committee** | 1 | Managing Partner chairs rigorous challenge debate on all 3 pitches. Every recommendation is challenged on 4 dimensions: |
| | | **Market timing** — Is the market growing? Tailwind or headwind? First 100 users? |
| | | **Enso competitive advantage** — Named competitors have funding and teams. Why would Enso win? Where does Enso's approach FAIL? |
| | | **Realistic feasibility** — Can Claude Code agents build this? Hard MVP scope? Integration dependencies? |
| | | **Cost of going in** — Token cost for MVP, monthly evolution cost, infrastructure, third-party APIs, break-even analysis |
| **4. Deliverables** | 1 | Interactive dashboard (`.orchestration-ui.jsx`) with per-recommendation deep dives, radar charts, comparison matrix. Plus investment memo (`investment-memo.md`) structured as a Goldman Sachs-style presentation deck. |

**Verdict per project: STRONG BUY / BUY / HOLD / PASS**

**Usage:**
- `/discover` — general discovery across all domains
- `/discover AI-powered developer tools` — focused on a specific area
- `/discover healthcare automation` — any focus area works

**After discovery:** Review the recommendations in the interactive dashboard. For approved projects, import them via the Projects card — Enso creates the project, generates a domain-specific AI team, and starts the first evolution sprint.

### 1. Import a Project

Point Enso at any existing codebase. It scans the project structure, detects languages, frameworks, and domain, then auto-generates a tailored AI team and customer personas.

**From the UI:**
1. Open Enso → click **Projects** tile
2. Click **"+ Import Project"**
3. Enter project name and codebase path (required)
4. Optionally add: description, vision, test URL (web apps), test command (CLI apps)
5. Click **"Import & Generate AI Team"**

**What happens behind the scenes:**
1. **Codebase scan** — reads README, package.json/requirements.txt, project structure, detects languages and frameworks
2. **Team generation** — Gemini analyzes the project and generates domain-specific team agents and personas
3. **Project creation** — saves to `~/.enso/projects/<projectId>/` with full team definition

**From the API:**
```
POST /api/projects/create-with-team
{
  "projectId": "alpharank",
  "projectName": "AlphaRank",
  "description": "Quantitative stock prediction system...",
  "codebasePath": "D:/Github/AlphaRank",
  "testCommand": "python -m pytest test/"
}
```

**Preview without saving:**
```
POST /api/projects/generate-team
{ same fields → returns teamAgents + personas without creating project }
```

### 2. Review the Generated Team

Each imported project gets a team tailored to its domain:

**Example: AlphaRank (Python ML trading system)**

| Agent | Role | Why |
|-------|------|-----|
| Dr. Evelyn Reed | Head of Quant Research (Project Leader) | Domain-specific PL title |
| Alex Chen | Lead Software Architect | Data pipelines + trading architecture |
| Marcus Bell | Lead Software Engineer (Eng Manager) | Code quality across Python + TypeScript |
| Sarah Davies | Senior QA Engineer | Testing trading strategies + Electron app |
| **Dr. Kenji Tanaka** | **ML Scientist** | Ensemble model research — domain specialist |
| **Isabella Rossi** | **Quant Trading Strategist** | Trading strategy design — domain specialist |
| **David Lee** | **DevOps & Data Engineer** | Data pipelines + ML ops — domain specialist |

Personas: Independent Quant Investor, Passive Portfolio Manager, Quant Analyst at a Hedge Fund — each with concrete test scenarios specific to a trading platform.

Compare this to the generic Enso team (Project Leader, Marketing Director, Sales Director, Architect, Eng Manager, QA, AI Strategist). **The team composition adapts to the project.**

### 3. Evolve the Project

Once a project is imported with its team, run an evolution sprint:

1. Open **Projects** → select the project → click **"Evolve [ProjectName]"**
2. Or type `/evolve` in chat (uses the active project)

The evolution sprint runs the full 7-phase cycle with the project's own team and personas:

| Phase | What Happens |
|-------|-------------|
| **0. PL Meta-Evaluation** | Project Leader reviews prior sprints, sets priorities, selects personas |
| **1. Persona Testing** | Customer personas test the product (Puppeteer for web, CLI for non-web) |
| **2. PL Triage** | PL reviews persona findings, selects which team agents to involve |
| **3. Team Evaluation** | Core agents always run; domain specialists by PL's choice |
| **4. Synthesis + Design** | Cross-report analysis → prioritized backlog → technical specs |
| **5. Implementation** | Parallel code changes in the project's OWN codebase + review |
| **6. Validation** | Re-testing + interactive dashboard + PL meta-review |

**The sprint operates on the project's codebase** — not Enso's. Claude Code sessions receive the project's `codebasePath`, so all code changes happen in the right repository.

### 4. Iterate

Each sprint:
- Accumulates team knowledge via `painPoints` on each agent
- Produces before/after metrics from persona retesting
- Archives full reports to `~/.enso/projects/<projectId>/sprints/`
- PL can adjust team composition, add/remove personas, shift priorities

Over time, the AI team becomes increasingly effective at evolving that specific project.

## Core Concepts

### Project

A project is any independent software product with its own codebase:

```
Project = {
  id: "alpharank"
  name: "AlphaRank"
  description: "Quantitative stock prediction system..."
  vision: "AI-powered stock ranking..."
  codebasePath: "D:/Github/AlphaRank"     # Any local git repo
  techStack: "Python/scikit-learn/LightGBM/Electron/React"
  testUrl: "http://localhost:3000"          # For web apps (Puppeteer testing)
  testCommand: "python -m pytest test/"    # For CLI/API testing
  teamAgents: [...]                        # Auto-generated or manual
  personas: [...]                          # Auto-generated or manual
  validationPersonaIds: [...]              # Subset of personas for retesting
}
```

Projects can be anything — the technology stack is defined by the project, not by Enso.

### AI Team Generation

When you import a project, Enso's team generator:

1. **Scans the codebase** — top-level structure, README, package.json, requirements.txt, entry points
2. **Detects domain signals** — ML frameworks → quant specialist, React + API → UX designer, Docker + CI → DevOps
3. **Composes a team** — 4 core roles (PL, Architect, Eng Manager, QA) + 1-3 domain specialists
4. **Generates personas** — 3-5 user archetypes specific to the product's audience

The team generator uses Gemini Flash for fast structured output (~10-15 seconds).

**Core roles** (always present):

| Role | agentRole | Purpose |
|------|-----------|---------|
| Project Leader | architect | Meta-controller, sets vision, reviews all outputs |
| Software Architect | architect | Technical design, architecture reviews, tech debt |
| Engineering Manager | reviewer | Code quality, conventions, build validation |
| QA & Test Manager | reviewer | Test scenarios, edge cases, quality metrics |

**Domain specialists** (auto-selected based on project):

| Project Type | Specialist Examples |
|-------------|-------------------|
| ML/Data Science | ML Scientist, Data Engineer, ML Ops |
| Trading/Finance | Quant Strategist, Risk Officer |
| SaaS/Web App | UX/Product Designer, DevOps |
| Mobile App | Mobile UX Designer, Performance Engineer |
| Data Pipeline | Data Engineer, Reliability Engineer |

### Customer Personas

Personas represent real user archetypes who test the product during evolution sprints. Each persona has:
- **Background** — who they are, what they know
- **Goals** — what they want to accomplish with the product
- **Frustrations** — what bothers them about current alternatives
- **Test scenarios** — 3-5 concrete things they'll try (specific enough for automation)

The Project Leader selects which personas to involve per sprint based on the sprint focus.

### Active Project

Enso tracks which project is "active" (stored in localStorage). The active project is used for:
- `/evolve` command — runs evolution sprint on the active project
- `/evolution-history` — shows sprint history for the active project

Switch active project from the Projects card or by clicking "Set Active".

## Storage

```
~/.enso/projects/
├── enso/                               # Default Enso project
│   ├── project.json                    # Vision, team, personas
│   ├── sprints/
│   │   └── sprint-<timestamp>/         # Full sprint archive
│   └── deliverables/
├── alpharank/                          # Imported project
│   ├── project.json
│   ├── sprints/
│   └── deliverables/
└── <any-project>/
```

## API Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/projects` | GET | List all projects |
| `/api/projects/:id` | GET | Load single project |
| `/api/projects` | POST | Create project (manual team) |
| `/api/projects/:id` | PUT | Update project |
| `/api/projects/:id` | DELETE | Delete project (except "enso") |
| `/api/projects/generate-team` | POST | Preview auto-generated team |
| `/api/projects/create-with-team` | POST | Create project with auto-generated team |

## The Default Enso Project

Enso is pre-configured as the default project with its own team:

**Team:** James Rodriguez (PL), Victoria Park (Marketing), Marcus Thompson (Sales), Elena Vasquez (Architect), David Park (Eng Manager), Aisha Rahman (QA), Dr. Riya Nakamura (AI Strategist)

**Personas:** Alex Chen (Startup Founder), Maya Patel (Student Researcher), Jordan Kim (Developer), Sarah Thompson (Business Analyst), Leo Morales (Creative Professional)

**Config:** `codebasePath: D:/Github/Enso`, `testUrl: http://localhost:5173`

## Safety Rules

During evolution sprints, engineering agents MUST NOT:
- Restart, stop, or kill the gateway/server process
- Modify package.json version fields or lock files
- Run npm install/update
- Push to git (changes are local only)
- Changes take effect on next server restart AFTER the sprint

## Implementation

| Component | File | Purpose |
|-----------|------|---------|
| Discovery Engine | `server/src/discovery.ts` | AI VC team, sourcing/pitch/challenge planning prompt |
| Team Generator | `server/src/team-generator.ts` | Codebase scanning + AI team/persona generation |
| Project Manager | `server/src/project-manager.ts` | Project CRUD, storage, default Enso project |
| Evolution Engine | `server/src/evolution.ts` | Sprint planning, lifecycle, project-scoped sprints |
| Orchestrator | `server/src/orchestrator.ts` + `orchestrator-engine.ts` | DAG-based multi-agent execution |
| Server API | `server/src/server.ts` | REST endpoints for projects + team generation + discovery |
| Projects UI | `src/cards/ProjectsCard.tsx` | List, detail, import views |
| Welcome Card | `src/components/WelcomeCard.tsx` | Discover + Projects tiles |
| Evolution History | `src/cards/EvolutionHistoryCard.tsx` | Sprint history browser |
| Sprint Archive | `server/src/evolution-archive.ts` | Sprint persistence + retrieval |
