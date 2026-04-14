# Team Leader — The Living Organization

> How Enso runs itself as an autonomous AI organization.

## Overview

Enso operates as a **living AI organization** where agents communicate through events. The Team Leader (TL) is the COO — the agent with the biggest responsibility and heaviest task load. Domain experts advise within their focus areas. All agents process events and can issue new events to each other, creating a continuously operating organization.

**The TL's north star:** "Make this user's life better, every single day."

**The user's role:** CEO. Approve at gates, provide creative direction, chat with experts. Everything else — the organization handles.

## Agent Event Bus

All work in Enso flows through a unified event system: `processEvent(event)`.

```
Event → Target Agent → LLM decides action → Execute + optionally emit new events to other agents
```

Any agent (TL or expert) can receive events and respond by: handling directly, launching a Claude Code session, starting an orchestration, or creating new events for other agents. The morning schedule is simply one event source — it fires `schedule.daily` and the TL processes it like any other event.

### Event Types

| Event | Target | What Happens |
|-------|--------|-------------|
| `schedule.daily` | TL | Full scan: gather signals, assess, execute, staff experts, deliver briefing |
| `schedule.checkin` | TL | Quick urgent scan, alert if needed |
| `focus.evaluation.done` | TL | Assess understanding, launch sprint immediately |
| `focus.sprint.done` | TL + Experts | TL: assess progress, review results. Experts: review deliverables in their domain |
| `remark.received` | TL or Expert | LLM reviews remark, decides: act / delegate / acknowledge / escalate |
| `task.completed` | TL | Code change detection, restart handling |
| `agent.escalate` | TL | Expert escalates something beyond their scope |
| `agent.request` | Any agent | One agent asks another to look into something |

## The Organization

```
                    ┌─────────────┐
                    │     USER    │  CEO — provides direction, makes
                    │             │  personal decisions, acts on deliverables
                    └──────┬──────┘
                           │ only when needed
                    ┌──────▼──────┐
                    │ TEAM LEADER │  COO — runs everything autonomously
                    │             │  on a daily schedule
                    └──────┬──────┘
                           │ manages
            ┌──────────────┼──────────────┐
            │              │              │
     ┌──────▼──────┐ ┌────▼────┐ ┌───────▼───────┐
     │   EXPERT    │ │  EXPERT │ │    EXPERT      │
     │   TEAMS     │ │  TEAMS  │ │    TEAMS       │
     │ (per focus) │ │         │ │                │
     └─────────────┘ └─────────┘ └────────────────┘
      AlphaRank:       Photography:   Media Library:
      - Quant Strat.   - Curator      - Info Architect
      - Risk Mgr.      - Composer     - Visual Storyteller
      - Data Eng.      - Designer     - Data Engineer
      - Architect
```

## Daily Routine

The TL runs on a configurable schedule (default: full routine at 9am, check-ins every 6 hours).

### Morning Routine Pipeline

```
1. GATHER SIGNALS (zero LLM cost)
   ├── Action log errors (last 30)
   ├── Focus area state (all active areas + expert metrics)
   ├── Cortex health (page count, entity count, recent updates)
   ├── Scheduled task results (last 24h)
   ├── Pending user remarks (feedback from previous notifications)
   └── Self-queued tasks (follow-ups from previous cycles)

2. ASSESS & PRIORITIZE (single LLM call)
   ├── Sees ALL signals in one context
   ├── Produces 3-7 prioritized actions
   ├── Each action has: priority, type, delegation, autoExecute flag
   └── Decides what needs user vs what TL handles

3. EXECUTE (parallel, autonomous)
   ├── Focus actions: evaluate, sprint, review results, staff experts
   ├── Knowledge actions: Cortex enrichment, cross-referencing
   ├── Builder actions: Claude Code sessions for bug fixes, features
   ├── Research actions: web research, deep dives
   └── All tracked as BackgroundTasks with completion monitoring

4. BRIEF THE USER (multi-channel)
   ├── In-app: chat card with summary
   ├── Email: HTML briefing with action buttons
   ├── WeChat: compact push notification
   └── "Needs Your Input" card for user-action items only

5. MONITOR COMPLETION
   ├── Track all background tasks (running → completed/failed)
   ├── When ALL tasks done → deliver completion summary
   ├── Check for code changes → auto-rebuild → auto-restart
   └── Process user remarks from previous notifications
```

### Check-In (lightweight, every 6h)

Quick scan for urgent items only: recent errors, unreviewed sprint results, failed tasks. Sends alert via email if anything needs attention. No LLM cost if everything is clear.

### Event-Driven Processing (continuous)

