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
- **Sprint 17-19: 4 consecutive full-delivery sprints (7/8, 7/7+bonus, 10/10, 10/10).** Pattern is definitively broken. Assignment matrix gate is PERMANENT.

**2. Persona re-test deferral spiral — WATCH**
- Marco Reyes re-test was deferred for 5 consecutive sprints (Sprints 10–14)
- Sprint 15–18: Marco tested every sprint. Persona testing is now a consistent sprint gate.
- **Sprint 19: Marco NOT TESTED. Retest files not generated for Alex/Priya.** Process slipped — fixes deployed but unvalidated. Must not become a pattern again.

**3. Stale backlog items persisting across 3+ sprints**
- media-ai-gateway error string: RESOLVED Sprint 14
- ADR-004 (SSE Streaming): deprioritized indefinitely (6+ sprints deferred)
- MCP client integration: 7+ sprints, design only. Blocked by server.ts decomposition. Target Sprint 21+.
- **Sprint 20 update:** server.ts decomposition now at **5 sprints deferred** (designed Sprint 17, deferred Sprint 18/19/20). MUST execute Sprint 21. This is a severe credibility crisis — 4 consecutive "MUST execute" promises broken. Sprint 20 design explicitly marked server.ts as "No Changes" which excluded all 3 P0 bug fixes from implementation scope. **The design-to-implementation disconnect is now the #1 process failure.**

**4. Build gate violations — RESOLVED**
- Sprint 15, 16, 17, 18, 19: Build green. **Six consecutive green-build sprints.**
- Rule remains: any sprint that ships a broken build should be scored ≤5.0.

**5. Half-done refactors — RESOLVED for this instance**
- OrchestrationCard React.memo wrapper completed Sprint 15. Holding through Sprint 19.

**6. P0 items designed but never assigned — RESOLVED**
- Assignment matrix gate: implemented Sprint 16, confirmed Sprint 17-19. **PERMANENT process gate.** Zero orphans across 4 consecutive sprints.

**7. Schema regression entering without pre-deployment validation — RESOLVED**
- Sprint 16: `batch_generate.scenes` and `photo_story` fields missing `items` → total platform outage
- **Sprint 17: `schema-validation.test.ts` IMPLEMENTED AND PASSING.** 245 tests across all 8 app families.
- Sprint 18-19: 0 schema errors across all persona tests.

**8. Cross-session response contamination — RESOLVED, ENHANCED Sprint 19**
- `conversationHistories` map was keyed only by `conversationId`, not scoped per client
- **FIXED Sprint 17:** Composite key `${clientId}|${conversationId}`. 7 LOC.
- **VALIDATED Sprint 18:** Marco's 2 successful responses showed zero contamination.
- **ENHANCED Sprint 19:** Memory context injection replaced — `getUserProfileContext()` replaces `getMemoryContext()` in system prompts. Session boundary marker added to prevent "as we discussed" hallucinations. Root cause of context hallucination (ENSO_MEMORY.md injection into system prompt) eliminated.

**9. Marketing infrastructure at zero for 17 sprints — IMPROVING BUT UNDEPLOYED**
- 17 consecutive sprints focused entirely on engineering with zero marketing investment
- Sprint 18: first marketing-focused sprint (2.2/10 → 6.5/10)
- **Sprint 19: continued improvement (6.5/10 → 7.5/10) — OG PNG, LICENSE, SEO, security fixes. But STILL nothing deployed. Two consecutive "preparation" sprints with zero external presence.**
- **NEW lesson:** The evolution process cannot execute external actions (deploy websites, post to social media, create accounts). These require manual human action. Sprint planning must explicitly account for this gap.
- Counter-measure: Sprint 20 must include a "manual deployment checklist" with specific human action items, not just code changes.

**10. "Ready-to-deploy but never deployed" pattern (Sprint 18-19) — DEPRIORITIZED**
- Sprint 18 created landing page, social posts, competitive positioning — all excellent quality, none deployed
- Sprint 19 fixed all blockers (OG PNG, LICENSE, SEO, security) — still nothing deployed
- Sprint 20 pivot: Focus shifted to OS-level agent tools instead of deployment. Marketing deployment deferred indefinitely.
- Root cause: The evolution sprint process produces code artifacts but has no mechanism to execute external deployment actions (enable GitHub Pages, create Plausible account, post to Twitter)

