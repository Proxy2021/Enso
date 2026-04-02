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
- **Sprint 19 update:** server.ts decomposition now at **4 sprints deferred** (designed Sprint 17, deferred Sprint 18/19). MUST execute Sprint 20. This is a credibility issue — 3 consecutive "MUST execute" promises broken.

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

**10. NEW: "Ready-to-deploy but never deployed" pattern (Sprint 18-19)**
- Sprint 18 created landing page, social posts, competitive positioning — all excellent quality, none deployed
- Sprint 19 fixed all blockers (OG PNG, LICENSE, SEO, security) — still nothing deployed
- Root cause: The evolution sprint process produces code artifacts but has no mechanism to execute external deployment actions (enable GitHub Pages, create Plausible account, post to Twitter)
- **Counter-measure needed:** Each sprint must identify manual deployment steps and flag them as separate from code deliverables. Sprint success should be measured partly on deployed state, not just code state.

---

## Improvement Velocity

Sprint score history (Sprints 1–19): `[8.0, 6.5, 7.0, 8.5, 7.5, 7.0, 6.6, 6.6, 5.87, 8.0, 6.0, 7.5, 7.0, 4.5, 6.0, 7.0, 7.5, 7.5, 7.0]`
Mean: 6.81 — Stable at historical average. Four consecutive 7+ sprints.

**Trending up:**
- Sprint execution reliability: **4 consecutive full-delivery sprints** (S16: 7/8, S17: 7/7+bonus, S18: 10/10, S19: 10/10). Assignment matrix PERMANENT.
- Build stability: **6 consecutive green-build sprints**
- Test coverage: 29 test files, 655 tests. Schema + error tests are highest-ROI additions.
- Marketing infrastructure: 2.2/10 → 6.5/10 → 7.5/10 across two sprints. All pre-launch blockers eliminated.
- Jordan Kim: 4.5 → 7.6 (+3.1). **Silent failure elimination VALIDATED.** ThinkingCard + TypingIndicator confirmed working. Most improved persona.
- Security posture: share-token guarded, rate limiting added, WS disconnect feedback implemented (Sprint 19).
- SEO infrastructure: robots.txt, sitemap.xml, JSON-LD, UTM tracking all in place (Sprint 19).

**Trending down / plateauing:**
- Alex Chen: 8.2 → 7.2 (-1.0). Context contamination regressed S3. Fix deployed (getUserProfileContext + session boundary) but **not retested**.
- Priya Sharma: 6.8 → 6.0 (-0.8). Design-instead-of-build persists. Hallucinated "previously researched" in fresh chat. Fix deployed (Build-First Rule + session boundary) but **not retested**.
- Marco creative workflows: NOT TESTED Sprint 19. Still at 3.5/10 (Sprint 18). Server-side timeouts remain uninvestigated.
- server.ts size: 3,323+ LOC (**4 sprints deferred**). Blocks MCP integration. Now a credibility issue.
- Deployed marketing: 0/10 — two sprints of preparation, nothing live.
- Sales infrastructure: 0.6/10 — no CRM, no analytics, no community, no conversion path.

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
| Persona | S16 | S17 | S18 | S19 | Trend |
|---|---|---|---|---|---|
| Alex Chen | — | 6.8 | 8.2 | 7.2 | ↓ (-1.0) Context contamination |
| Priya Sharma | 2.6 | 6.2 | 6.8 | 6.0 | ↓ (-0.8) Design-instead-of-build |
| Jordan Kim | 4.0 | 4.5 | — | 7.6 | ↑↑ (+3.1) Silent failure fixed |
| Marco Reyes | 1.5 | 2.5 | 3.5 | — | Not tested |
| Sprint Average | 2.7 | 5.0 | 6.17 | 6.93 | ↑ (+0.76) |

**Known regressions introduced by evolution sprints:**
- None this sprint. All changes were net-positive or neutral.

---

## Strategic Read

*PL's current assessment as of Sprint 19 meta-review.*

