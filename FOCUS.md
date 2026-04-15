# Focus Areas — AI-Inferred Goals

> The bridge between understanding the user (Cortex) and taking action (Evolve). Enso infers what the user cares about from their Cortex data, opens dedicated decision-mode conversations with expert teams, and drives each focus through the Evaluate → Discuss → Evolve cycle until concrete deliverables land.

## Why Focus Areas Exist

Cortex tells us *who the user is* and *what they care about*. Orchestration sprints tell us *what to build*. Focus Areas is the layer in between — it converts accumulated knowledge into named, outcome-oriented goals that persist across sessions and that the Team Leader can autonomously drive forward.

A focus area is **not** a category label ("Quantitative Finance") — it's a concrete outcome ("Develop AlphaRank into a Market-Beating Quant Tool"). Goals compound: each sprint's deliverables feed back into Cortex, which refines the focus, which shapes the next sprint.

## Three-Phase Lifecycle

```
  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
  │   1. INFER   │ ───▶ │  2. REFINE   │ ───▶ │  3. EXECUTE  │
  │              │      │              │      │              │
  │ Scan Cortex  │      │ Decision-mode│      │  /evolve     │
  │ → 4-7 goals  │      │ conversation │      │  orchestration│
  │ with evidence│      │ with experts │      │  sprint      │
  └──────────────┘      └──────┬───────┘      └──────┬───────┘
                               │                     │
                               ▼                     ▼
                        clarity upgrade       SprintResultsSummary
                        (emerging → clear)    + Cortex entities
                               │                     │
                               └─────────┬───────────┘
                                         │
                                         ▼
                               ┌───────────────────┐
                               │ Next iteration —  │
                               │ sprint results    │
                               │ feed next Refine  │
                               └───────────────────┘
```

### 1. Infer (`inferFocusAreas()`)

Analyzes the full Cortex data inventory to produce 4-7 focus areas. Each area includes:
- **Title** — outcome-oriented, specific ("Develop AlphaRank into a Market-Beating Quant Tool", not "Quantitative Finance")
- **Intent** — what the user wants to accomplish
- **Deeper motivation** — the personal WHY behind the intent
- **Evidence** — specific Cortex entities (books, projects, videos) that signal this interest
- **Adjacent pursuits** — related but not yet promoted goals

Triggered by `POST /api/focus-areas/infer` or the Tasks tab. Re-runnable at any time via `POST /api/focus-areas/reassess` when Cortex has materially changed.

### 2. Refine (decision-mode dialogue)

Each focus area has a **dedicated conversation** with distinct behavior from chat — it's not an open-ended Q&A, it's a decision-making session with an expert team.

**Decision-mode** means the AI arrives with a specific recommendation, not an open-ended question. For every user turn, the agent:
1. Presents 2-3 options with tradeoffs
2. States its pick with reasoning
3. Invites challenge

**Context adapts to the decision point**:

| State | Agent's behavior |
|-------|-----------------|
| No evaluation yet | Recommends running an evaluation; explains what will be studied |
| Evaluation complete | Presents action options with tradeoffs; recommends which to pursue |
| Sprint results available | Leads with impact metrics; highlights the most useful deliverable; proposes next cycle |
| Stalled (no activity) | Diagnoses the gap; proposes a restart |

After each user exchange, `refineFocusFromConversation()` detects goals, deadlines, or motivations and progressively upgrades clarity:

**`emerging → developing → clear`**

Clarity is a first-class field on the focus area — the UI shows it, and the TL uses it as a signal for which focuses need attention.

### 3. Execute (`/evolve` orchestration)

The full conversation context — briefing, discussion transcript, sprint history — feeds into an orchestration sprint. See [PROJECTS.md](PROJECTS.md) for the full 7-phase sprint pipeline.

On completion, the sprint emits a structured `SprintResultsSummary` mapping each deliverable to a pain point with a quick-start action:

```typescript
{
  deliverables: [
    {
      title: "Alpha Engine v2 spec",
      painPoint: "Current ranking model overweights recency",
      howItHelps: "Introduces 5-factor model with regime detection",
      quickStart: { action: "review_doc", target: "synthesis/article-alpha-engine-v2.md" },
      entityType: "article",
    },
    // ...
  ]
}
```

`lastSprintSummary` is stored on the focus area. The Cortex tab surfaces these as **activation cards** with entity-type badges, pain-point context, how-it-helps, and colored Run/Read/Explore/Review buttons.

`backfillSprintSummaries()` retroactively generates these for pre-existing sprints that didn't emit structured summaries.

## Sprint Completion & Proactive Delivery

Sprint completion emits a `sprint.completed` event via the Conversation Context Registry (see below). Two things happen in parallel:

