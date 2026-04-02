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
- **Sprint 17-18: 3 consecutive full-delivery sprints (7/8, 7/7+bonus, 10/10).** Pattern is definitively broken. Assignment matrix gate is PERMANENT.

**2. Persona re-test deferral spiral — RESOLVED**
- Marco Reyes re-test was deferred for 5 consecutive sprints (Sprints 10–14)
- Sprint 15–18: Marco tested every sprint. Persona testing is now a consistent sprint gate.
- **Sprint 18 MANDATORY retest completed**: Contamination fix VALIDATED (0/2 leakage). Schema fix VALIDATED (0 errors). Error classification VALIDATED (0 "try rephrasing"). Misrouting STILL UNVALIDATABLE — server-side timeouts prevent the test scenarios from executing.

**3. Stale backlog items persisting across 3+ sprints**
- media-ai-gateway error string: RESOLVED Sprint 14
- ADR-004 (SSE Streaming): deprioritized indefinitely (6+ sprints deferred)
- MCP client integration: 7+ sprints, design only. Blocked by server.ts decomposition. Target Sprint 20+.
- **Sprint 18 update:** server.ts decomposition now at 3 sprints deferred (designed Sprint 17, deferred Sprint 18 for marketing). MUST execute Sprint 19.

**4. Build gate violations — RESOLVED**
- Sprint 15, 16, 17, 18: Build green. **Five consecutive green-build sprints.**
- Rule remains: any sprint that ships a broken build should be scored ≤5.0.

**5. Half-done refactors — RESOLVED for this instance**
- OrchestrationCard React.memo wrapper completed Sprint 15. Holding through Sprint 18.

**6. P0 items designed but never assigned — RESOLVED**
- Assignment matrix gate: implemented Sprint 16, confirmed Sprint 17-18. **PERMANENT process gate.** Zero orphans across 3 consecutive sprints.

**7. Schema regression entering without pre-deployment validation — RESOLVED**
- Sprint 16: `batch_generate.scenes` and `photo_story` fields missing `items` → total platform outage
- **Sprint 17: `schema-validation.test.ts` IMPLEMENTED AND PASSING.** 245 tests across all 8 app families.
- Sprint 18: 0 schema errors across all persona tests.

**8. Cross-session response contamination — RESOLVED AND VALIDATED**
- `conversationHistories` map was keyed only by `conversationId`, not scoped per client
- **FIXED Sprint 17:** Composite key `${clientId}|${conversationId}`. 7 LOC.
- **VALIDATED Sprint 18:** Marco's 2 successful responses showed zero contamination. Alex's 5 responses all on-topic.

**9. NEW: Marketing infrastructure at zero for 17 sprints**
- 17 consecutive sprints focused entirely on engineering with zero marketing investment
- Sprint 18 was the first marketing-focused sprint — went from 0 to credible (2.2/10 → 6.5/10)
- **Lesson:** Marketing infrastructure should be a continuous concern, not a single-sprint emergency. Include at least one marketing item per sprint going forward.
- Counter-measure: Track marketing readiness as a sprint metric alongside technical quality.

---

## Improvement Velocity

Sprint score history (Sprints 1–18): `[8.0, 6.5, 7.0, 8.5, 7.5, 7.0, 6.6, 6.6, 5.87, 8.0, 6.0, 7.5, 7.0, 4.5, 6.0, 7.0, 7.5, 7.5]`
Mean: 6.80 — Stable at historical average. Three consecutive 7+ sprints.

**Trending up:**
- Sprint execution reliability: 3 consecutive full-delivery sprints (S16: 7/8, S17: 7/7+bonus, S18: 10/10). Assignment matrix PERMANENT.
- Build stability: 5 consecutive green-build sprints
- Test coverage: 29 test files, 655 tests (corrected from inflated "638" — actual count via `vitest run`). Schema + error tests are highest-ROI additions.
- Marketing infrastructure: 2.2/10 → 6.5/10 in one sprint (landing page, OG tags, README, competitive positioning, social posts, demo storyboard, CONTRIBUTING.md)
- Persona score average: 2.7 (S16) → 5.0 (S17) → 6.17 (S18). Platform crossing from "functional" to "good."
- Alex Chen: 6.8 → 8.2 (+1.4). Research quality and reliability validated.
- Priya Sharma: 6.2 → 6.8 (+0.6). /code experience is the aha moment. Steady upward trajectory.

