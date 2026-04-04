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

**2. Persona re-test deferral spiral — RECURRING**
- Marco Reyes re-test was deferred for 5 consecutive sprints (Sprints 10–14)
- Sprint 15–18: Marco tested every sprint. Persona testing is now a consistent sprint gate.
- **Sprint 19: Marco NOT TESTED. Retest files not generated for Alex/Priya.** Process slipped — fixes deployed but unvalidated. Must not become a pattern again.
- **Sprint 21: Persona retests again NOT conducted despite P0-VALIDATION listing.** Pre-fix persona scores collected (Marco 3.8, Jordan 4.0, Alex 5.6) but NO post-fix retests were generated. Pattern has now recurred for the 3rd time (Sprint 19, 20, 21). All 3 P0 bugs were fixed but remain unvalidated by persona retests. This is the #1 process gap.

**3. Stale backlog items persisting across 3+ sprints**
- media-ai-gateway error string: RESOLVED Sprint 14
- ADR-004 (SSE Streaming): deprioritized indefinitely (6+ sprints deferred)
- MCP client integration: 7+ sprints, design only. Blocked by server.ts decomposition. Target Sprint 21+.
- **Sprint 20 update:** server.ts decomposition now at **5 sprints deferred** (designed Sprint 17, deferred Sprint 18/19/20). MUST execute Sprint 21.
- **Sprint 21 update:** server.ts decomposition deferred **6th time**. However, Sprint 21 proved that all 3 P0 bugs (BUG-01, BUG-02, BUG-03) could be fixed WITHOUT decomposition — surgical changes in standalone-agent.ts, shell-pty.ts, filesystem-tools.ts, system-tools.ts. Decomposition remains valuable for maintainability but is no longer the root-cause blocker for bug fixes. **Credibility crisis partially addressed by delivering bug fixes through alternative paths.**

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

**11. Design-to-implementation disconnect (Sprint 20) — COUNTER-MEASURES VALIDATED Sprint 21**
- Sprint 20 design (Phase 4) explicitly specified 3 P0 bug fixes in Sections 7.1-7.3 with server.ts code changes
- BUT the same design's architecture diagram listed server.ts under "No Changes"
- Both implementation tracks cited "outside this track's scope" to skip ALL bug fixes
- **Sprint 21: Counter-measures WORKED.** File assignment matrix required explicit file-level assignment for every P0 item. Track A assigned to standalone-agent.ts lines 656-841, Track B assigned to standalone-agent.ts lines 231-252. Non-overlapping regions, no "No Changes" exceptions. All 3 P0 bugs with file assignments were implemented. Fix-cycle resolved BUG-01 with dynamic PROJECT_ROOT across 3 files + 70 new tests.
- **Process gate confirmed:** Explicit file-level assignment for P0 items is now a PERMANENT requirement.

---

## Improvement Velocity

Sprint score history (Sprints 1–21): `[8.0, 6.5, 7.0, 8.5, 7.5, 7.0, 6.6, 6.6, 5.87, 8.0, 6.0, 7.5, 7.0, 4.5, 6.0, 7.0, 7.5, 7.5, 7.0, 6.5, 7.0]`
Mean: 6.81 — Recovery from Sprint 20 dip. All P0 bugs fixed but no persona retests.

