# Project Brain — Enso

*This document is the accumulated institutional memory of the Enso evolution process.
It is read at the start of every sprint (Phase 0) and updated at the end (Phase 6 meta-review).
It captures what can't be derived from reading the code: recurring patterns, cause-effect insights,
strategic priorities, and what has already been tried. Keep it dense and honest.*

---

## Failure Memory

Recurring failure modes that have appeared across multiple sprints:

**1. Implementation execution collapse (sprint-over-sprint pattern)**
- Sprints routinely produce excellent planning phases (Phase 0–4) but collapse during execution (Phase 5)
- Root cause: implementation tasks attempt too much scope without verification gates
- Symptom: items marked "done" that are incomplete or broken (OrchestrationCard Sprint 14: renamed to OrchestrationCardInner but export default never added, breaking the build)
- Counter-measure adopted Sprint 15: `tsc --noEmit` after EVERY file change; implementation phases must produce reports with documented tsc exit codes
- Sprint 15 update: Build stayed green throughout — tsc enforcement worked. However, task ASSIGNMENT still failed: Photo Studio misrouting fix (P0-NEW-1) was designed but never assigned to an implementation agent. **Counter-measure needed: implementation assignment checklist — every designed P0 must be explicitly assigned before Phase 5 begins.**

**2. Persona re-test deferral spiral — PARTIALLY RESOLVED**
- Marco Reyes (creative-professional) re-test was deferred for 5 consecutive sprints (Sprints 10–14) despite being declared a BLOCKING GATE
- **Sprint 15: Marco was finally tested.** Score: 4.2/10. The Phase 0 enforcement (test before planning) worked.
- New concern: testing revealed more issues than it resolved. Marco's score is the lowest ever, and the tools he needs exist but aren't surfaced correctly.
- Lesson: the deferral was masking real product gaps. Testing early reveals truth that deferred sprints hide.

**3. Stale backlog items persisting across 3+ sprints**
- media-ai-gateway error string: RESOLVED in Sprint 14
- ADR-004 (SSE Streaming): approved Sprint 13, still unimplemented as of Sprint 15 (3 sprints deferred)
- MCP client integration: flagged every sprint since Sprint 12, only design work done (4+ sprints)
- Pattern: complex multi-day items get carried without a clear implementation plan or ownership
- Sprint 15 update: Photo Studio misrouting is now a NEW stale item — identified, designed, but not implemented

**4. Build gate violations — IMPROVING**
- Sprint 13: implementation self-assessed 10/10 quality despite tsc errors
- Sprint 14: OrchestrationCard shipped broken (missing export default, tsc exit code 2)
- **Sprint 15: Build stayed green throughout.** tsc after every file change is working. Rule: any sprint that ships a broken build should be scored ≤5.0 regardless of other merits.

**5. Half-done refactors — RESOLVED for this instance**
- OrchestrationCard React.memo wrapper completed Sprint 15. The canonical example is now closed.
- Rule remains: if you rename a function, complete the refactor in the same change.

**6. NEW: P0 items designed but never assigned (Sprint 15)**
- Photo Studio misrouting fix was designed as P0-NEW-1 with a concrete implementation plan (tighten tool descriptions in photo_studio/app.json) but was not assigned to either implementation agent
- The design→implementation handoff is a process gap. Every P0 in the design doc must have an explicit agent assignment before execution begins.
- Mitigation: Phase 4 (design) must include an assignment matrix: {Enhancement → Agent} with no orphans allowed.

---

## Improvement Velocity

Sprint score history (Sprints 1–15): `[8.0, 6.5, 7.0, 8.5, 7.5, 7.0, 6.6, 6.6, 5.87, 8.0, 6.0, 7.5, 7.0, 4.5, 6.0]`
Mean: 6.69 — Recovery from all-time low but below target of 7.0.

**Trending up:**
- Build stability: Sprint 15 maintained green build throughout (first time in 3 sprints)
- Architecture awareness: agent pain points are now detailed and specific (not generic)
- Marketing execution capability: growth tools (Ayrshare, Resend, Netlify, Satori) now available via `/api/growth/`
- Media capabilities: photo studio (H&D curves, LAB color, 200+ style recipes) is production-grade; do not replace with external APIs
- Model costs: Claude Opus 4.6 brings 67% cost reduction vs Opus 3.x; adaptive thinking already active
- Sprint mechanism: brain.md + persona history + sprint history context now integrated into evolution.ts
- Persona testing discipline: Marco tested for the first time in 5 sprints

**Trending down / plateauing:**
- Sprint execution reliability: 3 of last 4 sprints had execution failures (Sprint 15 improved but still missed P0-NEW-1)
- Persona scores declining: average 5.1/10 in Sprint 15 (Marco 4.2, Jordan 6.4, Priya 4.8)
- Priya REGRESSED from 6.6 → 4.8 (-1.8 points) due to /code failure and Photo Studio misrouting
- Test coverage: ~15% (26/175 files), unchanged across 5 sprints
- P0 target test coverage: 0% — zero P0 sprint targets have dedicated tests (5 sprints running)