1. **Proactive in-app message** — a card appears in the focus conversation without the user prompting ("Your sprint just finished. Here's what landed…")
2. **Multi-channel delivery** — `deliverSprintResults()` sends email + WeChat notifications, each with react buttons for immediate feedback

The workflow state resets on completion: `preparedBriefing` and `conversationId` are cleared, `lastSprintResults` is stored for the next Refine cycle.

## Typed Focus Areas

Each focus has a `focusType` that determines its capabilities. Auto-detected from semantic tags + project registry matching via `detectFocusTypes()`.

| Type | What It Enables | Example |
|------|-----------------|---------|
| **`project`** | Has `codebasePath`, linked `projectId`, codebase analysis, team agents, evolution sprints | "Ship AlphaRank v2" |
| **`creative`** | Research, technique frameworks, production guides | "Improve as a landscape photographer" |
| **`learning`** | Study plans, skill tracking, subject expertise | "Learn Korean to fluency" |
| **`lifestyle`** | Habits, optimization, recommendations | "Build a focus-friendly gaming setup" |
| **`general`** | Fallback — any outcome that doesn't fit the above | "Find a co-founder" |

Project-type focuses subsume what was previously a separate Projects tab — they carry all project capabilities (codebase analysis, team agents, evolution sprints) plus the Focus lifecycle benefits.

## Expert Teams

Every focus area gets **2-4 domain-specific AI advisors**. Not generic assistants — they're named personas with opinions, tailored to the focus type and goal.

### Generation

`generateFocusExperts()` in `team-generator.ts` — the LLM reads the focus title, intent, deeper motivation, and type, then produces experts with:
- Name + role
- Responsibilities + goals
- **Perspective** — their opinions, biases, methodology
- `agentRole` (architect / reviewer / researcher — maps to orchestration roles)

**Example — Photography focus:**
- **Isabella Rossellini** (Curator) — opinionated about which shots deserve the print wall
- **Kenji Tanaka** (Composition Master) — thinks in terms of Japanese formal grammar
- **Chloe Dubois** (Album Designer) — focused on narrative sequencing

Each expert becomes a Cortex wiki page at `~/.enso/wiki/focuses/<focusId>/expert-<slug>.md`, searchable across focuses.

### Expert Conversations

Each expert has a dedicated conversation via `ExpertContextProvider`:

> "You ARE [name]. Respond in character, using your perspective. You know the other experts on this focus team — you can reference their likely views but you're the one speaking."

Expert conversations appear under an "EXPERTS" group in the sidebar with **amber** styling, distinct from focus conversations (violet) and regular chats.

### TL-Managed Experts

The Team Leader autonomously:
- **Staffs** new focuses (generates experts on creation)
- **Evaluates** expert health via `GET /api/focus-areas/:id/expert-health` — are they adding value? are conversations active?
- **Restructures** teams — replaces underperforming experts, adds missing roles
- **Uses them in sprints** — expert personas become `teamAgents` in the orchestration context, so their perspective shows up in sprint reports

## Conversation Context Registry

The general-purpose framework that powers decision-mode conversations, proactive messages, and event-driven triggers. Focus areas are the primary consumer.

Module: `server/src/conversation-context.ts`. Exports a singleton `contextRegistry`. Features register as `ConversationContextProvider` implementations.

### Three Capabilities

1. **Context injection** — `getContextForPrompt()` injects rich context into the agent's system prompt so it knows what the conversation is about (which focus, current decision point, last sprint results)
2. **Proactive messages** — `getProactiveMessages()` checks every 60s for state changes (focus going quiet, new related Cortex content, sprint completing) and delivers unsolicited messages via `persistCard()` + WebSocket push
3. **Event-driven triggers** — `onEvent()` handles external events (`cortex.entity.created`, `research.completed`, `focus.refined`, `sprint.completed`)

Proactive loop lives in `server.ts`. Dedup with 1h TTL prevents message spam.

### Current Consumer

`FocusContextProvider` (in `focus-context-provider.ts`) handles:
- Sprint completion notifications
- Decision-mode context injection (adapts to evaluation/results state)
- Quiet-focus detection (proactive "this focus has been quiet, should we check in?" messages)
- New-content alerts (proactive "new Cortex entity related to this focus" messages)
- Expert persona injection for `ExpertContextProvider`

**Future consumers**: project conversations, data source monitoring threads.

### Sidebar Visual Grouping

Conversations with context metadata are grouped by type in `ConversationSidebar.tsx`:

| Group | Color | Source |
|-------|-------|--------|
| **FOCUS AREAS** | violet | Focus conversations |
| **EXPERTS** | amber | Expert conversations (scoped per focus) |
| **PROJECTS** | emerald | Project conversations (future) |
| **CHATS** | default | Unscoped regular chats |

Context stored as `ConversationContext` on `ConversationSummary`.

## UI — The Focus Tab