**Trending up:**
- Sprint execution reliability: All 3 P0 bugs fixed in Sprint 21 (BUG-01, BUG-02, BUG-03). Assignment matrix PERMANENT. Counter-measures from Sprint 20 post-mortem validated.
- Build stability: **8 consecutive green-build sprints** (625/625 tests pass Sprint 21, 25 test files)
- Test coverage: 25 test files, 625 tests. Sprint 21 fix-cycle added 5 new test files (70 tests): shell-pty.test.ts, filesystem-error-handling.test.ts, intent-routing.test.ts, session-isolation.test.ts, browser-tools.test.ts.
- Bug fix delivery: **3/3 P0 bugs fixed** (reversed Sprint 20's 0/3). BUG-01 (dynamic PROJECT_ROOT), BUG-02 (never-silent guard), BUG-03 (BUILD_INTENT fast path + keyword expansion).
- Tool routing: 14 new keywords in isOperationalPrompt(), BUILD_INTENT regex pre-routing bypasses Gemini misrouting.
- OS-level agent capabilities: write_file, copy_path, search_content, shell_execute, browser_extract/key/evaluate/wait all functional (Sprint 20). Now reachable post-routing fixes.
- Playwright/Puppeteer dual-engine abstraction: Structural readiness. Zero-risk migration path when Playwright is installed.

**Trending down / plateauing:**
- **Persona scores pre-fix (NO RETESTS CONDUCTED)**: Marco 3.8*, Jordan 4.0*, Alex 5.6* (*pre-fix, unvalidated post-fix).
- Marco Reyes: 3.6 → 3.8* (pre-fix). BUG-02 and BUG-03 now fixed — expected significant improvement post-retest. **7th sprint under 5.0 but fixes are deployed.**
- Jordan Kim: 6.1 → 4.0* (pre-fix). BUG-01 now fixed (dynamic PROJECT_ROOT). Rule 4 updated to allow enso_shell_execute for simple commands. Expected improvement post-retest.
- Alex Chen: 7.2 → 5.6* (pre-fix). Session boundary strengthened with 5-point prohibition list. Context contamination fix still prompt-level only.
- Priya Sharma: NOT TESTED Sprint 21. UX-01 (Claude Code project selector) still open — client-side issue.
- server.ts size: 3,877+ LOC (**6 sprints deferred**). No longer blocks bug fixes (proven Sprint 21) but still blocks MCP integration and maintainability.
- Persona retests: **NOT CONDUCTED for 3rd consecutive sprint** (Sprint 19, 20, 21). All fixes unvalidated by personas.
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
| Persona | S16 | S17 | S18 | S19 | S20 | S21* | Trend |
|---|---|---|---|---|---|---|---|
| Alex Chen | — | 6.8 | 8.2 | 7.2 | — | 5.6* | ↓ (-1.6) pre-fix, context contamination |
| Priya Sharma | 2.6 | 6.2 | 6.8 | 6.0 | 5.0 | — | Not tested S21 |
| Jordan Kim | 4.0 | 4.5 | — | 7.6 | 6.1 | 4.0* | ↓ (-2.1) pre-fix, CWD + routing |
| Marco Reyes | 1.5 | 2.5 | 3.5 | — | 3.6 | 3.8* | → (+0.2) 7th sprint under 5.0 |
| Sprint Average | 2.7 | 5.0 | 6.17 | 6.93 | 4.9 | 4.47* | *Pre-fix only, no retests |

*S21 scores are PRE-FIX only. All 3 P0 bugs were fixed after persona testing but NO post-fix retests were conducted. Actual post-fix scores are expected to be significantly higher.

**Known regressions introduced by evolution sprints:**
- Sprint 20: No code regressions, but persona scores regressed because existing bugs were not fixed. New tools implemented but unreachable due to routing issues.
- Sprint 21: No code regressions. 625/625 tests pass. Persona scores appear regressed but are pre-fix snapshots only.

---

## Strategic Read

*PL's current assessment as of Sprint 21 meta-review.*

**P0-EMERGENCY (Sprint 22 must deliver — no deferral):**
1. **Persona retests for ALL personas** — 3 consecutive sprints without post-fix retests (Sprint 19, 20, 21). All 3 P0 bug fixes are deployed but UNVALIDATED. Marco has been under 5.0 for 7 sprints. This is the **#1 process gap** — we fix bugs but never confirm they work for users.
2. **BUG-04 full fix (context contamination)** — Sprint 21 added prompt-level mitigation only. Alex dropped from 7.2 to 5.6 partly from contamination. Full fix requires session-keyed history isolation (not just prompt instructions).

**P0-RESOLVED (Sprint 21 — confirmed fixed, pending retest validation):**
3. ~~**Fix shell CWD (BUG-01)**~~ — **RESOLVED** via fix-cycle. Dynamic PROJECT_ROOT in shell-pty.ts, filesystem-tools.ts, system-tools.ts. Tests in shell-pty.test.ts validate.
4. ~~**Fix silent filesystem failures (BUG-02)**~~ — **RESOLVED** via Track A. `delivered` flag + `finally` block in handleStandaloneInbound(). Never-silent guard ensures at least one message reaches client.
5. ~~**Fix Photo Studio misrouting (BUG-03)**~~ — **RESOLVED** via fix-cycle + Track A. 14 new keywords in isOperationalPrompt() + BUILD_INTENT regex fast path bypasses Gemini for software build requests.

**P1 (Sprint 22):**
6. **server.ts decomposition** — 6 sprints deferred. Sprint 21 proved bug fixes work without it, but 3,877 LOC monolith still blocks MCP integration and reduces maintainability. No longer P0-EMERGENCY.
7. **UX-01: Claude Code project selector** — Client-side issue. Server sends defaultProjectCwd but client renders irrelevant options. Blocks autonomous building for Priya.
8. **Permission tiers for shell_execute** — 4-tier approval system deferred from Sprint 20.
9. **WCAG touch target compliance** — Jordan reported 37% compliance during active use (close buttons 10x16px).
10. **Session management** — Background Claude Code terminals persist and block interactions.

**Medium-term strategic bets:**
- **MCP client integration** — 10+ sprints deferred. Blocked by server.ts decomposition. Target Sprint 23+.
- **Prompt caching** — 90% input token savings. Low risk, high ROI. Target Sprint 22-23.
- **Research synthesis reliability** — Deep research still returns general knowledge, not web research.
- **Build-to-app pipeline** — "build X" should produce interactive apps, not text cards.

**Things that are fine as-is (do not over-engineer):**
- Photo engine (H&D curves, LAB color, luminosity masking) — superior to external APIs
- Virtual scrolling + CSS containment — working, don't touch
- App ecosystem (18 apps, 34 agent-callable tools) — well-segmented, consolidation deferred
- Photo Studio / Media Gallery boundary — RESOLVED and VALIDATED
- Schema validation — test suite active, graceful degradation as defense-in-depth
- Error message classification — test suite active, no regressions
- New OS-level tools (8 tools) — well-implemented, tested, following existing patterns
- Playwright/Puppeteer dual-engine abstraction — ready for Playwright activation post-install
- OG image and tags — now PNG, fully functional (Sprint 19)
- LICENSE file — MIT, present at root (Sprint 19)
- SEO basics — robots.txt, sitemap.xml, JSON-LD all in place (Sprint 19)
- BUG-01/02/03 fixes — all deployed and passing tests (Sprint 21). Pending persona retest validation.
- BUILD_INTENT regex fast path — deterministic pre-routing for software build requests (Sprint 21)
- Never-silent guard — `delivered` flag + `finally` block ensures response delivery (Sprint 21)
- Dynamic PROJECT_ROOT — import.meta.url-based resolution replaces hard-coded paths (Sprint 21)

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
- MCP client: Design since Sprint 12, no code. Target Sprint 23+ (after server.ts decomposition).
- SQLite-backed CardContextStore: Design ready, deferred every sprint.
- Playwright E2E framework: Proposed Sprint 14, deferred (5+ sprints). Playwright/Puppeteer dual-engine abstraction built Sprint 20 but Playwright not installed.
- server.ts decomposition IMPLEMENTATION: Designed Sprint 17, deferred Sprint 18, 19, 20, 21. **6 sprints deferred.** Sprint 21 proved bug fixes work without it — no longer P0-EMERGENCY but still needed for maintainability and MCP integration. Target Sprint 22 P1.
- BUG-04 full fix (context contamination): Prompt-level mitigation Sprint 21. Full fix requires session-keyed history isolation. Target Sprint 22.
- UX-01 (Claude Code project selector): Client-side issue confirmed Sprint 21. Server sends defaultProjectCwd but client renders irrelevant options. No server-side fix possible.

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

**Tried and found not needed:**
- Replacing photo engine with external neural style transfer APIs: Photo engine is already superior
- Implementing adaptive thinking: Already active in claude-code.ts L366

**Architectural decisions pending:**
- server.ts decomposition IMPLEMENTATION: Design ready. 5 modules, extraction order defined. **6th deferral. P1 for Sprint 22.** No longer blocks bug fixes (proven Sprint 21) but still needed for maintainability + MCP integration.
- Permission tiers for OS actions: 4-tier system designed by AI Strategist, deferred Sprint 20-21. Target Sprint 22.
- BUG-04 full fix: Session-keyed history isolation needed. Prompt-level mitigation deployed Sprint 21 but not sufficient for full context isolation.
- Playwright installation: Dual-engine abstraction ready. Manual `npm install playwright` post-sprint activation step.
- ChatInput Phase 3: 525 → <500 LOC. Shell mode banner or voice toggle. Low priority.
- Landing page deployment: **Decision made: GitHub Pages from /docs.** Execution pending (manual step). Deprioritized.
- Analytics platform: **Decision made: Plausible.** Account creation pending (manual step). Deprioritized.

---

## Persona Evolution Notes

*Running observations about each persona's relationship with the product.*

**Marco Reyes (creative-professional) — RESCUE STATUS UNKNOWN (Sprint 21):**
- Sprint 15: 4.2/10. Sprint 16: 1.5/10. Sprint 17: 2.5/10. Sprint 18: 3.5/10. Sprint 19: NOT TESTED. Sprint 20: 3.6/10. **Sprint 21: 3.8/10* (pre-fix only).**
- **7th consecutive sprint under 5.0** (pre-fix). BUG-02 (silent failures) and BUG-03 (Photo Studio misrouting) both FIXED in Sprint 21 implementation. New write_file tool also reported unreachable (routed to File Browser instead) — potential new routing gap.
- Pre-fix test showed: S1 zero response (BUG-02), S2 zero response (BUG-02), S3 Media Gallery correct (BUG-03 fixed for this scenario), S4 routed to File Browser instead of write_file (new issue), S5 acknowledged but no research action.
- **Sprint 22 MANDATORY**: Retest Marco post-fix. BUG-02 and BUG-03 fixes should eliminate silent failures and misrouting. If Marco crosses 5.0, rescue succeeds. If not, investigate write_file routing gap.

**Priya Sharma (indie-developer) — NOT TESTED Sprint 21:**
- Sprint 15: 4.8/10. Sprint 16: 2.6/10. Sprint 17: 6.2/10. Sprint 18: 6.8/10. Sprint 19: 6.0/10. Sprint 20: 5.0/10. **Sprint 21: NOT TESTED.**
- UX-01 (Claude Code project selector) confirmed as client-side issue — no server fix possible. Needs client-side change.
- Shell CWD fix (BUG-01) now deployed. Rule 4 updated to allow enso_shell_execute for simple commands.
- **Sprint 22 focus**: Retest to validate BUG-01 fix and Rule 4 improvement. UX-01 requires client-side work.

**Jordan Kim (developer) — FIXES DEPLOYED, UNVALIDATED (Sprint 21):**
- Sprint 15: 6.4/10. Sprint 16: 4.0/10. Sprint 17: 4.5/10. Sprint 18: NOT TESTED. Sprint 19: 7.6/10. Sprint 20: 6.1/10. **Sprint 21: 4.0/10* (pre-fix only).**
- BUG-01 (Shell CWD) now FIXED — dynamic PROJECT_ROOT replaces hard-coded path. BUG-03 (build intent misrouting) now FIXED — BUILD_INTENT regex fast path. Rule 4 updated to allow lightweight shell commands.
- Pre-fix test confirmed Shell CWD at D:\Github instead of D:\Github\Enso, and "Build API dashboard" still misrouted to Photo Studio. Both issues addressed by Sprint 21 fixes.
- Touch targets: WCAG 82% → 43% during active use. Not addressed Sprint 21.
- **Sprint 22 MANDATORY**: Retest to validate BUG-01 and BUG-03 fixes. Expected significant improvement.

**Alex Chen (startup-founder) — CONTEXT CONTAMINATION PARTIALLY ADDRESSED (Sprint 21):**
- Sprint 12: ~4.0/10. Sprint 17: 6.8/10. Sprint 18: 8.2/10. Sprint 19: 7.2/10. Sprint 20: NOT TESTED. **Sprint 21: 5.6/10* (pre-fix only).**
- Pre-fix test confirmed context contamination (S2 references "API Monitoring Dashboard" from prior session). Session boundary strengthened with 5-point prohibition list (FIX B2).
- Orchestration still produces essays instead of deliverables. Gemini API timeout on Build App pipeline.
- Context contamination fix is prompt-level only — full fix requires session-keyed history isolation.
- **Sprint 22 focus**: Retest to validate session boundary strengthening. Consider BUG-04 full fix (session-keyed isolation).

---

## Uncommitted Changes Tracker

*Significant uncommitted work that should not be lost or forgotten across sprints.*

**Sprint 21 new changes (cumulative with Sprint 15-20):**

Sprint 15-20 uncommitted changes still present.

Sprint 21 new changes (+96 / -11 LOC across 6 source files + 5 new test files):
- `server/src/standalone-agent.ts` — BUILD_INTENT regex fast path (lines 656-692), never-silent guard (lines 696-840), session boundary expansion (lines 231-237), Rule 4 update (lines 249-252) (~+47 LOC Track A, +6 LOC Track B)
- `server/src/shell-pty.ts` — Dynamic PROJECT_ROOT via import.meta.url replacing hard-coded path
- `server/src/filesystem-tools.ts` — DETECTED_PROJECT_ROOT dynamic resolution + ALLOWED_ROOTS enforcement
- `server/src/system-tools.ts` — Dynamic PROJECT_ROOT via import.meta.url
- `server/src/server.ts` — JSDoc comment block only (cosmetic)
- `server/src/tool-router.ts` — 14 new keywords in isOperationalPrompt()
- `server/src/shell-pty.test.ts` — NEW: 10 tests (validateCwd, PROJECT_ROOT)
- `server/src/filesystem-error-handling.test.ts` — NEW: 15 tests
- `server/src/intent-routing.test.ts` — NEW: 27 tests (isOperationalPrompt keyword expansion)
- `server/src/session-isolation.test.ts` — NEW: 6 tests
- `server/src/browser-tools.test.ts` — NEW: 16 tests
- `projects/enso/project.json` — Sprint 21 data updates
- `projects/enso/brain.md` — Sprint 21 meta-review updates

---

*Last updated: Sprint 21 meta-review (2026-04-05)*
*Next update: Phase 6 meta-review of Sprint 22*
