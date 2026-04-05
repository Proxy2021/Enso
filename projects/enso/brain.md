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

**2. Persona re-test deferral spiral — IMPROVING**
- Marco Reyes re-test was deferred for 5 consecutive sprints (Sprints 10–14)
- Sprint 15–18: Marco tested every sprint. Persona testing is now a consistent sprint gate.
- Sprint 19-21: **3 consecutive sprints without retests.** This was the #1 process gap.
- **Sprint 22: Retests PARTIALLY CONDUCTED (2/3).** Marco 4.5/10, Jordan 5.5/10 tested. Alex NOT TESTED (test script used port 5173 instead of 3001). Pattern improving but not fully resolved. Test script port configuration must be validated before persona tests.

**3. Stale backlog items persisting across 3+ sprints — server.ts RESOLVED**
- media-ai-gateway error string: RESOLVED Sprint 14
- ADR-004 (SSE Streaming): deprioritized indefinitely (6+ sprints deferred)
- MCP client integration: 7+ sprints, design only. Was blocked by server.ts decomposition — **now unblocked.** Target Sprint 23.
- **Sprint 22: server.ts decomposition FINALLY EXECUTED** after 6 sprints deferred (designed Sprint 17, deferred Sprint 18-21). 3,876 → 1,893 LOC (-51%). ws-handlers.ts extracted with all 60+ switch cases. MCP integration path now clear.

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

**11. Design-to-implementation disconnect (Sprint 20) — COUNTER-MEASURES VALIDATED Sprint 21-22**
- Sprint 20 design (Phase 4) explicitly specified 3 P0 bug fixes in Sections 7.1-7.3 with server.ts code changes
- BUT the same design's architecture diagram listed server.ts under "No Changes"
- Both implementation tracks cited "outside this track's scope" to skip ALL bug fixes
- **Sprint 21: Counter-measures WORKED.** File assignment matrix required explicit file-level assignment for every P0 item. Track A assigned to standalone-agent.ts lines 656-841, Track B assigned to standalone-agent.ts lines 231-252. Non-overlapping regions, no "No Changes" exceptions. All 3 P0 bugs with file assignments were implemented. Fix-cycle resolved BUG-01 with dynamic PROJECT_ROOT across 3 files + 70 new tests.
- **Sprint 22: Two-track parallel delivery again succeeded.** Track A (infrastructure: context-bus.ts, ws-handlers.ts, server.ts, types.ts) and Track B (bug fixes: tool-router.ts, standalone-agent.ts, shell-pty.ts) had zero file overlap. All deliverables completed. Assignment matrix PERMANENT.
- **NEW WIRING GAP:** Cross-track integration points missed — `cleanupClientContextSubscriptions()` imported but never called on disconnect, `markConversationFresh()` exported but never wired in production. Code exists but caller-side integration omitted. **Sprint 23: Add integration verification step to review checklist.**

**12. Cross-track wiring gaps (Sprint 22) — NEW**
- Track A exported `cleanupClientContextSubscriptions(clientId)` for cleanup on client disconnect — never called in server.ts disconnect handler.
- Track B exported `markConversationFresh()` and `isConversationFresh()` for BUG-04 session isolation — never wired into production `chat.send` handler. BUG-04 fix is dead code.
- Root cause: Two-track parallel implementation ensures no file conflicts but does NOT ensure cross-track integration points are connected.
- Counter-measure: Sprint 23 review must include "integration point verification" — every exported function must have at least one caller in production code.

---

## Improvement Velocity

Sprint score history (Sprints 1–22): `[8.0, 6.5, 7.0, 8.5, 7.5, 7.0, 6.6, 6.6, 5.87, 8.0, 6.0, 7.5, 7.0, 4.5, 6.0, 7.0, 7.5, 7.5, 7.0, 6.5, 7.0, 7.0]`
Mean: 6.82 — Held steady. Infrastructure delivery excellent (server.ts -51%, context-bus). Bug fix runtime validation gaps persist.