**Immediate priority (Sprint 20 must deliver):**
1. **DEPLOY WHAT EXISTS.** Enable GitHub Pages for docs/. Verify landing page is live. Confirm OG image renders on Twitter/LinkedIn. This is a 2-click action that has been "ready" for 2 sprints. If it doesn't happen Sprint 20, it never will.
2. **Execute social launch.** Post at least 3 of the 8 ready social posts (HN Show, Twitter, Reddit r/selfhosted). This requires manual action outside the sprint process.
3. **server.ts decomposition IMPLEMENTATION** — 4 sprints deferred. Extract at minimum server-utils.ts + client-manager.ts (Steps 1-2). This is mandatory and non-negotiable. Design doc ready since Sprint 17.
4. **Validate Sprint 19 fixes.** Retest Alex (context contamination) and Priya (design-instead-of-build, shell CWD). Fixes deployed but never validated.
5. **Set up analytics.** Create Plausible account or add self-hosted counter. Can't optimize what you can't measure.

**Medium-term strategic bets:**
- **MCP client integration** — 8+ sprints deferred. Won't happen until server.ts is decomposed. Target Sprint 21+.
- **Prompt caching** — 90% input token savings. Low risk, high ROI. Target Sprint 20-21.
- **Research synthesis reliability** — Root cause investigation for synthesis failures. Priya S4 still broken.
- **Build-to-app pipeline** — Alex and Priya want "build X" to produce interactive apps, not text cards.
- **Interactive onboarding flow** — Replace 11 tiles + 6 prompts with 3-step guided demo.
- **Community presence** — Enable GitHub Discussions (zero cost). Discord when 50+ members.
- **Email capture** — Add signup form to landing page.

**Things that are fine as-is (do not over-engineer):**
- Photo engine (H&D curves, LAB color, luminosity masking) — superior to external APIs
- Virtual scrolling + CSS containment — working, don't touch
- App ecosystem (15 apps, 114 tools) — well-segmented, no merges needed
- Photo Studio / Media Gallery boundary — RESOLVED and VALIDATED
- Schema validation — test suite active, graceful degradation as defense-in-depth
- Error message classification — test suite active, no regressions
- Marketing content quality — landing page, social posts, competitive positioning all high quality
- Onboarding tile order — /code first, Build first prompts (Sprint 18)
- OG image and tags — now PNG, fully functional (Sprint 19)
- LICENSE file — MIT, present at root (Sprint 19)
- SEO basics — robots.txt, sitemap.xml, JSON-LD all in place (Sprint 19)

**Sales Infrastructure Status (NEW — Sprint 19):**
| Component | Status | Target |
|---|---|---|
| Landing page | Files ready, not deployed | Sprint 20: DEPLOY |
| Analytics | Script in HTML, no account | Sprint 20: CREATE |
| CRM | Does not exist | Sprint 21+ |
| Community | No channels | Sprint 20: GitHub Discussions |
| Auto-sales | No conversion path | Sprint 21+ |
| Email capture | No signup form | Sprint 20 |
| Social presence | 8 posts ready, 0 posted | Sprint 20: POST 3 |

---

## What's Been Tried

**Deferred (attempted but not completed, with sprint context):**
- SSE Streaming (ADR-004): Designed Sprint 13, deprioritized indefinitely (6+ sprints).
- MCP client: Design since Sprint 12, no code. Target Sprint 21+ (after server.ts decomposition).
- SQLite-backed CardContextStore: Design ready, deferred every sprint.
- Playwright E2E framework: Proposed Sprint 14, deferred (5+ sprints).
- server.ts decomposition IMPLEMENTATION: Designed Sprint 17, deferred Sprint 18, 19 (marketing/sales priority). Target Sprint 20 MANDATORY.

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

**Tried and found not needed:**
- Replacing photo engine with external neural style transfer APIs: Photo engine is already superior
- Implementing adaptive thinking: Already active in claude-code.ts L366

**Architectural decisions pending:**
- server.ts decomposition IMPLEMENTATION: Design ready. 5 modules, extraction order defined. Sprint 20 MANDATORY (4th deferral).
- ChatInput Phase 3: 525 → <500 LOC. Shell mode banner or voice toggle. Low priority.
- Landing page deployment: **Decision made: GitHub Pages from /docs.** Execution pending (manual step).
- Analytics platform: **Decision made: Plausible.** Account creation pending (manual step).

---

## Persona Evolution Notes

*Running observations about each persona's relationship with the product.*

**Marco Reyes (creative-professional) — NOT TESTED Sprint 19:**
- Sprint 15: 4.2/10. Sprint 16: 1.5/10. Sprint 17: 2.5/10. Sprint 18: 3.5/10 (+1.0). Sprint 19: NOT TESTED.
- Sprint 18 MANDATORY retest completed: Contamination fix VALIDATED. Schema fix VALIDATED. Error classification VALIDATED.
- Misrouting fix STILL UNVALIDATABLE — server-side timeouts prevent test scenarios from executing. Now a **5-sprint unvalidated fix**.
- **Sprint 20 focus**: Must be tested. Server-side timeout diagnostic still needed.

