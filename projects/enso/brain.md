# Project Brain — Enso

*This document is the accumulated institutional memory of the Enso evolution process.
It is read at the start of every sprint (Phase 0) and updated at the end (Phase 6 meta-review).
It captures what can't be derived from reading the code: recurring patterns, cause-effect insights,
strategic priorities, and what has already been tried. Keep it dense and honest.*

---

## Failure Memory

Recurring failure modes that have appeared across multiple sprints:

**1. Implementation execution collapse (sprint-over-sprint pattern) — RESOLVED**
- Sprints routinely produce excellent planning phases (Phase 0–4) but collapse during execution (Phase 5)
- Root cause: implementation tasks attempt too much scope without verification gates
- Counter-measure adopted Sprint 15: `tsc --noEmit` after EVERY file change
- Sprint 16: EXECUTION SUCCEEDED. 7/8 P0 items with zero orphans. Assignment matrix gate was key.
- **Sprint 17: 7/7 planned items + bonus E7 delivered. 2nd consecutive full-execution sprint.** Pattern is broken. Assignment matrix gate is proven across 2 sprints.

**2. Persona re-test deferral spiral — RESOLVED**
- Marco Reyes re-test was deferred for 5 consecutive sprints (Sprints 10–14)
- Sprint 15–17: Marco tested every sprint. Persona testing is now a consistent sprint gate.
- **WARNING**: Marco's Sprint 16 fixes remain UNVALIDATED after 3 sprints (contamination blocked Sprint 17 test). Sprint 18 retest is MANDATORY.

**3. Stale backlog items persisting across 3+ sprints**
- media-ai-gateway error string: RESOLVED Sprint 14
- ADR-004 (SSE Streaming): deprioritized indefinitely (6+ sprints deferred)
- MCP client integration: 6+ sprints, design only. Target Sprint 19+.
- **Sprint 17 update:** Project selector auto-context — RESOLVED (was 3-sprint carryover). ChatInput decomposition — Phase 2 RESOLVED (525 LOC, 5-sprint goal substantially complete).

**4. Build gate violations — RESOLVED**
- Sprint 15, 16, 17: Build green. **Four consecutive green-build sprints.**
- Rule remains: any sprint that ships a broken build should be scored ≤5.0.

**5. Half-done refactors — RESOLVED for this instance**
- OrchestrationCard React.memo wrapper completed Sprint 15. Holding through Sprint 17.

**6. P0 items designed but never assigned — RESOLVED**
- Assignment matrix gate: implemented Sprint 16, confirmed Sprint 17. **PERMANENT process gate.** Zero orphans across 2 consecutive sprints.

**7. Schema regression entering without pre-deployment validation — RESOLVED**
- Sprint 16: `batch_generate.scenes` and `photo_story` fields missing `items` → total platform outage
- **Sprint 17: `schema-validation.test.ts` IMPLEMENTED AND PASSING.** 245 tests across all 8 app families. Rules R1–R4 with recursive validation. Self-updating via fs discovery. Counter-measure is now ACTIVE.
- Runtime graceful degradation (`validateFunctionDeclaration()`) remains as defense-in-depth.

**8. NEW: Cross-session response contamination (Sprint 17)**
- `conversationHistories` map was keyed only by `conversationId`, not scoped per client
- Two clients using default conversation ID shared the same in-memory history
- Marco received 3 responses from different sessions during Sprint 17 persona test
- **FIXED Sprint 17:** Composite key `${clientId}|${conversationId}`. 7 LOC. All 5 call sites updated.
- Counter-measure: monitor in Sprint 18 retest. Consider adding automated session isolation test.

---

## Improvement Velocity

Sprint score history (Sprints 1–17): `[8.0, 6.5, 7.0, 8.5, 7.5, 7.0, 6.6, 6.6, 5.87, 8.0, 6.0, 7.5, 7.0, 4.5, 6.0, 7.0, 7.5]`
Mean: 6.76 — Above historical average. Two consecutive 7+ sprints.

**Trending up:**
- Sprint execution reliability: 2 consecutive full-delivery sprints (S16: 7/8, S17: 7/7 + bonus). Assignment matrix proven.
- Build stability: 4 consecutive green-build sprints
- Test coverage: 28 test files, 638 tests (up from 26/359). Schema + error tests are highest-ROI additions.
- ChatInput decomposition: Phase 2 complete (1205→525 LOC across 3 phases, 56% total reduction)
- Process innovation: Assignment matrix gate confirmed as permanent enabler
- Persona score average: 2.7 → 5.0 (+2.3). Platform crossing from "broken" to "functional."
- Bug discovery speed: Cross-session contamination found via persona testing, root-caused, and fixed in-sprint
- Research quality: Alex (8/10) and Priya (7/10) rate research as genuinely actionable