**11. NEW: Design-to-implementation disconnect (Sprint 20)**
- Sprint 20 design (Phase 4) explicitly specified 3 P0 bug fixes in Sections 7.1-7.3 with server.ts code changes
- BUT the same design's architecture diagram listed server.ts under "No Changes"
- Both implementation tracks cited "outside this track's scope" to skip ALL bug fixes
- The review phase noted this as "deferred" rather than flagging it as a process failure
- Result: 0/3 P0 bugs fixed despite being designed and assigned as P0
- **Root cause:** The design phase created an internal contradiction — P0 bug fixes specified in text but excluded from the file change matrix. Implementation agents followed the matrix, not the text.
- **Counter-measure:** Sprint 21 must require explicit file-level assignment for EVERY P0 item. If a P0 requires changes to a file, that file MUST appear in the "Files Changed" matrix. No P0 can be "designed but not assigned to a file."

---

## Improvement Velocity

Sprint score history (Sprints 1–20): `[8.0, 6.5, 7.0, 8.5, 7.5, 7.0, 6.6, 6.6, 5.87, 8.0, 6.0, 7.5, 7.0, 4.5, 6.0, 7.0, 7.5, 7.5, 7.0, 6.5]`
Mean: 6.80 — Slight dip. Four consecutive 7+ streak broken.

**Trending up:**
- Sprint execution reliability: Feature delivery remains strong (8/8 new tools, 663 LOC, 13 new tests). Assignment matrix PERMANENT.
- Build stability: **7 consecutive green-build sprints** (728/728 tests pass Sprint 20)
- Test coverage: 20 test files, 551+ tests post-Sprint 20 (testing methodology changed — fewer files but more focused). 13 new filesystem tool tests added.
- Tool ecosystem: Filesystem 11→14, Browser 6→10, System 4→5. **34 total agent-callable tools** (+8 this sprint).
- OS-level agent capabilities: write_file, copy_path, search_content, shell_execute, browser_extract/key/evaluate/wait all functional.
- Playwright/Puppeteer dual-engine abstraction: Structural readiness. Zero-risk migration path when Playwright is installed.

**Trending down / plateauing:**
- **Persona scores CRASHED**: Average 6.93 → 4.9 (-2.03). ALL three personas regressed or flat.
- Jordan Kim: 7.6 → 6.1 (-1.5). Shell CWD persists 3rd sprint. Simple ops routed through heavyweight Claude Code.
- Priya Sharma: 6.0 → 5.0 (-1.0). Claude Code project selector replaces old build-first friction. Shell CWD. Deep research still fake.
- Marco Reyes: 3.5 → 3.6 (+0.1, effectively flat). Silent filesystem failures. Photo Studio misrouting. **6th sprint under 5.0. Critical rescue failure.**
- Alex Chen: NOT TESTED Sprint 20. Context contamination fix still unvalidated.
- server.ts size: 3,870+ LOC (**5 sprints deferred**). Blocks MCP integration. Blocks ALL bug fixes. **Credibility crisis.**
- Bug fix delivery: **0/3 P0 bugs fixed** despite being designed. Design-implementation disconnect pattern.
- Deployed marketing: Still 0/10 — three sprints of preparation, nothing live.
- Sales infrastructure: Still 0.6/10.

**Areas that improved and held:**
- Virtual scrolling, CSS containment, code splitting: all stable since Sprint 13-14
- ChatCard/OrchestrationCard React.memo: stable
- Photo Studio / Media Gallery boundary: validated Sprint 17, no regressions
- /code client connection: working, improved UX (progress indicator) Sprint 18
- Error message classification: validated Sprint 17-19, no "try rephrasing" regressions
- Schema validation test: active, 0 failures Sprint 18-19
- Cross-session contamination fix: VALIDATED Sprint 18, ENHANCED Sprint 19
- Touch targets Phase 1+2: complete and holding (welcome 82%, chat 48% — chat still needs work)
- ChatInput decomposition Phase 2: complete (1205→525 LOC)