The TL doesn't wait for scheduled routines to push focus areas forward. Lifecycle events trigger immediate action:

- **Evaluation completes** → TL assesses understanding via LLM → immediately queues a sprint
- **Sprint completes** → TL assesses holistic progress toward the goal → reviews results → queues next evaluation cycle (or surfaces tasks to user)

This means focus evolution runs continuously throughout the day. The morning routine handles everything else (platform bugs, staffing, Cortex health), but focus lifecycle is event-driven.

## Focus Evolution Cycle

The TL drives the full evolution cycle for every focus area **autonomously** and **event-driven**. The user is NOT a bottleneck at any step.

```
┌─────────────────────────────────────────────────┐
│              TL DRIVES THIS LOOP                │
│                                                 │
│  ┌──────────┐     ┌──────────┐    ┌──────────┐ │
│  │ EVALUATE │────▶│  SPRINT  │───▶│  REVIEW  │ │
│  │          │     │          │    │          │ │
│  └──────────┘     └──────────┘    └────┬─────┘ │
│       ▲                                │       │
│       └────────────────────────────────┘       │
│              (auto-queue next cycle)            │
└───────────────────────┬─────────────────────────┘
                        │
                        ▼ only when genuinely needed
                 ┌──────────────┐
                 │  USER ACTS   │
                 │  - Read guide│
                 │  - Decide    │
                 │  - Apply IRL │
                 └──────────────┘
```

### How Each Step Works

**Evaluate** (`handleFocusEvaluate`)
- TL calls `POST /api/focus-areas/:id/prepare`
- Deep study: multiple AI agents research the topic, analyze Cortex data, produce comprehensive briefing
- If orchestrated (complex): runs asynchronously, TL queues sprint as follow-up
- If simple: briefing ready immediately, TL proceeds to sprint

**Sprint** (`handleFocusEvolve`)
- TL calls `launchFocusEvolve()` with the evaluation briefing
- Multi-agent orchestration: Project Leader designs task DAG, parallel agents execute
- Expert team context injected into the sprint (experts participate as team agents)
- Produces structured deliverables: articles, apps, frameworks, guides

**Review** (`handleFocusReviewResults`)
- TL uses LLM to assess whether user action is genuinely needed
- **User action needed** when deliverables require:
  - Personally READING something to form an opinion
  - Making a PERSONAL DECISION (which direction, what to prioritize)
  - APPLYING something in real life (use a tool, follow a guide on a trip)
- **User action NOT needed** when:
  - Deliverables are internal improvements (code, docs, architecture)
  - Results are incremental progress the TL can build upon
  - Next steps are things the TL or experts can handle
- If no user action needed → TL queues next evaluation cycle automatically

## Expert Team Management

The TL owns the org chart. Users interact with experts (chat, review their work). The TL manages experts (hire, fire, evaluate, restructure).

### Staffing

During morning routine, TL checks which focus areas lack expert teams and generates them:
- `generateFocusExperts()` creates 2-4 domain-specific experts per focus area
- Expert personas tailored to focus type: project gets architects/engineers, creative gets curators/designers
- Each expert gets: name, role, responsibilities, goals, perspective (with opinions), agentRole
- Experts persisted as Cortex wiki pages for cross-focus discoverability

### Evaluation

TL periodically reviews expert performance via LLM:
- Metrics tracked: conversation count, sprint participation, last active date
- LLM writes evaluation notes per expert (stored in `metrics.lastEvaluation`)
- Flags underperformers, stale experts, skill mismatches

### Restructuring

When focus direction shifts significantly:
- TL asks LLM: keep team / regenerate entirely / partial replace?
- Can remove experts who aren't contributing
- Can add new experts when focus evolves
- Can replace experts with updated personas

### Expert Chat

Users can chat directly with any expert via dedicated conversations:
- `ExpertContextProvider` injects persona: "You ARE [name]. Respond in first person as this expert."
- Expert has awareness of focus context, other team members, related Cortex knowledge
- Activity tracked: each message increments conversation count, updates lastActiveAt

## Focus Health Assessment

Every focus area tracks two LLM-assessed metrics, updated after each TL examination:

- **Understanding** (0-100%): How well the TL comprehends this goal — the user's intent, constraints, approach, and what success looks like. Jumps after evaluations, refines over cycles.
- **Progress** (0-100%): Holistic assessment of how far the user is toward completing this goal. NOT sprint-counting — based on actual goal intent vs what's been accomplished. Assessed by looking at all deliverables, user feedback, and remaining work.