**Trending up:**
- **server.ts decomposition ACHIEVED:** 3,876 → 1,893 LOC (-51%). ws-handlers.ts extracted with all 60+ switch cases. 6-sprint backlog item FINALLY resolved. MCP integration path now clear.
- **Cross-card context sharing IMPLEMENTED:** context-bus.ts (242 LOC) — EventEmitter pub/sub with per-client isolation, 256KB size guards, TTL eviction, last-value cache. 4 new WS message types. 21/21 unit tests.
- Sprint execution reliability: Two-track parallel delivery succeeded. Zero file overlap. All deliverables completed. Assignment matrix PERMANENT.
- Build stability: **9 consecutive green-build sprints** (855/855 tests pass Sprint 22, 28 test files)
- Test coverage: 28 test files, 855 tests (+230 from Sprint 21). Sprint 22 added context-bus.test.ts (21 tests) + Track B tests (32 tests).
- Persona retests: **Partially resumed** (2/3 tested) after 3-sprint gap. BUG-03 VALIDATED by both personas.
- Bug fix delivery: BUG-03 VALIDATED at runtime. NEW-BUG-01 fix deployed (TRIVIAL_SHELL_PATTERNS). NEW-BUG-02 fix deployed (Windows path regex). BUG-02 timeout added to tool-router path.
- OS-level agent capabilities: All 8 tools functional. BUG-03 fix validated — build requests now correctly route to Claude Code.
- Playwright/Puppeteer dual-engine abstraction: Structural readiness. Zero-risk migration path when Playwright is installed.