**Marketing metrics (Sprint 19 update):**
| Asset | Sprint 18 | Sprint 19 | Delta |
|---|---|---|---|
| OG meta tags | 7/10 (SVG image) | 9/10 (PNG, all refs updated) | +2 |
| Landing page | 7/10 (placeholder hero, not deployed) | 8/10 (hero fixed, SEO, still not deployed) | +1 |
| README | 8/10 | 8/10 | 0 |
| Competitive positioning | 7/10 | 7/10 | 0 |
| Social posts | 9/10 (no UTM) | 9/10 (UTM-tagged) | 0 |
| Demo video | 7/10 (storyboard) | 7/10 (storyboard) | 0 |
| CONTRIBUTING.md | 8/10 | 8/10 | 0 |
| Community channels | 0/10 | 0/10 | 0 |
| Deployed landing page | 0/10 | 0/10 | 0 |
| LICENSE | N/A | 10/10 (MIT) | NEW |
| SEO (robots, sitemap, JSON-LD) | N/A | 7/10 | NEW |
| Security posture | N/A | 7/10 (share-token, rate limit) | NEW |

**Persona score history:**
| Persona | S16 | S17 | S18 | S19 | S20 | Trend |
|---|---|---|---|---|---|---|
| Alex Chen | — | 6.8 | 8.2 | 7.2 | — | Not tested |
| Priya Sharma | 2.6 | 6.2 | 6.8 | 6.0 | 5.0 | ↓↓ (-1.0) Claude Code selector friction |
| Jordan Kim | 4.0 | 4.5 | — | 7.6 | 6.1 | ↓ (-1.5) Shell CWD, heavyweight routing |
| Marco Reyes | 1.5 | 2.5 | 3.5 | — | 3.6 | → (+0.1) 6th sprint under 5.0 |
| Sprint Average | 2.7 | 5.0 | 6.17 | 6.93 | 4.9 | ↓↓ (-2.03) REGRESSION |

**Known regressions introduced by evolution sprints:**
- Sprint 20: No code regressions, but persona scores regressed because existing bugs were not fixed. New tools implemented but unreachable due to routing issues.

---

## Strategic Read

*PL's current assessment as of Sprint 20 meta-review.*

**P0-EMERGENCY (Sprint 21 must deliver — no deferral):**
1. **server.ts decomposition + routing fix** — 5 sprints deferred. This is no longer a technical debt item — it is the **root cause** of 0/3 bug fixes and all persona regressions. Extract routing logic into a separate module. Fix Photo Studio misrouting, shell CWD, and silent filesystem failures IN THE SAME DELIVERABLE. No "No Changes" exceptions for server.ts.
2. **Fix Photo Studio misrouting (BUG-03)** — 6th sprint unresolved. Makes new filesystem tools unreachable. Marco's #1 blocker.
3. **Fix silent filesystem failures (BUG-02)** — Upstream routing issue, not in filesystem-tools.ts. Error handling exists but errors don't propagate to client.
4. **Fix shell CWD (BUG-01)** — 4th sprint. Code logic looks correct, runtime behavior wrong.

**P0-VALIDATION (Sprint 21):**
5. **Retest Marco Reyes** — 6 sprints under 5.0. If Sprint 21 doesn't move him above 5.0, creative professional persona is effectively abandoned.
6. **Retest ALL personas against new tools** — 8 new OS-level tools were implemented but never tested by personas because bug fixes weren't done.
7. **Validate Sprint 19 fixes** — Alex context contamination fix and Priya Build-First Rule still never retested (2 sprints unvalidated).

**P1 (Sprint 21):**
8. **Permission tiers for shell_execute** — Currently any command executes with equal trust. 4-tier approval system deferred from Sprint 20.
9. **Claude Code project selector fix** — Blocks autonomous building for Priya.
10. **Session management** — Background Claude Code terminals persist and block interactions.

**Medium-term strategic bets:**
- **MCP client integration** — 9+ sprints deferred. Blocked by server.ts decomposition. Target Sprint 22+.
- **Prompt caching** — 90% input token savings. Low risk, high ROI. Target Sprint 21-22.
- **Research synthesis reliability** — Deep research still returns general knowledge, not web research.
- **Build-to-app pipeline** — "build X" should produce interactive apps, not text cards.