**Areas that improved and held:**
- Virtual scrolling (Sprint 13): implemented and stable
- CSS containment on cards: implemented and stable
- ChatCard React.memo: fixed in Sprint 14 and holding
- OrchestrationCard React.memo: fixed in Sprint 15 and holding
- media-ai-gateway provider registration logging: fixed Sprint 14
- Code splitting for heavy card types: 9 types lazy-loaded (was 8, now includes TodoListCard)
- ChatInput stale ref (L258): fixed in Sprint 15 via state mirror pattern

**Known regressions introduced by evolution sprints:**
- None currently active. OrchestrationCard export default regression from Sprint 14 has been resolved.

---

## Strategic Read

*PL's current assessment as of Sprint 15 post-mortem.*

**Immediate priority (Sprint 16 must deliver):**
1. Fix Photo Studio misrouting — P0 carryover from Sprint 15 (designed but not implemented). Tighten import_photos tool description in photo_studio/app.json. Trust-destroying bug.
2. Touch target enforcement (44px minimum) — 86-90% of interactive elements below WCAG minimum. Needs design system approach, not file-by-file patches.
3. ChatInput.tsx decomposition — now ~1,200 LOC after Doubao toggle addition. Extract usePushToTalk hook first, then SlashMenu and SendControls components.
4. /code client connection investigation — core developer feature completely broken. "No active client" error needs root cause analysis.
5. Project selector auto-context — blocks every code/shell interaction for both Jordan and Priya.

**Medium-term strategic bets:**
- **MCP client integration** — 5,800+ MCP servers, 97M monthly SDK downloads, Enso currently at 0/10. The gap widens every sprint. This is the highest-leverage architectural addition available.
- **server.ts decomposition** — Currently 3,239 LOC (down from 3,757 noted previously). Begin Express Router extraction: api-routes.ts, media-router.ts, ws-handlers.ts.
- **Prompt caching** — 90% input token savings available, not yet adopted. Low risk, high ROI.
- **Model cascading** — Haiku for routing, Sonnet for standard, Opus for complex. Projected 65% blended cost savings.
- **Agent tool selection regression tests** — No automated tests verify prompt→tool mapping. Every agent prompt change is tested only by humans.

**Things that are fine as-is (do not over-engineer):**
- Photo engine (H&D curves, LAB color, luminosity masking) — superior to external APIs
- Adaptive thinking in claude-code.ts — already implemented correctly
- Virtual scrolling + CSS containment — working, don't touch
- App consolidation (media_gallery vs photo_studio): keep separate, fix the boundary. 21/23 tools are unique; domains are distinct (browse/organize vs style/edit).

**Vision coherence check:**
Enso's stated vision ("AI sandbox that generates complete solutions") is undermined by a "backend > frontend" gap — backend capabilities score 8/10 but frontend execution is 4-5/10. The AI correctly classifies intent (100% accuracy per Jordan) but tool selection downstream fails. Sprint 16 should focus on execution pipeline reliability: correct tool surfaces for correct request, every time.

---

## What's Been Tried

**Deferred (attempted but not completed, with sprint context):**
- SSE Streaming (ADR-004): Designed Sprint 13, still not implemented Sprint 15 (3 sprints). Blocked by build instability (now resolved).
- MCP client: Design discussed every sprint since Sprint 12, only architecture diagrams produced. No code.
- SQLite-backed CardContextStore: Design ready (in-memory cardContexts lost on restart), deferred every sprint.
- Playwright E2E framework: Proposed Sprint 14, deferred to Sprint 16.
- Mobile touch target enforcement (44px minimum): Flagged by Jordan (86-90% violations) and Priya (70% buttons under 44px). Deferred to Sprint 16. Needs design system approach.
- App consolidation (Media Suite): Multi-sprint effort. Sprint 15 synthesis recommends keeping media_gallery + photo_studio separate but fixing the boundary. Not a merge.
- Photo Studio misrouting fix: Designed Sprint 15 with concrete plan (tighten tool descriptions + add negative constraints). Not implemented — assignment gap. Carryover to Sprint 16.
- /code client connection fix: Timeboxed to 2-hour investigation in Sprint 15, never started. Carryover.
- Project selector auto-context: Flagged by Jordan + Priya Sprint 15. Deferred.