**Priya Sharma (indie-developer) — REGRESSION, FIXES DEPLOYED BUT UNVALIDATED (Sprint 19):**
- Sprint 15: 4.8/10. Sprint 16: 2.6/10. Sprint 17: 6.2/10. Sprint 18: 6.8/10. Sprint 19: 6.0/10 (-0.8).
- Regressions: Design-instead-of-build (S3: todo app → clarifying questions), hallucinated "previously researched" (S2).
- **Fixes deployed Sprint 19:** Build-First Rule (system prompt), session boundary marker, getUserProfileContext().
- Shell CWD fixed (package.json check + process.cwd() fallback). Not retested.
- **Sprint 20 focus**: RETEST to validate Build-First Rule and session boundary fixes.

**Jordan Kim (developer) — DRAMATIC IMPROVEMENT VALIDATED (Sprint 19):**
- Sprint 15: 6.4/10. Sprint 16: 4.0/10. Sprint 17: 4.5/10. Sprint 18: NOT TESTED. Sprint 19: 7.6/10 (+3.1).
- **Silent failure elimination VALIDATED**: 0/5 → 4-5/5 responses delivered. ThinkingCard + TypingIndicator confirmed working.
- Build product (S1): 9/10. /code (S2): 9/10. Browse apps (S3): 7/10. Research (S4): 7/10. Shell (S5): 7/10.
- Touch targets: Welcome 82% (28/34), Chat 48% (11/23). Chat touch targets still fail WCAG 2.1 (44×44px minimum).
- Background Claude Code sessions persist without management UI (S2 running at 41s during S3-S5).
- **Sprint 20 focus**: Touch target compliance in chat. Background task management consideration.

**Alex Chen (startup-founder) — REGRESSION DUE TO CONTEXT CONTAMINATION (Sprint 19):**
- Sprint 12: ~4.0/10. Sprint 17: 6.8/10. Sprint 18: 8.2/10. Sprint 19: 7.2/10 (-1.0).
- S3 CRITICAL FAILURE: Completely off-topic response (API monitoring dashboard instead of market sizing). Context contamination from prior session.
- S1 (7/10), S4 (8/10), S5 (8/10) were strong. S2 (6/10) — orchestration still produces essays, not artifacts.
- **Fix deployed Sprint 19:** getUserProfileContext() + session boundary marker. Not retested.
- Marketing eval: OG image SVG → broken sharing (3/10 social shareability). OG PNG fix deployed.
- **Sprint 20 focus**: RETEST to validate context contamination fix. Validate OG image in real social sharing.

---

## Uncommitted Changes Tracker

*Significant uncommitted work that should not be lost or forgotten across sprints.*

**Sprint 19 new changes (cumulative with Sprint 15-18):**

Sprint 15-18 uncommitted changes still present (see Sprint 18 brain entry for full list).

Sprint 19 new changes:
- `LICENSE` (NEW) — MIT license, 1100 bytes
- `docs/index.html` (NEW) — GitHub Pages landing page with Plausible, JSON-LD, SEO
- `docs/og-image.png` (NEW) — 1200×630 PNG OG image (16,865 bytes)
- `docs/robots.txt` (NEW) — Crawler configuration
- `docs/sitemap.xml` (NEW) — Single-page sitemap
- `public/og-image.png` (NEW) — PNG OG image replacing SVG (16,865 bytes)
- `index.html` — Updated OG image references (SVG → PNG)
- `marketing/landing-page.html` — Hero placeholder replaced with CSS terminal mockup
- `marketing/social-posts.md` — UTM parameters added to all 8 URLs
- `server/src/server.ts` — share-token auth guard, shell CWD validation, rate limiter (+52 lines)
- `server/src/standalone-agent.ts` — getUserProfileContext(), session boundary marker, Build-First Rule (+19 lines)
- `server/src/memory-bridge.ts` — getUserProfileContext() function (+16 lines)
- `src/store/chat.ts` — WS disconnect error card, isWaiting clear on disconnect (+35 lines)
- `src/components/SettingsPanel.tsx` — Model preset updates (+71 lines)
- `projects/enso/project.json` — Sprint data updates

---

*Last updated: Sprint 19 meta-review (2026-04-03)*
*Next update: Phase 6 meta-review of Sprint 20*