**Things that are fine as-is (do not over-engineer):**
- Photo engine (H&D curves, LAB color, luminosity masking) — superior to external APIs
- Virtual scrolling + CSS containment — working, don't touch
- App ecosystem (15 apps, 34 agent-callable tools) — well-segmented, no merges needed
- Photo Studio / Media Gallery boundary — RESOLVED and VALIDATED
- Schema validation — test suite active, graceful degradation as defense-in-depth
- Error message classification — test suite active, no regressions
- New OS-level tools (8 tools) — well-implemented, tested, following existing patterns
- Playwright/Puppeteer dual-engine abstraction — ready for Playwright activation post-install
- OG image and tags — now PNG, fully functional (Sprint 19)
- LICENSE file — MIT, present at root (Sprint 19)
- SEO basics — robots.txt, sitemap.xml, JSON-LD all in place (Sprint 19)

**Sales Infrastructure Status (unchanged from Sprint 19 — deprioritized):**
| Component | Status | Target |
|---|---|---|
| Landing page | Files ready, not deployed | Sprint 22+ |
| Analytics | Script in HTML, no account | Sprint 22+ |
| CRM | Does not exist | Sprint 22+ |
| Community | No channels | Sprint 22+ |
| Auto-sales | No conversion path | Sprint 22+ |
| Email capture | No signup form | Sprint 22+ |
| Social presence | 8 posts ready, 0 posted | Sprint 22+ |

---

## What's Been Tried

**Deferred (attempted but not completed, with sprint context):**
- SSE Streaming (ADR-004): Designed Sprint 13, deprioritized indefinitely (6+ sprints).
- MCP client: Design since Sprint 12, no code. Target Sprint 22+ (after server.ts decomposition).
- SQLite-backed CardContextStore: Design ready, deferred every sprint.
- Playwright E2E framework: Proposed Sprint 14, deferred (5+ sprints). Playwright/Puppeteer dual-engine abstraction built Sprint 20 but Playwright not installed.
- server.ts decomposition IMPLEMENTATION: Designed Sprint 17, deferred Sprint 18, 19, 20. **5 sprints deferred. Target Sprint 21 P0-EMERGENCY.**
- Photo Studio misrouting fix: Designed Sprint 16, attempted Sprint 16-20. **6 sprints unresolved.** Requires server.ts routing changes.
- Shell CWD fix: Code logic correct (Sprint 19), runtime still wrong (Sprint 20). **4 sprints.** Needs runtime investigation.
- Silent filesystem failure fix: Error handling exists in filesystem-tools.ts, bug is upstream in routing/error propagation. **3 sprints.** Needs server.ts trace.