Assessment triggers:
- **After evaluation**: Understanding reassessed via LLM (typically 35-55 after first evaluation)
- **After sprint**: Both understanding and progress reassessed holistically
- **Morning routine**: Visible in TL signals for prioritization decisions

Assessment is performed by `assessFocusUnderstanding()` and `assessFocusProgress()` — both use LLM with the full focus context and explicit honesty calibration in the prompt.

## Autonomy Policy

The TL's assessment prompt defines clear autonomy boundaries:

**TL auto-executes** (no user involvement):
- Fixing bugs and errors
- Enriching Cortex data
- Running focus evaluations
- Launching evolution sprints
- Reviewing sprint results (and deciding if user action is needed)
- Generating and evaluating expert teams
- Building features and improvements
- Resolving platform errors

**TL proposes** (surfaces to user):
- Actions requiring personal preference or creative direction
- Irreversible decisions the TL is unsure about
- Deliverables the user must personally read, decide on, or apply in real life

**Guiding principle:** "When in doubt, ACT. The user wants a proactive partner, not a cautious assistant."

## Background Task Management

When the TL launches Claude Code sessions or orchestrations:

1. Each task registered as `BackgroundTask` with status tracking
2. Action status in UI updates from ◉ (executing) to ✓ (completed) in real-time
3. When ALL tasks from a routine finish:
   - Delivers completion summary (in-app + email)
   - Checks for code changes via `git diff`
   - If code changed: verifies build → auto-commits → auto-pushes
   - If restart needed: exits with code 78 (guardian self-heal restarts the server)

### Auto-Restart Safety

The TL will only restart the server when:
- Build passes (npm run build succeeds)
- All background tasks are complete
- No active sessions in the registry
- Code changes have been committed and pushed

If the build fails, the TL logs the error and does NOT restart. Changes are left uncommitted for manual review.

## Remark System (Async Feedback Loop)

Every notification the TL sends includes action buttons for async feedback:

- **Email**: Approve / Defer / Reply buttons
- **WeChat**: User replies to messages, webhook captures as remarks
- **Web form**: `/r/<notificationId>` standalone page
- **In-app**: Direct remark submission via API

Remarks are gathered in `gatherSignals()` and incorporated into the next assessment. The TL sees what the user thought about previous actions and adjusts accordingly.

## Configuration

Stored at `~/.enso/data/team-leader-config.json`:

```json
{
  "schedule": {
    "morningRoutine": "0 9 * * *",
    "checkIn": "0 */6 * * *"
  },
  "channels": {
    "email": true,
    "wechat": true,
    "inApp": true
  },
  "autoEvolve": false
}
```

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/team-leader/config` | GET/PATCH | Read/update TL configuration |
| `/api/team-leader/morning` | POST | Trigger full morning routine |
| `/api/team-leader/checkin` | POST | Trigger quick check-in |
| `/api/team-leader/briefing` | GET | Get last briefing |
| `/api/team-leader/state` | GET | Get full TL state |
| `/api/team-leader/pending-actions` | GET | Get uncompleted user actions |
| `/api/team-leader/actions/:id/complete` | POST | Mark an action as done |

## Key Files

| File | Purpose |
|------|---------|
| `server/src/team-leader.ts` | Core TL agent: signals, assessment, execution, briefing, background task tracking, auto-restart |
| `server/src/focus-agent.ts` | Focus utilities: `analyzeFocusAreas()`, `generateProgressPulse()`, `deliverSprintResults()` |
| `server/src/focus-areas.ts` | Focus area engine: CRUD, evolution, expert tracking, sprint completion |
| `server/src/focus-context-provider.ts` | Decision-mode + expert persona injection for focus/expert conversations |
| `server/src/team-generator.ts` | Expert team generation for all focus types |
| `server/src/remarks.ts` | Async feedback system: email/WeChat/web → queue → TL processes |
| `src/components/TasksView.tsx` | TL dashboard: actions, briefing, remarks |
| `src/components/FocusView.tsx` | Focus detail: 2-tab layout (Focus + Experts), status badges, action cards |

## Design Principles

1. **User is CEO, TL is COO.** The user sets direction. The TL runs operations.
2. **Act, don't ask.** TL executes everything it can autonomously. Only surfaces items that genuinely need the user's brain.
3. **One brain.** All knowledge lives in the Cortex. TL reads from and writes to the same wiki the user sees.
4. **Experts work under TL.** Users chat with experts for opinions. TL manages experts (hire, fire, evaluate).
5. **Feedback loops compound.** Every remark, every sprint result, every expert evaluation feeds into the next cycle. The organization gets smarter.
6. **Safety first for code changes.** Build must pass before restart. All sessions must be idle. Failed builds are never deployed.