**Trending down / plateauing:**
- Marco unvalidated: Sprint 16 creative professional fixes now 3 sprints old without persona validation
- Silent failure UX: Jordan (0/5 responses, zero feedback). Sprint 16 had bad errors; Sprint 17 had NO errors. Regression.
- Sequential query throughput: Alex's queries 3-5 all timed out after fast 1-2
- server.ts size: 3,290 LOC (design doc ready, implementation Sprint 18)
- Error monitoring: Health endpoint still doesn't track 400-class errors

**Areas that improved and held:**
- Virtual scrolling (Sprint 13): implemented and stable
- CSS containment on cards: implemented and stable
- ChatCard React.memo: fixed Sprint 14, holding
- OrchestrationCard React.memo: fixed Sprint 15, holding
- Code splitting for heavy card types: 9 types lazy-loaded
- ChatInput stale ref fix via state mirror pattern: fixed Sprint 15, migrated to usePushToTalk Sprint 16
- Photo Studio / Media Gallery boundary: fixed Sprint 16, validated Sprint 17 (Priya: 0 misroutes)
- /code client connection: fixed Sprint 16, partially validated Sprint 17 (sub-agent offer works)
- Error message classification: fixed Sprint 16, validated Sprint 17 (Priya: 0 "try rephrasing")
- Tool schema graceful degradation: added Sprint 16, validated Sprint 17 (0 schema failures)
- Touch targets Phase 1 (Sprint 16) + Phase 2 (Sprint 17): welcome screen 100%, chat view now compliant with responsive breakpoints
- Cross-session contamination fix: Sprint 17 (pending validation in Sprint 18)
- Schema validation test: Sprint 17 (245 tests, active prevention)
- Error classification test: Sprint 17 (34 tests, "try rephrasing" sweep)
- Project selector auto-context: Sprint 17 (defaultProjectCwd fallback chain)

**Known regressions introduced by evolution sprints:**
- Silent failure pattern: Sprint 17 Jordan test showed 0/5 responses with zero UI feedback. Error classification fix works at the message layer but UI doesn't surface connection/processing state. Needs loading indicator + timeout escalation.

---

## Strategic Read

*PL's current assessment as of Sprint 17 meta-review.*

**Immediate priority (Sprint 18 must deliver):**
1. **server.ts decomposition IMPLEMENTATION** — Design doc ready (269 LOC, `server/DECOMPOSITION-DESIGN.md`). Extract 5 modules: server-utils → client-manager → media-server → http-routes → ws-handlers. This is the largest tech debt item (3,290 LOC).
2. **Marco Reyes re-retest** — Sprint 16 fixes for creative professionals are 3 sprints unvalidated. Contamination fix now deployed. MANDATORY Sprint 18 gate.
3. **Silent failure / connection health UX** — Loading spinner after message send + timeout escalation (loading → warning → error + retry). Affects 3/4 personas.
4. **Test coverage expansion** — Unit tests for extracted server modules. Target 30+ test files.
5. **ChatInput Phase 3** — 25 LOC to reach <500 target. Shell mode banner or voice toggle extraction.

**Medium-term strategic bets:**
- **MCP client integration** — 6+ sprints deferred. Won't happen until server.ts is decomposed. Target Sprint 19+.
- **Prompt caching** — 90% input token savings. Low risk, high ROI. Target Sprint 19.
- **Model cascading** — Haiku routing, Sonnet standard, Opus complex.
- **Build-to-app pipeline** — Alex and Priya want "build X" to produce iframe apps, not text cards. P2 but high-leverage for founder/dev personas.
- **Background processing with notifications** — Let users start new chats while long tasks complete.

**Things that are fine as-is (do not over-engineer):**
- Photo engine (H&D curves, LAB color, luminosity masking) — superior to external APIs
- Adaptive thinking in claude-code.ts — already implemented correctly
- Virtual scrolling + CSS containment — working, don't touch
- App ecosystem (15 apps, 114 tools) — well-segmented, no merges needed
- Photo Studio / Media Gallery boundary — RESOLVED and VALIDATED
- Schema validation — test suite active, graceful degradation as defense-in-depth
- Error message classification — test suite active, no "try rephrasing" regressions

**Vision coherence check:**
The platform is crossing from "broken" (avg 2.7) to "functional" (avg 5.0). Research quality is the killer feature (Alex 8/10, Priya 7/10). The "backend > frontend" gap is narrowing but silent failure UX is a new concern. Sprint 18 should focus on reliability (server.ts decomposition, silent failure fix) and validation (Marco retest).