**Tried and confirmed working (don't revert):**
- @tanstack/react-virtual for CardTimeline: Virtual scrolling implemented and stable
- CSS containment (.card-contain): Implemented and stable
- Code splitting for heavy card types: 9 types lazy-loaded, working
- Mobile chat transition animation (.mobile-chat-enter): Working
- Long-press-to-PTT on textarea (Doubao-style): Working since Sprint 14
- Doubao visible mode toggle (inputMode state): Implemented Sprint 15, working
- ChatInput stale ref fix via state mirror pattern (pttAccumulatedText): Sprint 15 → usePushToTalk Sprint 16
- OrchestrationCard React.memo wrapper: Implemented Sprint 15, verified Sprint 16–19
- Photo Studio misrouting fix (negative constraints in import_photos): Sprint 16, validated Sprint 17
- /code client connection fix (context injection, 3-tier fallback): Sprint 16, partially validated Sprint 17
- Error message classification (system vs user errors): Sprint 16, validated Sprint 17-19
- Tool schema graceful degradation (validateFunctionDeclaration): Sprint 16, validated Sprint 17-19
- Touch target enforcement Phase 1+2: Sprint 16-17, complete
- ChatInput Phase 1+2 decomposition (1205→525 LOC): Sprint 16-17
- Assignment matrix gate (zero orphans before Phase 5): Sprint 16, PERMANENT process gate (4 consecutive)
- Schema validation test (245 tests, all app.json schemas): Sprint 17
- Error classification test (34 tests, both layers): Sprint 17
- Project selector auto-context (defaultProjectCwd fallback): Sprint 17
- Cross-session contamination fix (composite key): Sprint 17, VALIDATED Sprint 18
- server.ts decomposition DESIGN (269 LOC, 5 modules): Sprint 17
- Sprint 18 marketing approaches: OG meta tags, README restructure, landing page HTML, competitive one-pager, social posts, demo storyboard, CONTRIBUTING.md, WelcomeCard reorder, ThinkingCard escalation, research error propagation
- **Sprint 19 fixes and improvements:**
  - Context contamination root cause fix: `getUserProfileContext()` replaces `getMemoryContext()` in standalone-agent.ts. Eliminates ENSO_MEMORY.md injection into system prompts. Deployed but not retested.
  - Session boundary marker: Explicit "NEW conversation" instruction in system prompt prevents hallucinated prior interactions. Deployed but not retested.
  - Build-First Rule: System prompt instruction to skip clarifying questions on build/create/make requests. Probabilistic (prompt-based). Deployed but not retested.
  - OG image SVG → PNG: Real PNG 1200×630 in both `public/` and `docs/`. Verified via `file` command.
  - MIT LICENSE file at project root.
  - Landing page hero: CSS terminal mockup replacing placeholder text.
  - docs/ directory for GitHub Pages: index.html, og-image.png, robots.txt, sitemap.xml, JSON-LD.
  - UTM tracking on all 8 social post URLs.
  - share-token security: Origin header + Bearer token defense-in-depth guard.
  - Rate limiting: Hand-rolled 60 req/min per IP on public endpoints.
  - Shell CWD fix: package.json existence check before using projectRoot, process.cwd() fallback.
  - WS disconnect feedback: Error card shown when message sent with null WS client.
  - Plausible analytics script in docs/index.html (account not yet created).
- **Sprint 20 OS-level agent tools (8 new tools, 663 LOC):**
  - `enso_fs_write_file`: Write text to disk (create/overwrite/append modes). 1MB limit, protected path check, auto-creates parent dirs.
  - `enso_fs_copy_path`: Copy files/directories. Preserves name when copying into directory. Uses cpSync for recursive.
  - `enso_fs_search_content`: Grep-like recursive search. Regex/literal, glob filter, 50 default / 200 max results, depth/file/size limits, binary skip.
  - `enso_shell_execute`: Structured command execution via `spawn` with array args. `shell:false` (injection-proof), 30s default / 120s max timeout, 100KB output cap, CWD validation, audit logging.
  - `enso_browser_extract`: Extract page text/HTML/CSS-selector content. 50K chars default, 100K max.
  - `enso_browser_key`: Send keyboard shortcuts. Parses combo strings, holds modifiers.
  - `enso_browser_evaluate`: Execute JS on page. Async IIFE wrapper, browser sandbox only.
  - `enso_browser_wait`: Wait for selector/navigation/idle. Graceful timeout handling.
  - Playwright/Puppeteer dual-engine abstraction: `detectEngine()` with dynamic import fallback. ~50 LOC. Puppeteer default.
  - Registry signature updates: filesystem +3, browser +4 supportedActions.
  - Template updates: write_file/copy_path/search_content views, extract/evaluate content areas.
  - 13 new unit tests for filesystem tools (write_file 6, copy_path 3, search_content 3, + sprint assertion updates).

**Tried and found not needed:**
- Replacing photo engine with external neural style transfer APIs: Photo engine is already superior
- Implementing adaptive thinking: Already active in claude-code.ts L366

**Architectural decisions pending:**
- server.ts decomposition IMPLEMENTATION: Design ready. 5 modules, extraction order defined. **Sprint 21 P0-EMERGENCY (5th deferral).** This blocks all routing bug fixes.
- Permission tiers for OS actions: 4-tier system designed by AI Strategist, deferred Sprint 20. Target Sprint 21.
- Playwright installation: Dual-engine abstraction ready. Manual `npm install playwright` post-sprint activation step.
- ChatInput Phase 3: 525 → <500 LOC. Shell mode banner or voice toggle. Low priority.
- Landing page deployment: **Decision made: GitHub Pages from /docs.** Execution pending (manual step). Deprioritized.
- Analytics platform: **Decision made: Plausible.** Account creation pending (manual step). Deprioritized.

---

## Persona Evolution Notes

*Running observations about each persona's relationship with the product.*

**Marco Reyes (creative-professional) — CRITICAL RESCUE FAILURE (Sprint 20):**
- Sprint 15: 4.2/10. Sprint 16: 1.5/10. Sprint 17: 2.5/10. Sprint 18: 3.5/10. Sprint 19: NOT TESTED. **Sprint 20: 3.6/10 (+0.1, effectively flat).**
- **6th consecutive sprint under 5.0.** If Sprint 21 doesn't move him above 5.0, creative professional persona is effectively abandoned.
- S1: Silent filesystem failure (zero output, zero error — BUG-02). S3/S4: Photo Studio misrouting captured file management requests (BUG-03).
- Speed improved (9.2s avg) but 1/5 scenarios produced useful output.
- New tools (write_file, copy_path) implemented but unreachable due to routing bugs.
- **Sprint 21 MANDATORY**: Fix routing bugs FIRST, then retest. Marco is the canary — if routing works, his score should jump 2+ points.

**Priya Sharma (indie-developer) — CONTINUED REGRESSION (Sprint 20):**
- Sprint 15: 4.8/10. Sprint 16: 2.6/10. Sprint 17: 6.2/10. Sprint 18: 6.8/10. Sprint 19: 6.0/10. **Sprint 20: 5.0/10 (-1.0).**
- Build-First Rule partially working (no more clarifying questions) but Claude Code project selector blocks autonomous building (UX-01).
- Shell CWD inconclusive. Deep research still defaults to general knowledge, no real web research.
- **Sprint 21 focus**: Fix Claude Code project selector. Validate shell CWD at runtime.

**Jordan Kim (developer) — REGRESSION FROM PEAK (Sprint 20):**
- Sprint 15: 6.4/10. Sprint 16: 4.0/10. Sprint 17: 4.5/10. Sprint 18: NOT TESTED. Sprint 19: 7.6/10. **Sprint 20: 6.1/10 (-1.5).**
- Shell CWD bug persists 3rd sprint (D:\Github vs D:\Github\Enso). Simple ops routed through heavyweight Claude Code (30s for file listing).
- Touch targets: WCAG compliance dropped from 76% to 37% during active use (close buttons 10x16px).
- Background Claude Code sessions persist without management UI.
- **Sprint 21 focus**: Shell CWD runtime fix. Routing optimization for simple filesystem queries.

**Alex Chen (startup-founder) — NOT TESTED Sprint 20:**
- Sprint 12: ~4.0/10. Sprint 17: 6.8/10. Sprint 18: 8.2/10. Sprint 19: 7.2/10. Sprint 20: NOT TESTED.
- Context contamination fix (getUserProfileContext + session boundary) deployed Sprint 19, now **2 sprints unvalidated**.
- **Sprint 21 focus**: RETEST to validate context contamination fix.

---

## Uncommitted Changes Tracker

*Significant uncommitted work that should not be lost or forgotten across sprints.*

**Sprint 20 new changes (cumulative with Sprint 15-19):**

Sprint 15-19 uncommitted changes still present (see Sprint 19 brain entry for full list).

Sprint 20 new changes (663 LOC across 8 files):
- `server/src/filesystem-tools.ts` — +3 tools: write_file, copy_path, search_content (~170 LOC)
- `server/src/system-tools.ts` — +1 tool: shell_execute (~85 LOC)
- `server/src/browser-tools.ts` — +4 tools: extract, key, evaluate, wait + PuppeteerPage type extensions + engine abstraction (~220 LOC)
- `server/src/native-tools/registry.ts` — +7 supportedActions across 2 signatures (~2 LOC)
- `server/src/native-tools/templates/filesystem.ts` — +3 new result views (~50 LOC)
- `server/src/native-tools/templates/browser.ts` — +extract/evaluate content area (~12 LOC)
- `server/src/filesystem-tools.test.ts` — +13 new test cases (~120 LOC)
- `server/src/sprint-enhancements.test.ts` — Updated tool count assertions (~4 LOC)
- `server/src/shell-pty.ts` — Minor changes
- `projects/enso/project.json` — Sprint data updates
- `projects/enso/brain.md` — Sprint 20 meta-review updates

---

*Last updated: Sprint 20 meta-review (2026-04-04)*
*Next update: Phase 6 meta-review of Sprint 21*