**Trending down / plateauing:**
- Marco creative workflows: 3.5/10 — 60% server-side timeouts unchanged across Sprint 17-18. ThinkingCard helps client UX but root cause is server-side.
- server.ts size: 3,314 LOC (3 sprints deferred). Blocks MCP integration. MUST execute Sprint 19.
- Research synthesis reliability: Priya S4 showed synthesis failure (48 sources found, synthesis crashed). Error propagation added but root cause uninvestigated.
- Jordan Kim not tested Sprint 18 — stagnant at 4.5/10. Silent failure UX improvements (ThinkingCard) need validation.

**Areas that improved and held:**
- Virtual scrolling, CSS containment, code splitting: all stable since Sprint 13-14
- ChatCard/OrchestrationCard React.memo: stable
- Photo Studio / Media Gallery boundary: validated Sprint 17, no regressions
- /code client connection: working, improved UX (progress indicator) Sprint 18
- Error message classification: validated Sprint 17-18, no "try rephrasing" regressions
- Schema validation test: active, 0 failures Sprint 18
- Cross-session contamination fix: VALIDATED Sprint 18
- Touch targets Phase 1+2: complete and holding
- ChatInput decomposition Phase 2: complete (1205→525 LOC)

**New marketing metrics (Sprint 18 baseline):**
- Marketing readiness composite: 6.5/10
- Social sharing: 7/10 (functional but SVG image needs PNG conversion)
- Landing page: 7/10 (content ready, not deployed, placeholder screenshot)
- OSS community: 6/10 (CONTRIBUTING.md exists, no issue templates)
- Demo readiness: 7/10 (storyboard ready, no recording)

**Known regressions introduced by evolution sprints:**
- None this sprint. ThinkingCard timeout escalation is an improvement.

---

## Strategic Read

*PL's current assessment as of Sprint 18 meta-review.*

**Immediate priority (Sprint 19 must deliver):**
1. **Pre-launch blockers**: Convert og-image.svg → PNG (Twitter/LinkedIn). Reconcile competitive claim inconsistency (F1). Replace landing page placeholder screenshot. Verify enso.sh domain. Add package.json metadata.
2. **server.ts decomposition IMPLEMENTATION** — 3 sprints deferred. Design doc ready (269 LOC, `server/DECOMPOSITION-DESIGN.md`). Extract 5 modules. This is the largest tech debt item (3,314 LOC) and blocks MCP integration.
3. **Deploy marketing assets** — Landing page deployment (GitHub Pages / Cloudflare / Vite route). Soft launch on r/selfhosted. Record 30-second /code demo GIF.
4. **Marco server-side timeout diagnostic** — 60% of creative requests silently timeout. Root cause investigation: server-side, not client UI.

**Medium-term strategic bets:**
- **MCP client integration** — 7+ sprints deferred. Won't happen until server.ts is decomposed. Target Sprint 20+.
- **Prompt caching** — 90% input token savings. Low risk, high ROI. Target Sprint 19-20.
- **Research synthesis reliability** — Root cause investigation for synthesis failures. The research engine is the killer feature — must be near-zero failure rate.
- **Build-to-app pipeline** — Alex and Priya want "build X" to produce interactive apps, not text cards. P2 but high-leverage for marketing demos.
- **Interactive onboarding flow** — Replace 11 tiles + 6 prompts with 3-step guided demo.

**Things that are fine as-is (do not over-engineer):**
- Photo engine (H&D curves, LAB color, luminosity masking) — superior to external APIs
- Virtual scrolling + CSS containment — working, don't touch
- App ecosystem (15 apps, 114 tools) — well-segmented, no merges needed
- Photo Studio / Media Gallery boundary — RESOLVED and VALIDATED across 2 sprints
- Schema validation — test suite active, graceful degradation as defense-in-depth
- Error message classification — test suite active, no regressions
- Marketing content quality — landing page, social posts, competitive positioning all high quality
- Onboarding tile order — /code first, Build first prompts (Sprint 18)

**Marketing infrastructure status:**
| Asset | Status | Sprint 18 Action |
|---|---|---|
| OG meta tags | 7/10 — functional, SVG image gap | Added 14 tags |
| Landing page | 7/10 — content ready, not deployed | Created HTML file |
| README | 8/10 — marketing funnel format | Restructured |
| Competitive positioning | 7/10 — inconsistency to fix | Created one-pager |
| Social posts | 9/10 — 8 posts ready | Created 8 drafts |
| Demo video | 7/10 — storyboard ready | Created storyboard |
| CONTRIBUTING.md | 8/10 — at project root | Created guide |
| Community channels | 0/10 — no Discord/forum | Not addressed |
| Deployed landing page | 0/10 — nothing live | Not addressed |