**Tried and confirmed working (don't revert):**
- @tanstack/react-virtual for CardTimeline: Virtual scrolling implemented and stable
- CSS containment (.card-contain): Implemented and stable
- Code splitting for heavy card types: 9 types lazy-loaded, working
- Mobile chat transition animation (.mobile-chat-enter): Working
- Long-press-to-PTT on textarea (Doubao-style, L263-289): Working since Sprint 14
- Doubao visible mode toggle (inputMode state, toggle button, voice-hold-to-talk): Implemented Sprint 15, working
- ChatInput stale ref fix via state mirror pattern (pttAccumulatedText): Implemented Sprint 15
- OrchestrationCard React.memo wrapper: Implemented Sprint 15

**Tried and found not needed:**
- Replacing photo engine with external neural style transfer APIs: Photo engine is already superior
- Implementing adaptive thinking: Already active in claude-code.ts L366 (`params.thinking ?? 'adaptive'`)

**Architectural decisions pending:**
- ChatInput decomposition: At ~1,200 LOC, Sprint 16 P0. Architect recommends: usePushToTalk hook first, then SlashMenu, SendControls, AttachMenu, ToastNotifications.
- server.ts decomposition: At 3,239 LOC. Sprint 16-17 roadmap. Extract ws-handlers.ts (~800 lines), api-routes.ts (~300 lines), media-router.ts (~200 lines).
- App boundary fix: media_gallery and photo_studio should remain separate. Fix photo_studio import_photos tool description to narrow trigger. Add cross-app navigation links.

---

## Persona Evolution Notes

*Running observations about each persona's relationship with the product.*

**Marco Reyes (creative-professional) — FIRST REAL DATA (Sprint 15):**
- Score: 4.2/10 — lowest of all personas tested this sprint
- After 5 sprints of deferrals, we finally have real data. The results are sobering.
- Key insight: Backend media tools are MORE capable than what the AI surfaces. Gallery has 9 tools (browse, view, favorite, rate, collection, search, inspect, stats, duplicates) — Marco saw almost none working correctly.
- Asked for duplicates → got film presets (Photo Studio misrouting)
- Asked for EXIF data → got empty gallery pointing at wrong path
- Film stock descriptions genuinely impressed him (56 stocks, professional quality) — but craft without execution is just a portfolio
- Response latency (27-29s) is unusable for creative workflows
- No smart photo directory discovery — gallery defaults to home, doesn't auto-detect ~/Pictures
- Uncommitted media gallery changes (browse enhancements, duplicates executor, enhanced template) directly address his needs but weren't surfaced during his test
- Next test: after Photo Studio misrouting fix + media gallery integration, expect score improvement to 5.0-5.5

**Priya Sharma (indie-developer) — REGRESSION (Sprint 15):**
- Score: 4.8/10 — DOWN from 6.6/10 (Sprint 14), -1.8 regression
- The regression is alarming and suggests NEW bugs, not persistent issues
- /code command completely broken with "no active client to connect to" error — core feature for her workflow
- Photo Studio card appeared for "Build a todo app" — trust-destroying misrouting
- Claude Code Terminal stuck at project selection every time — no context persistence
- Primary frustration still valid: "AI personas don't learn from previous sprint feedback" — brain.md + persona history mechanism is the answer but she can't see it yet
- Next test: /code fix + misrouting fix + project selector improvement should recover score to 5.5+

**Jordan Kim (developer) — STABLE (Sprint 15):**
- Score: 6.4/10 — UP from 6.2/10 (Sprint 14), +0.2 improvement
- Most positive test: intent classification 100% accurate across all 5 scenarios
- Quote: "I'd rate the backend a solid 8, the UX a 5"
- Critical finding: 86-90% of touch targets below 44px WCAG minimum (action chips 28px, sidebar 32px, close button 9px!)
- Project selector adds friction on every coding task
- Terminal sessions stack without lifecycle management
- His findings are systematic UX debt, not architectural failures — backend works well for him
- Next test: touch target enforcement + project selector auto-context should improve to 7.0+

**Alex Chen (startup-founder):**
- Has not been tested in recent sprints (Sprints 13–15)
- His workflow (discover → build → evolve) represents the full Enso loop
- When tested, focus on: does /discover → project creation flow work end-to-end?

---

## Uncommitted Changes Tracker

*Significant uncommitted work that should not be lost or forgotten across sprints.*

**Sprint 15 working tree (as of meta-review):**
- `server/apps/media_gallery/app.json` — 9 tool definitions with trigger phrases, sampleData updates
- `server/apps/media_gallery/executors/browse.js` — resolution tiers, camera tracking, date ranges, favorites/rated
- `server/apps/media_gallery/executors/duplicates.js` (NEW) — dual matching, groups, waste calc, 30-group cap
- `server/apps/media_gallery/template.jsx` — enhanced gallery UI (search, filter, sort, views, lightbox, duplicates)
- `server/src/evolution.ts` — sprint history context builder, brain.md integration, persona history
- `server/src/project-manager.ts` — SprintFinding interface, loadProjectBrain(), persona history support
- `server/src/server.ts` — startup timestamp log line
- `src/cards/OrchestrationCard.tsx` — React.memo wrapper (Sprint 15 fix)
- `src/components/ChatInput.tsx` — stale ref fix + Doubao mode toggle (Sprint 15 fixes)
- `server/apps/todo_board/` (NEW) — unregistered, leave as-is
- `server/skills/todo_board/` (NEW) — skill definition, not yet active

---

*Last updated: Sprint 15 meta-review (2026-03-29)*
*Next update: Phase 6 meta-review of Sprint 16*
