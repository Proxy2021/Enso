# Project Brain — Enso

*This document is the accumulated institutional memory of the Enso evolution process.
It is read at the start of every sprint (Phase 0) and updated at the end (Phase 6 meta-review).
It captures what can't be derived from reading the code: recurring patterns, cause-effect insights,
strategic priorities, and what has already been tried. Keep it dense and honest.*

---

## Failure Memory

Recurring failure modes that have appeared across multiple sprints:

**1. Implementation execution collapse (sprint-over-sprint pattern) — IMPROVING**
- Sprints routinely produce excellent planning phases (Phase 0–4) but collapse during execution (Phase 5)
- Root cause: implementation tasks attempt too much scope without verification gates
- Counter-measure adopted Sprint 15: `tsc --noEmit` after EVERY file change
- **Sprint 16 update: EXECUTION SUCCEEDED.** 7 of 8 P0 items implemented across two parallel agents with zero orphans. The assignment matrix gate (Failure #6 counter-measure) was the key enabler. Build stayed green throughout (3rd consecutive sprint). Sprint 16 broke the execution collapse pattern.

**2. Persona re-test deferral spiral — RESOLVED**
- Marco Reyes re-test was deferred for 5 consecutive sprints (Sprints 10–14)
- Sprint 15: Marco tested (4.2/10). Sprint 16: Marco tested again (1.5/10 pre-fix, projected 5.5+ post-fix)
- Persona testing is now a consistent sprint gate. This failure mode is resolved.
- Lesson: the deferral was masking real product gaps. Testing early reveals truth that deferred sprints hide.

**3. Stale backlog items persisting across 3+ sprints**
- media-ai-gateway error string: RESOLVED in Sprint 14
- ADR-004 (SSE Streaming): approved Sprint 13, 4 sprints deferred. Honest status: deprioritized indefinitely until debt is cleared.
- MCP client integration: flagged every sprint since Sprint 12, only design work done (5+ sprints). Honest status: won't happen until platform is stable (target Sprint 18+).
- **Sprint 16 update:** Photo Studio misrouting (was stale 1 sprint) → RESOLVED. /code client connection (was stale 1 sprint) → RESOLVED. ChatInput decomposition (stale 5 sprints) → PARTIALLY RESOLVED (Phase 1 done). P0-5 project selector: now 2-sprint carryover — monitor for chronic deferral.

**4. Build gate violations — RESOLVED**
- Sprint 13: tsc errors ignored. Sprint 14: broken build shipped.
- Sprint 15: Build green. Sprint 16: Build green. Three consecutive green-build sprints.
- Rule remains: any sprint that ships a broken build should be scored ≤5.0.

**5. Half-done refactors — RESOLVED for this instance**
- OrchestrationCard React.memo wrapper completed Sprint 15. Holding in Sprint 16.
- Rule remains: if you rename a function, complete the refactor in the same change.

**6. P0 items designed but never assigned — RESOLVED**
- Sprint 15: Photo Studio misrouting fix was designed but never assigned. Root cause: no assignment matrix.
- **Sprint 16: Assignment matrix gate implemented and WORKED.** Every P0 item had an assigned agent, files to modify, and verification criteria. Zero orphans. The one deferred item (P0-5) was explicitly discussed and cut in the team roundtable, not silently dropped.
- **This counter-measure is now PERMANENT.** Phase 4 (design) MUST include an assignment matrix: {Enhancement → Agent} with no orphans allowed.

**7. NEW: Schema regression entering without pre-deployment validation (Sprint 16)**
- The `photo_story` and `batch_generate` tools were added to `video_studio/app.json` between Sprint 15 and 16 with 3 array parameters missing required `items` fields
- Gemini validates ALL tool schemas as a batch — one invalid schema caused HTTP 400 rejection of all 99 tools
- Result: total platform outage (0/15 persona scenarios passed, avg score 2.70 — worst in project history)
- Root cause: no automated validation of app.json schemas before deployment
- **Counter-measure needed:** Add `schema-validation.test.ts` that loads ALL app.json files and asserts every `type: "array"` has an `items` field. This is a P0 for Sprint 17.
- Sprint 16 also added runtime graceful degradation (`validateFunctionDeclaration()` in standalone-agent.ts) as defense-in-depth

---

## Improvement Velocity

Sprint score history (Sprints 1–16): `[8.0, 6.5, 7.0, 8.5, 7.5, 7.0, 6.6, 6.6, 5.87, 8.0, 6.0, 7.5, 7.0, 4.5, 6.0, 7.0]`
Mean: 6.71 — Recovery continuing, approaching target of 7.0.

**Trending up:**
- Sprint execution reliability: Sprint 16 shipped 7/8 P0 items (vs 0/5 in Sprint 15). Assignment matrix is the key enabler.
- Build stability: 3 consecutive green-build sprints (Sprint 14 was the last failure)
- ChatInput decomposition: Finally started after 5 sprints of deferral. Phase 1 shipped (1205→914 LOC).
- Process innovation: Assignment matrix gate, scoping discipline (cut P0-5, narrowed P0-2/P0-3)
- Tool schema resilience: Graceful degradation prevents one-bad-tool-bricks-all
- Error UX: System errors no longer blame users ("try rephrasing" → "service error occurred")
- App ecosystem boundary: Photo Studio / Media Gallery overlap resolved via negative constraints
- Architecture awareness: agent pain points are now detailed and specific
- Media capabilities: photo studio (H&D curves, LAB color, 200+ style recipes) is production-grade
- Sprint mechanism: brain.md + persona history + sprint history context integrated into evolution.ts

**Trending down / plateauing:**
- Test coverage: 12.9% (26/201 files), DECLINING as source files grow. 6 sprints stagnant. Zero P0 items have dedicated tests.
- P0-5 (project selector): now 2-sprint carryover. Risk of becoming chronic deferral.
- Persona scores (pre-fix): Sprint 16 pre-fix average 2.70 (worst ever, caused by schema regression). Post-fix projected average: 6.0-7.0 — UNVERIFIED.
- Error monitoring: Health endpoint doesn't track 400-class errors. Reported 0 errors during 100% failure.

**Areas that improved and held:**
- Virtual scrolling (Sprint 13): implemented and stable
- CSS containment on cards: implemented and stable
- ChatCard React.memo: fixed in Sprint 14 and holding
- OrchestrationCard React.memo: fixed in Sprint 15 and holding (verified Sprint 16)
- media-ai-gateway provider registration logging: fixed Sprint 14
- Code splitting for heavy card types: 9 types lazy-loaded
- ChatInput stale ref fix via state mirror pattern: fixed Sprint 15, correctly migrated to extracted usePushToTalk hook in Sprint 16
- Photo Studio / Media Gallery boundary: fixed Sprint 16 via description narrowing
- /code client connection: fixed Sprint 16 via context injection (3-tier fallback)
- Error message classification: fixed Sprint 16 (system vs user errors)
- Tool schema graceful degradation: added Sprint 16

**Known regressions introduced by evolution sprints:**
- None currently active.

---

## Strategic Read

*PL's current assessment as of Sprint 16 post-mortem.*

**Immediate priority (Sprint 17 must deliver):**
1. **Post-fix persona retests** — Sprint 16's implementations are unvalidated. Retest Marco, Priya, Jordan to verify fixes. MANDATORY Sprint 17 gate.
2. **Schema validation test** (`schema-validation.test.ts`) — Highest-ROI test in the project. Loads all app.json files, asserts every `type: "array"` has `items`. Prevents recurrence of Sprint 16's catastrophic schema bomb.
3. **ChatInput Phase 2** — Extract SlashMenu, SendControls components. Target: ChatInput.tsx < 500 LOC. Phase 1 (Sprint 16) brought it from 1205→914.
4. **P0-5: Project selector auto-context** — 2-sprint carryover. Default to `process.cwd()` when no project set. 3-line quick fix for the common case.
5. **Error classification test** — Unit test error message selection by HTTP status. Prevents "try rephrasing" regression.

**Medium-term strategic bets:**
- **server.ts decomposition** — Currently 3,268 LOC. Sprint 17: design the extraction plan. Sprint 18: implement. Extract ws-handlers.ts, http-routes.ts, client-manager.ts.
- **MCP client integration** — 5,800+ MCP servers. Won't happen until platform is stable. Target: Sprint 18+. The P0-4 context param change in tool execution is a small step toward MCP readiness.
- **Prompt caching** — 90% input token savings available. Low risk, high ROI.
- **Model cascading** — Haiku for routing, Sonnet for standard, Opus for complex.
- **Agent tool selection regression tests** — No automated tests verify prompt→tool mapping.

**Things that are fine as-is (do not over-engineer):**
- Photo engine (H&D curves, LAB color, luminosity masking) — superior to external APIs
- Adaptive thinking in claude-code.ts — already implemented correctly
- Virtual scrolling + CSS containment — working, don't touch
- App ecosystem (15 apps, 108 tools) — well-segmented, no merges needed
- Photo Studio / Media Gallery boundary — RESOLVED in Sprint 16

**Vision coherence check:**
The "backend > frontend" gap is narrowing. Sprint 16 fixed the tool routing pipeline (Photo Studio misrouting, /code connection), improved error UX (honest error messages), and started frontend decomposition (ChatInput Phase 1, touch targets). Sprint 17 should continue closing this gap with persona retests validating the improvements.

---

## What's Been Tried

**Deferred (attempted but not completed, with sprint context):**
- SSE Streaming (ADR-004): Designed Sprint 13, deprioritized indefinitely until debt is cleared.
- MCP client: Design discussed since Sprint 12, no code. Target Sprint 18+.
- SQLite-backed CardContextStore: Design ready, deferred every sprint.
- Playwright E2E framework: Proposed Sprint 14, deferred.
- Project selector auto-context: Flagged Sprint 15, deferred Sprint 16 with justification. 2-sprint carryover to Sprint 17.
- ChatInput Phase 2 (SlashMenu, SendControls extraction): Designed Sprint 16, deferred to Sprint 17. Phase 1 shipped.

**Tried and confirmed working (don't revert):**
- @tanstack/react-virtual for CardTimeline: Virtual scrolling implemented and stable
- CSS containment (.card-contain): Implemented and stable
- Code splitting for heavy card types: 9 types lazy-loaded, working
- Mobile chat transition animation (.mobile-chat-enter): Working
- Long-press-to-PTT on textarea (Doubao-style): Working since Sprint 14
- Doubao visible mode toggle (inputMode state): Implemented Sprint 15, working
- ChatInput stale ref fix via state mirror pattern (pttAccumulatedText): Implemented Sprint 15, migrated to usePushToTalk hook Sprint 16
- OrchestrationCard React.memo wrapper: Implemented Sprint 15, verified Sprint 16
- Photo Studio misrouting fix (negative constraints in import_photos description): Implemented Sprint 16
- /code client connection fix (context injection, 3-tier fallback): Implemented Sprint 16
- Error message classification (system vs user errors): Implemented Sprint 16
- Tool schema graceful degradation (validateFunctionDeclaration): Implemented Sprint 16
- Touch target enforcement (worst offenders <32px → 44px): Implemented Sprint 16
- ChatInput Phase 1 decomposition (5 modules extracted, 1205→914 LOC): Implemented Sprint 16
- Assignment matrix gate (zero orphans before Phase 5): Implemented Sprint 16, PERMANENT process gate

**Tried and found not needed:**
- Replacing photo engine with external neural style transfer APIs: Photo engine is already superior
- Implementing adaptive thinking: Already active in claude-code.ts L366

**Architectural decisions pending:**
- ChatInput Phase 2: Extract SlashMenu, SendControls, AttachmentPicker. Target <500 LOC. Sprint 17.
- server.ts decomposition: At 3,268 LOC. Extract ws-handlers.ts, http-routes.ts, client-manager.ts. Sprint 17 design, Sprint 18 implement.
- Schema validation pre-deployment test: P0 for Sprint 17. Prevents schema bomb recurrence.

---

## Persona Evolution Notes

*Running observations about each persona's relationship with the product.*

**Marco Reyes (creative-professional) — SCHEMA BUG MASKED ALL IMPROVEMENTS (Sprint 16):**
- Sprint 15: 4.2/10. Sprint 16 pre-fix: 1.5/10 (-2.7). Projected post-fix: 5.5-6.5.
- The catastrophic score drop was caused by the Video Studio schema bug (total platform outage), NOT by regressions in Marco's specific tools.
- Photo Studio misrouting (his #1 frustration in Sprint 15) was FIXED in Sprint 16. The `import_photos` description now has explicit negative constraints preventing gallery-intent requests from routing to Photo Studio.
- Media Gallery tools (browse, duplicate detection, EXIF inspection) should now be correctly surfaced. UNVERIFIED — needs Sprint 17 retest.
- Film stock descriptions still genuine strength (56 stocks, professional quality).
- Response latency and smart photo directory discovery remain unaddressed.
- **Sprint 17 retest focus:** Does "Show me my photos" route to media_gallery? Does duplicate detection work? Do EXIF requests route correctly?

**Priya Sharma (indie-developer) — SCHEMA BUG + /CODE FIX (Sprint 16):**
- Sprint 15: 4.8/10. Sprint 16 pre-fix: 2.6/10 (-2.2). Projected post-fix: 5.5-6.5.
- Schema bug caused 100% failure rate — all 5 scenarios returned "try rephrasing" error.
- TWO P0 items directly fix her workflow: /code client connection (P0-4, RESOLVED) and Photo Studio misrouting (P0-1, RESOLVED).
- Error messages no longer blame her for system failures (P0-A, RESOLVED).
- Project selector friction persists (P0-5, DEFERRED to Sprint 17).
- **Sprint 17 retest focus:** Does "Build a todo app" route correctly (no Photo Studio)? Does /code launch without "no active client" error? Does error handling show honest messages?

**Jordan Kim (developer) — TOUCH TARGETS + ERROR HANDLING (Sprint 16):**
- Sprint 15: 6.4/10. Sprint 16 pre-fix: 4.0/10 (-2.4). Projected post-fix: 7.0-8.0.
- Schema bug caused 100% server error rate. Pre-fix touch target violations improved from 86-90% to 37% on welcome screen (partial improvement before Sprint 16 implementation).
- Sprint 16 touch target fix applied 44px minimums to worst offenders: close buttons (9.8px→44px), sidebar items (32px→44px), icon buttons (22px→44px), follow-up chips (28px→44px). 11 compliance points (was 1).
- Elements at 38-40px deferred to Sprint 17 (input area buttons).
- Error handling improved — system errors now show honest messages.
- Project selector friction persists (P0-5 deferred).
- **Sprint 17 retest focus:** Are touch targets >44px on core controls? Do all 5 scenarios return results (not errors)? Does the mobile viewport layout hold?

**Alex Chen (startup-founder):**
- Has not been tested since Sprint 12. 4-sprint gap.
- His workflow (discover → build → evolve) represents the full Enso loop — no other persona covers this.
- **Sprint 17: INCLUDE as 4th persona.** Focus: does /discover → project creation flow work end-to-end?

---

## Uncommitted Changes Tracker

*Significant uncommitted work that should not be lost or forgotten across sprints.*

**Sprint 16 working tree (cumulative with Sprint 15):**

Sprint 15 uncommitted changes (still present):
- `server/apps/media_gallery/` — enhanced app.json, browse executor, duplicates executor, template
- `server/src/evolution.ts` — sprint history context builder, brain.md integration
- `server/src/project-manager.ts` — SprintFinding interface, loadProjectBrain()
- `server/src/server.ts` — startup timestamp log line
- `src/cards/OrchestrationCard.tsx` — React.memo wrapper (Sprint 15 fix)
- `server/apps/todo_board/` (NEW) — unregistered
- `server/skills/todo_board/` (NEW) — skill definition, not active

Sprint 16 new changes:
- `server/apps/video_studio/app.json` — 3 `items` fields added (P0-EMERGENCY)
- `server/apps/photo_studio/app.json` — `import_photos` description narrowed (P0-1)
- `server/src/standalone-agent.ts` — validateFunctionDeclaration + filter (P0-B), error classification (P0-A), context param passthrough (P0-4)
- `server/src/local-types.ts` — optional `context` param on EnsoAgentTool.execute (P0-4)
- `server/src/tool-registry-local.ts` — optional `context` param on executeLocalTool (P0-4)
- `server/src/system-tools.ts` — 3-tier client fallback in enso_launch_task_session (P0-4)
- `src/main.css` — .touch-target and .touch-target-inline utilities (P0-2)
- `src/components/CardContainer.tsx` — close button 44px touch target (P0-2)
- `src/components/ConversationSidebar.tsx` — sidebar items/buttons 44px touch targets (P0-2)
- `src/components/FollowUpChips.tsx` — follow-up chips 44px touch target (P0-2)
- `src/components/ChatInput.tsx` — decomposed, imports from 5 new modules (P0-3 Phase 1)
- `src/components/chat/usePushToTalk.ts` (NEW) — PTT hook with Sprint 15 fix preserved (P0-3)
- `src/components/chat/useKeyboardOffset.ts` (NEW) — keyboard offset hook (P0-3)
- `src/components/chat/slash-commands.ts` (NEW) — slash command constants (P0-3)
- `src/components/chat/attach-categories.tsx` (NEW) — attachment category constants (P0-3)
- `src/components/chat/chat-utils.ts` (NEW) — file utility functions (P0-3)
- `src/lib/__tests__/time-utils.test.ts` — locale-independent assertions (Bonus)

---

*Last updated: Sprint 16 meta-review (2026-04-01)*
*Next update: Phase 6 meta-review of Sprint 17*