**Trending down / plateauing:**
- **Marco Reyes: 3.8 → 4.5 (post-fix retest). 8th consecutive sprint under 5.0.** BUG-03 VALIDATED but BUG-02 still manifests on file browsing/listing (tool-router path). Rescue NOT succeeded.
- **Jordan Kim: 4.0* → 5.5 (post-fix retest).** BUG-03 VALIDATED. BUG-01 still broken at runtime (tsx cache serves stale shell-pty.ts). Rule 4 simple commands still misrouted (NEW-BUG-01). WCAG touch targets 43%.
- Alex Chen: 5.6* (Sprint 21 pre-fix). **NOT TESTED Sprint 22** — test script used wrong port (5173 vs 3001). BUG-04 fix is dead code (markConversationFresh never wired).
- Priya Sharma: NOT TESTED Sprint 21 or 22.
- **tsx cache deployment gap:** Fixes exist in source but tsx cache serves stale compiled code. BUG-01 fix proven correct in tests but broken at runtime. Must clear `C:\Users\Administrator\AppData\Local\Temp\tsx-Administrator\` before restart.
- Deployed marketing: Still 0/10 — deprioritized.
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
| Persona | S17 | S18 | S19 | S20 | S21* | S22 | Trend |
|---|---|---|---|---|---|---|---|
| Alex Chen | 6.8 | 8.2 | 7.2 | — | 5.6* | — | Not tested S22 (wrong port) |
| Priya Sharma | 6.2 | 6.8 | 6.0 | 5.0 | — | — | Not tested S21/S22 |
| Jordan Kim | 4.5 | — | 7.6 | 6.1 | 4.0* | 5.5 | ↑ (+1.5) BUG-03 validated, BUG-01 still broken runtime |
| Marco Reyes | 2.5 | 3.5 | — | 3.6 | 3.8* | 4.5 | ↑ (+0.7) BUG-03 validated, 8th sprint under 5.0 |
| Sprint Average | 5.0 | 6.17 | 6.93 | 4.9 | 4.47* | 5.0 | ↑ (+0.53) retests show improvement |

*S21 scores are PRE-FIX only. S22 scores are POST-FIX retests for Marco and Jordan only (2/3 tested).

**Known regressions introduced by evolution sprints:**
- Sprint 20: No code regressions, but persona scores regressed because existing bugs were not fixed. New tools implemented but unreachable due to routing issues.
- Sprint 21: No code regressions. 625/625 tests pass. Persona scores appear regressed but are pre-fix snapshots only.
- Sprint 22: No code regressions. 855/855 tests pass. Two wiring gaps discovered (dead code) but no functional regressions. Persona scores improved where tested.

---

## Strategic Read

*PL's current assessment as of Sprint 22 meta-review.*

**P0-EMERGENCY (Sprint 23 must deliver — no deferral):**
1. **tsx cache deployment gap** — BUG-01 fix exists in source but tsx cache serves stale compiled code at runtime. Must clear tsx cache + restart gateway. This is the root cause of BUG-01 runtime failure. **Sprint 23: Clear tsx cache as deployment step, retest.**
2. **BUG-02 tool-router timeout gap** — Silent guard timer added but file browsing/listing through tool-router path still silently fails (99s timeout). Marco S1/S2 still hit this. Never-silent guard only covers standalone-agent path, not tool-router → tool execution path.
3. **BUG-04 wiring** — markConversationFresh()/isConversationFresh() exported but NEVER called in production chat.send handler. Fix is dead code. Alex still affected by context contamination.
4. **cleanupClientContextSubscriptions wiring** — Imported in server.ts but never called on client disconnect. Context subscriptions leak.
5. **Alex persona test port fix** — Test script uses port 5173 (Vite dev) instead of 3001 (server). Fix: update test configuration.

**P0-VALIDATED (Sprint 22 — confirmed by persona retests):**
6. ~~**BUG-03 (Photo Studio misrouting)**~~ — **VALIDATED** by both Marco and Jordan. BUILD_INTENT regex + isOperationalPrompt keywords working correctly.

**P0-PARTIALLY RESOLVED (Sprint 22 — code exists, runtime issues):**
7. **BUG-01 (Shell CWD)** — Dynamic PROJECT_ROOT code correct (tests pass) but tsx cache serves stale code. Runtime still broken per Jordan retest.
8. **BUG-02 (Silent failures)** — Never-silent guard works for standalone-agent path. Tool-router path still produces silent failures per Marco retest.
9. **NEW-BUG-01 (Simple command misrouting)** — TRIVIAL_SHELL_PATTERNS deployed but Jordan retest shows simple commands still hit Claude Code. May need tsx cache clear.
10. **NEW-BUG-02 (write_file path)** — Windows path regex fix deployed but untested at runtime.

**P1 (Sprint 23):**
11. **MCP client integration** — 10+ sprints deferred. server.ts decomposition NOW COMPLETE — unblocked. Target Sprint 23.
12. **Prompt caching** — 80-90% input token savings. Low risk, high ROI. AI Strategist P1 recommendation.
13. **UX-01: Claude Code project selector** — Client-side issue. Blocks autonomous building for Priya.
14. **WCAG touch target compliance** — Jordan reported 43% compliance during active use.
15. **Marco rescue** — 8th sprint under 5.0. Must cross 5.0 in Sprint 23. Requires BUG-02 tool-router fix + tsx cache clear.

**Medium-term strategic bets:**
- **A2A protocol alignment** — Google A2A, MCP async tasks. Cross-agent interop for future multi-agent scenarios.
- **Persistent shared state** — Context-bus is in-memory only. Long-running workflows lose state on restart. SQLite backing for context channels.
- **Research synthesis reliability** — Deep research still returns general knowledge, not web research.
- **Build-to-app pipeline** — "build X" should produce interactive apps, not text cards.
- **Permission tiers for shell_execute** — 4-tier approval system deferred from Sprint 20.

**Things that are fine as-is (do not over-engineer):**
- Photo engine (H&D curves, LAB color, luminosity masking) — superior to external APIs
- Virtual scrolling + CSS containment — working, don't touch
- App ecosystem (18 apps, 34 agent-callable tools) — well-segmented, no changes needed for context sharing
- Photo Studio / Media Gallery boundary — RESOLVED and VALIDATED
- Schema validation — test suite active, graceful degradation as defense-in-depth
- Error message classification — test suite active, no regressions
- New OS-level tools (8 tools) — well-implemented, tested, following existing patterns
- Playwright/Puppeteer dual-engine abstraction — ready for Playwright activation post-install
- OG image and tags — now PNG, fully functional (Sprint 19)
- LICENSE file — MIT, present at root (Sprint 19)
- SEO basics — robots.txt, sitemap.xml, JSON-LD all in place (Sprint 19)
- BUG-03 fix — VALIDATED by 2 personas (Sprint 22). BUILD_INTENT regex fast path working.
- Cross-card context sharing infrastructure — context-bus.ts, ws-handlers.ts, types.ts all working (Sprint 22). 21/21 tests pass.
- server.ts decomposition — COMPLETED Sprint 22 (3,876 → 1,893 LOC, -51%)
- Never-silent guard — works for standalone-agent path (Sprint 21). Needs extension to tool-router path.
- Dynamic PROJECT_ROOT — correct in source (Sprint 21). Needs tsx cache clear for runtime activation.

**Sales Infrastructure Status (unchanged from Sprint 19 — deprioritized):**
| Component | Status | Target |
|---|---|---|
| Landing page | Files ready, not deployed | Sprint 23+ |
| Analytics | Script in HTML, no account | Sprint 23+ |
| CRM | Does not exist | Sprint 23+ |
| Community | No channels | Sprint 23+ |
| Auto-sales | No conversion path | Sprint 23+ |
| Email capture | No signup form | Sprint 23+ |
| Social presence | 8 posts ready, 0 posted | Sprint 23+ |

---

## What's Been Tried

**Deferred (attempted but not completed, with sprint context):**
- SSE Streaming (ADR-004): Designed Sprint 13, deprioritized indefinitely (6+ sprints).
- MCP client: Design since Sprint 12, no code. **NOW UNBLOCKED** by server.ts decomposition (Sprint 22). Target Sprint 23.
- SQLite-backed CardContextStore: Design ready, deferred every sprint. Context-bus.ts (Sprint 22) is in-memory only — SQLite backing still needed for persistence.
- Playwright E2E framework: Proposed Sprint 14, deferred (5+ sprints). Playwright/Puppeteer dual-engine abstraction built Sprint 20 but Playwright not installed.
- BUG-04 full fix (context contamination): Prompt-level mitigation Sprint 21. markConversationFresh()/isConversationFresh() exported Sprint 22 but **never wired** — dead code. Full fix requires wiring + session-keyed history isolation. Target Sprint 23 P0.
- UX-01 (Claude Code project selector): Client-side issue confirmed Sprint 21. Server sends defaultProjectCwd but client renders irrelevant options. No server-side fix possible.
- tsx cache deployment: Known issue since Sprint 21. Stale compiled code in tsx cache prevents runtime activation of fixes. Must be addressed as deployment step, not code change.

**Tried and confirmed working (don't revert):**
- @tanstack/react-virtual for CardTimeline: Virtual scrolling implemented and stable
- CSS containment (.card-contain): Implemented and stable
- Code splitting for heavy card types: 9 types lazy-loaded, working
- Mobile chat transition animation (.mobile-chat-enter): Working
- Long-press-to-PTT on textarea (Doubao-style): Working since Sprint 14
- Doubao visible mode toggle (inputMode state): Implemented Sprint 15, working
- ChatInput stale ref fix via state mirror pattern (pttAccumulatedText): Sprint 15 → usePushToTalk Sprint 16
- OrchestrationCard React.memo wrapper: Implemented Sprint 15, verified Sprint 16–19
- Photo Studio misrouting fix (negative constraints in import_photos): Sprint 16, validated Sprint 17. **Further fixed Sprint 21: BUILD_INTENT regex fast path + 14 new isOperationalPrompt keywords.**
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
- **Sprint 21 Debt-Recovery fixes (3 P0 bugs + 70 new tests):**
  - BUG-01 fix (Shell CWD): Dynamic PROJECT_ROOT via `import.meta.url` in shell-pty.ts, filesystem-tools.ts, system-tools.ts. Replaces hard-coded `resolve("D:\\Github\\Enso")`. Validated by shell-pty.test.ts (10 tests).
  - BUG-02 fix (Silent failures): `delivered` flag + `finally` block in standalone-agent.ts handleStandaloneInbound(). Guarantees at least one message reaches client even if deliverEnsoReply() and catch block both throw.
  - BUG-03 fix (Photo Studio misrouting): BUILD_INTENT regex (`/\b(build|create|make|...)\b.*\b(app|dashboard|...)\b/i`) fast path bypasses Gemini tool selection. 14 new keywords in isOperationalPrompt() (write, create, build, delete, move, copy, rename, execute, open, browse, stat, disk, process, system).
  - BUG-04 mitigation (Context contamination): Session boundary expanded to 5-point prohibition list with "(CRITICAL)" header. Prompt-level only — full fix requires session-keyed history isolation.
  - System prompt Rule 4 update: Allows enso_shell_execute for simple one-liner commands, reserves Claude Code for complex multi-step tasks. Reduces overhead from 51-61s to <1s for trivial commands.
  - Fix-cycle test additions: 5 new test files (70 tests): shell-pty.test.ts (10), filesystem-error-handling.test.ts (15), intent-routing.test.ts (27), session-isolation.test.ts (6), browser-tools.test.ts (16). Total: 625/625 tests pass.
- **Sprint 22 Cross-Card Context Sharing + server.ts decomposition:**
  - **context-bus.ts** (NEW, 242 LOC): SharedContextBus — EventEmitter pub/sub. Per-client channel isolation (`${clientId}:${channelName}`), 256KB payload limit, 50 channel/client limit, 30-min TTL eviction (5-min sweep), last-value cache, monotonic versioning. Singleton export.
  - **ws-handlers.ts** (NEW, 2,097 LOC): Extracted all 60+ WebSocket switch cases from server.ts. WsHandlerContext interface bundles closure dependencies. Moved helpers: resolveConversationId, scanProjects, routeToResearch, routeToImageSearch, analyzeImageForResearch. Module-level contextSubscriptions map. cleanupClientContextSubscriptions(clientId) exported.
  - **server.ts** refactored (3,876 → 1,893 LOC, -51%): Switch block replaced with single `handleWebSocketMessage(msg, ctx)` call. 15 unused imports removed. 5 helper functions moved to ws-handlers.ts.
  - **types.ts** (+20 LOC): 4 new ClientMessage type variants (context.publish/subscribe/unsubscribe/list), new optional fields for context sharing on ClientMessage and ServerMessage.
  - **context-bus.test.ts** (NEW, 203 LOC): 21 unit tests covering publish, subscribe, getLatest, listChannels, unsubscribeAll, removeChannel, TTL eviction, client isolation, destroy.
  - **BUG-02 Part B**: 30-second silent guard timer wrapping `chat.send` handler in ws-handlers.ts. Sends error message if no response within 30s.
  - **Track B bug fixes (5 fixes, 32 new tests):**
    - BUG-04: `_meta` tagging on conversation messages + markConversationFresh/isConversationFresh exports (wiring gap — never called in production)
    - NEW-BUG-01: TRIVIAL_SHELL_PATTERNS regex in tool-router.ts for simple command fast-path to enso_shell_execute
    - BUG-02: 15-second timeout on tool-router initiated file operations
    - NEW-BUG-02: Windows absolute path regex fix in write_file
    - BUG-01: Diagnostic logging + tsx cache clear documentation
  - Total: 855/855 tests pass (28 test files).

**Tried and found not needed:**
- Replacing photo engine with external neural style transfer APIs: Photo engine is already superior
- Implementing adaptive thinking: Already active in claude-code.ts L366

**Architectural decisions pending:**
- ~~server.ts decomposition IMPLEMENTATION~~ — **COMPLETED Sprint 22.** 3,876 → 1,893 LOC. ws-handlers.ts extracted.
- MCP client integration: **NOW UNBLOCKED** by server.ts decomposition. Design since Sprint 12. Target Sprint 23.
- Permission tiers for OS actions: 4-tier system designed by AI Strategist, deferred Sprint 20-22. Target Sprint 23.
- BUG-04 full fix: markConversationFresh/isConversationFresh exported Sprint 22 but never wired. Need to connect to chat.send handler + session-keyed history isolation.
- Cross-track integration verification: New process gate needed — every exported function must have at least one production caller.
- Context-bus persistence: Currently in-memory only. SQLite backing for crash resilience on long-running workflows.
- Prompt caching: 80-90% input token savings. AI Strategist P1 recommendation. Anthropic + Gemini both support.
- Playwright installation: Dual-engine abstraction ready. Manual `npm install playwright` post-sprint activation step.
- ChatInput Phase 3: 525 → <500 LOC. Shell mode banner or voice toggle. Low priority.
- Landing page deployment: **Decision made: GitHub Pages from /docs.** Execution pending (manual step). Deprioritized.
- Analytics platform: **Decision made: Plausible.** Account creation pending (manual step). Deprioritized.

---

## Persona Evolution Notes

*Running observations about each persona's relationship with the product.*

**Marco Reyes (creative-professional) — RESCUE NOT SUCCEEDED (Sprint 22):**
- Sprint 16: 1.5. Sprint 17: 2.5. Sprint 18: 3.5. Sprint 20: 3.6. Sprint 21: 3.8*. **Sprint 22: 4.5/10 (post-fix retest).**
- **8th consecutive sprint under 5.0.** BUG-03 VALIDATED (S4 correctly routed to Claude Code for build requests). BUG-02 PARTIALLY BROKEN — S1/S2 file browsing/listing still silently fails (99s timeout, tool-router path not covered by never-silent guard). S3 write_file to wrong path (NEW-BUG-02). S5 research excellent (23 sources).
- Improvement trajectory: 1.5 → 2.5 → 3.5 → 3.6 → 3.8 → 4.5. Consistent upward trend but still below 5.0.
- **Sprint 23 CRITICAL**: Must fix BUG-02 on tool-router path + clear tsx cache. If Marco crosses 5.0, 9-sprint rescue finally succeeds.

**Priya Sharma (indie-developer) — NOT TESTED Sprint 21 or 22:**
- Sprint 16: 2.6. Sprint 17: 6.2. Sprint 18: 6.8. Sprint 19: 6.0. Sprint 20: 5.0. **Sprint 21-22: NOT TESTED.**
- UX-01 (Claude Code project selector) confirmed as client-side issue — no server fix possible.
- Shell CWD fix (BUG-01) deployed but may need tsx cache clear for runtime activation.
- **Sprint 23**: Must include Priya in persona test rotation. 2 sprints untested.

**Jordan Kim (developer) — IMPROVED BUT RUNTIME GAPS (Sprint 22):**
- Sprint 16: 4.0. Sprint 17: 4.5. Sprint 19: 7.6. Sprint 20: 6.1. Sprint 21: 4.0*. **Sprint 22: 5.5/10 (post-fix retest).**
- BUG-03 VALIDATED (build requests correctly route). BUG-01 STILL BROKEN at runtime — `pwd` returns `D:\Github` not `D:\Github\Enso`. Root cause: tsx cache serves stale shell-pty.ts. Rule 4 simple commands (ls, pwd) still misrouted to Claude Code (NEW-BUG-01 fix may need tsx cache clear).
- Touch targets: WCAG 43% during active use. Not addressed Sprint 22.
- **Sprint 23 focus**: tsx cache clear should unlock BUG-01 and NEW-BUG-01 fixes at runtime. Retest to validate.

**Alex Chen (startup-founder) — NOT TESTED Sprint 22:**
- Sprint 17: 6.8. Sprint 18: 8.2. Sprint 19: 7.2. Sprint 21: 5.6*. **Sprint 22: NOT TESTED** (test script used port 5173 instead of 3001).
- BUG-04 fix code exists (markConversationFresh/isConversationFresh) but is DEAD CODE — never wired into production chat.send handler. Context contamination still present.
- Orchestration still produces essays instead of deliverables.
- **Sprint 23 MANDATORY**: Fix test script port. Wire BUG-04 into production. Retest.

---

## Uncommitted Changes Tracker

*Significant uncommitted work that should not be lost or forgotten across sprints.*

**Sprint 22 new changes (cumulative with Sprint 15-21):**

Sprint 15-21 uncommitted changes still present.

Sprint 22 new changes (Track A + Track B):
- `server/src/context-bus.ts` — NEW (242 LOC): SharedContextBus — cross-card pub/sub with per-client isolation, TTL eviction, size guards
- `server/src/ws-handlers.ts` — NEW (2,097 LOC): Extracted WebSocket message dispatcher with all 60+ switch cases from server.ts
- `server/src/server.ts` — MAJOR REFACTOR (3,876 → 1,893 LOC, -51%): Switch block replaced with handleWebSocketMessage() call, 15 unused imports removed
- `server/src/types.ts` — EDIT (+20 LOC): 4 new context sharing message types + optional fields on ClientMessage/ServerMessage
- `server/src/context-bus.test.ts` — NEW (203 LOC): 21 unit tests for context-bus
- `server/src/tool-router.ts` — EDIT: TRIVIAL_SHELL_PATTERNS regex, 15s tool-router timeout, Windows path regex fix
- `server/src/standalone-agent.ts` — EDIT: _meta tagging, markConversationFresh/isConversationFresh exports, 30s silent guard timer
- `server/src/shell-pty.ts` — EDIT: BUG-01 diagnostic logging, tsx cache documentation
- `server/src/intent-routing.test.ts` — EDIT: NEW-BUG-01 test cases
- `server/src/session-isolation.test.ts` — EDIT: BUG-04 _meta tagging tests
- `server/src/filesystem-error-handling.test.ts` — EDIT: tool-router timeout tests
- `projects/enso/project.json` — Sprint 22 data updates
- `projects/enso/brain.md` — Sprint 22 meta-review updates

---

*Last updated: Sprint 22 meta-review (2026-04-05)*
*Next update: Phase 6 meta-review of Sprint 23*