Focus tab (`FocusView.tsx`) has two modes:

**List view** — all focus areas with title, type badge, clarity indicator, last activity, and quick-action buttons.

**Detail view** — four tabs per focus:

| Tab | What |
|-----|------|
| **Work** | The iterative cycle — Evaluate button, Discuss conversation, Evolve sprint button |
| **Cortex** | Sprint deliverable activation cards + related Cortex knowledge for this focus |
| **Experts** | Expert cards with chat buttons + team health indicators |
| **Evolve** | Live sprint monitoring (when a sprint is running) + sprint history |

A separate Projects tab was removed — project-type focuses cover all project capabilities in the unified Work/Cortex/Experts/Evolve structure.

## TL Integration

The Team Leader is the primary driver of focus areas. It autonomously:
- **Analyzes state** via `analyzeFocusAreas()` — zero-LLM state machine that reads clarity, activity, sprint status, and decides next action
- **Generates progress pulses** via `generateProgressPulse()` — LLM distillation of recent activity into a morning-briefing segment
- **Delivers results** via `deliverSprintResults()` — multi-channel push on sprint completion
- **Staffs teams** — spawns experts on new focuses, evaluates team health, restructures weak teams
- **Launches sprints** — when the workflow state + clarity + user intent converge, can launch `/evolve` without prompting (subject to TL autonomy config)

See [TEAM-LEADER.md](TEAM-LEADER.md) for how these utilities plug into the morning routine signal → assess → execute → brief pipeline.

## Architecture Summary

| Module | Responsibility |
|--------|----------------|
| `focus-areas.ts` | Engine — inference, CRUD, refinement, backfill, type definitions |
| `focus-agent.ts` | Utilities called by TL — `analyzeFocusAreas()`, `generateProgressPulse()`, `deliverSprintResults()`, `createFocusAgentTools()` |
| `focus-context-provider.ts` | Decision-mode context injection + expert persona provider |
| `team-generator.ts` | `generateFocusExperts()` — LLM generates per-focus experts |
| `conversation-context.ts` | Context registry — injection, proactive loop, event routing |
| `FocusView.tsx` | Focus tab UI (list + detail with 4 tabs) |
| `ConversationSidebar.tsx` | Sidebar grouping by context type |

Focus areas are **Cortex-native**:
- Goal pages at `~/.enso/wiki/focuses/<goal-slug>.md`
- Expert pages at `~/.enso/wiki/focuses/<focusId>/expert-<slug>.md`

This means everything about a focus — goal, experts, sprint history, cross-references to Cortex entities — participates in wiki search, cross-referencing, and the 3-tier related-items algorithm.

## REST API

| Method | Path | What |
|--------|------|------|
| GET | `/api/focus-areas` | List all focus areas |
| POST | `/api/focus-areas` | Create a focus area manually |
| PATCH | `/api/focus-areas/:id` | Update focus area fields |
| DELETE | `/api/focus-areas/:id` | Remove focus area |
| POST | `/api/focus-areas/infer` | Re-run inference over current Cortex state |
| POST | `/api/focus-areas/refresh` | Refresh lightweight fields without full re-infer |
| POST | `/api/focus-areas/reassess` | Full reassessment after material Cortex changes |
| POST | `/api/focus-areas/detect-types` | Auto-detect `focusType` for all focuses |
| POST | `/api/focus-areas/:id/prepare` | Run evaluation (background research + briefing) |
| GET | `/api/focus-areas/:id/transcript` | Retrieve conversation transcript |
| POST | `/api/focus-areas/:id/absorb-conversation` | Fold conversation state into focus fields |
| POST | `/api/focus-areas/sync-conversations` | Ensure focus conversations exist client-side |
| POST | `/api/focus-areas/:id/gaps` | Identify knowledge gaps for this focus |
| POST | `/api/focus-areas/:id/enrich` | Pull fresh Cortex connections |
| POST | `/api/focus-areas/:id/plan` | Launch evolution sprint planning |
| GET | `/api/focus-areas/:id/activity` | Recent activity timeline |
| POST | `/api/focus-areas/:id/generate-experts` | (Re)generate expert team |
| GET | `/api/focus-areas/:id/expert-health` | TL diagnostic for expert team |
| POST | `/api/focus-areas/backfill-summaries` | Retroactively generate `SprintResultsSummary` for old sprints |
| POST | `/api/focus-areas/pulse` | Generate progress pulse for all focuses (TL hook) |

## Related Docs

- **[CORTEX.md](CORTEX.md)** — the knowledge substrate focuses are built on
- **[TEAM-LEADER.md](TEAM-LEADER.md)** — how the TL drives focuses autonomously
- **[PROJECTS.md](PROJECTS.md)** — the evolution sprint pipeline focuses invoke via `/evolve`