---

## What's Been Tried

**Deferred (attempted but not completed, with sprint context):**
- SSE Streaming (ADR-004): Designed Sprint 13, deprioritized indefinitely (6+ sprints).
- MCP client: Design since Sprint 12, no code. Target Sprint 19+ (after server.ts decomposition).
- SQLite-backed CardContextStore: Design ready, deferred every sprint.
- Playwright E2E framework: Proposed Sprint 14, deferred (4+ sprints).

**Tried and confirmed working (don't revert):**
- @tanstack/react-virtual for CardTimeline: Virtual scrolling implemented and stable
- CSS containment (.card-contain): Implemented and stable
- Code splitting for heavy card types: 9 types lazy-loaded, working
- Mobile chat transition animation (.mobile-chat-enter): Working
- Long-press-to-PTT on textarea (Doubao-style): Working since Sprint 14
- Doubao visible mode toggle (inputMode state): Implemented Sprint 15, working
- ChatInput stale ref fix via state mirror pattern (pttAccumulatedText): Sprint 15 → usePushToTalk Sprint 16
- OrchestrationCard React.memo wrapper: Implemented Sprint 15, verified Sprint 16–17
- Photo Studio misrouting fix (negative constraints in import_photos): Sprint 16, validated Sprint 17
- /code client connection fix (context injection, 3-tier fallback): Sprint 16, partially validated Sprint 17
- Error message classification (system vs user errors): Sprint 16, validated Sprint 17
- Tool schema graceful degradation (validateFunctionDeclaration): Sprint 16, validated Sprint 17
- Touch target enforcement Phase 1 (<32px → 44px): Sprint 16
- Touch target enforcement Phase 2 (remaining elements, responsive breakpoints): Sprint 17
- ChatInput Phase 1 decomposition (5 modules, 1205→914 LOC): Sprint 16
- ChatInput Phase 2 decomposition (6 components, 914→525 LOC): Sprint 17
- Assignment matrix gate (zero orphans before Phase 5): Sprint 16, PERMANENT process gate
- Schema validation test (245 tests, all app.json schemas): Sprint 17
- Error classification test (34 tests, both layers): Sprint 17
- Project selector auto-context (defaultProjectCwd fallback): Sprint 17
- Cross-session contamination fix (composite key ${clientId}|${conversationId}): Sprint 17
- server.ts decomposition DESIGN (269 LOC, 5 modules): Sprint 17

**Tried and found not needed:**
- Replacing photo engine with external neural style transfer APIs: Photo engine is already superior
- Implementing adaptive thinking: Already active in claude-code.ts L366

**Architectural decisions pending:**
- server.ts decomposition IMPLEMENTATION: Design ready. 5 modules, extraction order defined. Sprint 18.
- ChatInput Phase 3: 525 → <500 LOC. Shell mode banner or voice toggle. Sprint 18 (low priority).
- Silent failure UX: Loading spinner + timeout escalation. Sprint 18.

---

## Persona Evolution Notes

*Running observations about each persona's relationship with the product.*

**Marco Reyes (creative-professional) — CONTAMINATION BUG BLOCKED VALIDATION (Sprint 17):**
- Sprint 15: 4.2/10. Sprint 16: 1.5/10. Sprint 17: 2.5/10 (+1.0).
- Sprint 17 retest was blocked by cross-session contamination: 3/3 responses from wrong sessions, 2/5 silent timeouts.
- The contamination bug was fixed in-sprint (E7, 7 LOC) but AFTER Marco's test ran.
- Sprint 16 Photo Studio misrouting fix, schema fix, and error classification remain UNVALIDATED for this persona.
- **This is now a 3-sprint unvalidated fix. Sprint 18 retest is MANDATORY.**
- Latency improved (9.9s vs 27-29s Sprint 16) — delivering wrong content faster.
- Response latency and smart photo directory discovery remain unaddressed.
- **Sprint 18 retest focus**: Validate contamination fix is working. Then validate: gallery routing, Photo Studio misrouting, schema fix, error classification.

**Priya Sharma (indie-developer) — VALIDATED, FUNCTIONAL (Sprint 17):**
- Sprint 15: 4.8/10. Sprint 16: 2.6/10. Sprint 17: 6.2/10 (+3.6 — largest delta).
- **All Sprint 16 fixes validated**: Photo Studio misrouting FIXED (0/5 misrouted), schema FIXED (0% errors vs 100%), error messages FIXED (0 "try rephrasing"), /code client PARTIALLY validated (sub-agent offer works).
- Research quality rated 7/10 — detailed, structured, actionable content.
- Remaining gaps: progress indicators for 30s+ operations, "just build it" mode (builds ask clarifying questions instead of starting immediately), project selector friction (NOW FIXED in Sprint 17 via auto-context).
- **Sprint 18 focus**: Verify project selector auto-context improvement. Test build round-trip completion.

**Jordan Kim (developer) — SILENT FAILURE REGRESSION (Sprint 17):**
- Sprint 15: 6.4/10. Sprint 16: 4.0/10. Sprint 17: 4.5/10 (+0.5).
- Touch targets: Welcome screen 100%. Chat view was 42% pre-Sprint 17 fixes. Sprint 17 applied remaining fixes (settings gear 44px, chips 44px, buttons 44px with responsive breakpoints).
- **Critical regression**: 0/5 scenarios returned ANY response. No loading indicator, no error, no timeout message. Silent failure is WORSE than Sprint 16's bad error messages.
- Sprint 16 fixes partially validated: touch targets (PARTIAL → now completed), schema (PARTIAL — sends but no round-trip), error messages (REGRESSED — silent instead of bad).
- **Sprint 18 focus**: Silent failure UX (loading spinner, timeout escalation). Retest to validate touch target improvements and verify response delivery.

**Alex Chen (startup-founder) — NEW BASELINE, RESEARCH IS KILLER FEATURE (Sprint 17):**
- Sprint 12: ~4.0/10. Sprint 17: 6.8/10 (NEW BASELINE after 4-sprint gap).
- 2/5 scenarios completed with strong quality: market research (8/10), dashboard build (7/10).
- 3/5 scenarios timed out due to sequential query degradation after 2 fast queries.
- Research is Enso's strongest differentiator: "5 specific verticals with displacement analysis in 15 seconds" — better than manual research.
- Build-to-app gap: Dashboard content is rich (Mermaid charts, data tables, AI insights) but rendered as chat card, not interactive app. Alex needs demo-ready artifacts.
- No misroutes, no errors, no crashes across all 5 scenarios.
- **Sprint 18 focus**: Sequential query throughput. Build-to-app pipeline design (P2). Verify baseline holds.

---

## Uncommitted Changes Tracker

*Significant uncommitted work that should not be lost or forgotten across sprints.*

**Sprint 17 working tree (cumulative with Sprint 15-16):**

Sprint 15-16 uncommitted changes (still present — see Sprint 16 brain entry for full list).

Sprint 17 new changes:
- `server/src/schema-validation.test.ts` (NEW) — 195 LOC, 245 tests, validates all app.json schemas (E1)
- `server/src/error-classification.test.ts` (NEW) — 208 LOC, 34 tests, error message classification (E2)
- `server/src/standalone-agent.ts` — composite key `${clientId}|${conversationId}` for conversation isolation (E7, 6 LOC delta)
- `server/src/server.ts` — `injectCardContext(clientId, ...)` param + `defaultProjectCwd: process.cwd()` (E7+E4, 2 LOC)
- `shared/types.ts` — `defaultProjectCwd?: string` (E4, 1 LOC)
- `src/store/chat.ts` — `defaultProjectCwd` state + handler + fallback chain (E4, 4 LOC)
- `src/components/ChatInput.tsx` — Phase 2 decomposition (914→525 LOC), imports 6 new modules (E3)
- `src/components/chat/AttachmentPreview.tsx` (NEW) — 100 LOC (E3)
- `src/components/chat/ImageResearchPreview.tsx` (NEW) — 78 LOC (E3)
- `src/components/chat/SlashMenu.tsx` (NEW) — 79 LOC (E3)
- `src/components/chat/SendControls.tsx` (NEW) — 70 LOC (E3)
- `src/components/chat/QuickActionChips.tsx` (NEW) — 31 LOC (E3)
- `src/components/chat/AttachMenu.tsx` (NEW) — 78 LOC (E3)
- `src/components/chat/usePushToTalk.ts` — added `desktopPttHandlers`, `cancelPtt()`, `DesktopPttHandlers` type (E3)
- `src/components/SettingsPanel.tsx` — settings gear 44px touch target with responsive breakpoint (E5)
- `src/components/CardContainer.tsx` — segClass, toggles, enhance pill touch targets with responsive breakpoints (E5)
- `server/DECOMPOSITION-DESIGN.md` (NEW) — 269 LOC, server.ts extraction plan (E6)

---

*Last updated: Sprint 17 meta-review (2026-04-02)*
*Next update: Phase 6 meta-review of Sprint 18*