---

## What's Been Tried

**Deferred (attempted but not completed, with sprint context):**
- SSE Streaming (ADR-004): Designed Sprint 13, deprioritized indefinitely (6+ sprints).
- MCP client: Design since Sprint 12, no code. Target Sprint 20+ (after server.ts decomposition).
- SQLite-backed CardContextStore: Design ready, deferred every sprint.
- Playwright E2E framework: Proposed Sprint 14, deferred (5+ sprints).
- server.ts decomposition IMPLEMENTATION: Designed Sprint 17, deferred Sprint 18 (marketing priority). Target Sprint 19.

**Tried and confirmed working (don't revert):**
- @tanstack/react-virtual for CardTimeline: Virtual scrolling implemented and stable
- CSS containment (.card-contain): Implemented and stable
- Code splitting for heavy card types: 9 types lazy-loaded, working
- Mobile chat transition animation (.mobile-chat-enter): Working
- Long-press-to-PTT on textarea (Doubao-style): Working since Sprint 14
- Doubao visible mode toggle (inputMode state): Implemented Sprint 15, working
- ChatInput stale ref fix via state mirror pattern (pttAccumulatedText): Sprint 15 → usePushToTalk Sprint 16
- OrchestrationCard React.memo wrapper: Implemented Sprint 15, verified Sprint 16–18
- Photo Studio misrouting fix (negative constraints in import_photos): Sprint 16, validated Sprint 17
- /code client connection fix (context injection, 3-tier fallback): Sprint 16, partially validated Sprint 17
- Error message classification (system vs user errors): Sprint 16, validated Sprint 17-18
- Tool schema graceful degradation (validateFunctionDeclaration): Sprint 16, validated Sprint 17-18
- Touch target enforcement Phase 1+2: Sprint 16-17, complete
- ChatInput Phase 1+2 decomposition (1205→525 LOC): Sprint 16-17
- Assignment matrix gate (zero orphans before Phase 5): Sprint 16, PERMANENT process gate (3 consecutive)
- Schema validation test (245 tests, all app.json schemas): Sprint 17
- Error classification test (34 tests, both layers): Sprint 17
- Project selector auto-context (defaultProjectCwd fallback): Sprint 17
- Cross-session contamination fix (composite key): Sprint 17, VALIDATED Sprint 18
- server.ts decomposition DESIGN (269 LOC, 5 modules): Sprint 17
- **Sprint 18 marketing approaches:**
  - OG meta tags: 14 tags (8 OG + 4 Twitter + canonical + favicon). Working but SVG image needs PNG conversion.
  - README restructure as marketing funnel: value prop → comparison table → quickstart → pillars → capabilities
  - Landing page as self-contained HTML: 641 lines, dark theme, responsive, inline CSS, zero JS
  - Competitive one-pager: 13-feature comparison across 6 competitors
  - Social media content: 8 posts across 5 platforms (Twitter×3, LinkedIn, HN, Reddit×2, Product Hunt)
  - Demo storyboard: 90-second script with 30-second social cut
  - CONTRIBUTING.md: Quick start, contribution categories, app dev guide
  - WelcomeCard onboarding reorder: /code first tile, Build first prompt
  - ThinkingCard timeout escalation: 15s timer → 30s "still working" → 60s "taking longer"
  - Research error propagation: server.ts catch block sends error state to client

**Tried and found not needed:**
- Replacing photo engine with external neural style transfer APIs: Photo engine is already superior
- Implementing adaptive thinking: Already active in claude-code.ts L366

**Architectural decisions pending:**
- server.ts decomposition IMPLEMENTATION: Design ready. 5 modules, extraction order defined. Sprint 19 MANDATORY.
- ChatInput Phase 3: 525 → <500 LOC. Shell mode banner or voice toggle. Low priority.
- SVG → PNG OG image conversion: Needs external tool or build step. Sprint 19 pre-launch.
- Landing page deployment: GitHub Pages vs Cloudflare vs Vite route. Sprint 19 decision.

---

## Persona Evolution Notes

*Running observations about each persona's relationship with the product.*

**Marco Reyes (creative-professional) — SERVER-SIDE TIMEOUTS ARE THE BLOCKER (Sprint 18):**
- Sprint 15: 4.2/10. Sprint 16: 1.5/10. Sprint 17: 2.5/10. Sprint 18: 3.5/10 (+1.0).
- Sprint 18 MANDATORY retest completed: Contamination fix VALIDATED (0/2 leakage). Schema fix VALIDATED (0 errors). Error classification VALIDATED (0 "try rephrasing").
- Misrouting fix STILL UNVALIDATABLE — 3/5 scenarios silently timeout, preventing test execution. This is now a 4-sprint unvalidated fix.
- **Root cause identified**: The issue is NOT client UI (ThinkingCard/TypingIndicator exist and work). The issue is server-side: filesystem/gallery requests silently fail or timeout without sending any response to the client.
- When responses arrive (2/5), quality is genuinely good — S5 photo culling tool design rated 91% relevance.
- **Sprint 19 focus**: Server-side diagnostic for creative workflow timeouts. This is blocking all creative professional marketing.

**Priya Sharma (indie-developer) — STEADY IMPROVEMENT, /CODE IS THE AHA MOMENT (Sprint 18):**
- Sprint 15: 4.8/10. Sprint 16: 2.6/10. Sprint 17: 6.2/10. Sprint 18: 6.8/10 (+0.6).
- /code instant launch (S1) is the proven "aha moment" — zero clarifying questions, immediate Claude Code terminal.
- Research quality strong (S2: structured analysis with action buttons, 12s response time).
- **New issue**: Deep research synthesis failure (S4: 48 sources found, "AI synthesis failed — showing raw results"). Error propagation fix deployed but root cause uninvestigated.
- "Design instead of build" regression still present (S3: "Create a todo app" → conceptual design, not running app).
- Shell mode directory mismatch (S5: opens in D:\Github instead of D:\Github\Enso) — not addressed.
- **Sprint 19 focus**: Research synthesis reliability. Verify ThinkingCard improvements.

**Jordan Kim (developer) — NOT TESTED Sprint 18:**
- Sprint 15: 6.4/10. Sprint 16: 4.0/10. Sprint 17: 4.5/10. Sprint 18: NOT TESTED.
- ThinkingCard timeout escalation was added this sprint but not validated with Jordan.
- Touch targets completed Phase 1+2 (Sprint 16-17), needs revalidation.
- **Sprint 19 focus**: Retest to validate ThinkingCard improvements and touch target persistence.

**Alex Chen (startup-founder) — RESEARCH VALIDATED, MARKETING GAPS IDENTIFIED (Sprint 18):**
- Sprint 12: ~4.0/10. Sprint 17: 6.8/10. Sprint 18: 8.2/10 (+1.4 — largest single-sprint improvement).
- Marketing evaluation added this sprint: Social shareability 2/10 (pre-fix), Value prop clarity 8/10, Demo-readiness 6/10.
- Research quality is the killer feature: SaaS market analysis in 14s with 5 verticals, AI displacement strategies, action buttons.
- OG tags fixed (was 0, now functional), WelcomeCard reordered (/code first).
- Remaining gaps: Orchestration misrouting (S2: pitch deck → solo founder essay), context leaks between chats (S3, S5).
- **Sprint 19 focus**: Validate OG tag improvements in social sharing. Test demo golden path (research → /code).

---

## Uncommitted Changes Tracker

*Significant uncommitted work that should not be lost or forgotten across sprints.*

**Sprint 18 new changes (cumulative with Sprint 15-17):**

Sprint 15-17 uncommitted changes still present (see Sprint 17 brain entry for full list).

Sprint 18 new changes:
- `index.html` — 14 OG/Twitter meta tags, canonical URL, favicon link, updated title
- `public/og-image.svg` (NEW) — 1200×630 branded OG image with dark theme, tagline, three pillars
- `src/components/WelcomeCard.tsx` — TEMPLATES reorder (/code first), SUGGESTED_PROMPTS reorder (Build first)
- `src/components/ThinkingCard.tsx` — Timeout escalation (15s timer, 30s/60s message changes)
- `server/src/server.ts` — Research error propagation catch block (+7 LOC at line 293)
- `README.md` — Full restructure as marketing funnel (~115 LOC, down from 289)
- `CONTRIBUTING.md` (NEW) — Community contribution guide
- `marketing/landing-page.html` (NEW) — 641-line self-contained landing page
- `marketing/why-enso.md` (NEW) — Competitive one-pager
- `marketing/social-posts.md` (NEW) — 8 social media posts across 5 platforms
- `marketing/demo-storyboard.md` (NEW) — 90-second demo video storyboard

---

*Last updated: Sprint 18 meta-review (2026-04-02)*
*Next update: Phase 6 meta-review of Sprint 19*
