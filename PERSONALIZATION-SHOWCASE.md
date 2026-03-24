# Enso Personalized App Showcase

> **The concept**: Every Enso installation includes the complete source code and build pipeline.
> During setup, the user answers 3 questions (name, role, app name) and the system directly
> modifies the source code to create a personalized app experience. No runtime config layers —
> the codebase IS the customization. Future `/evolve` sprints continue to refine the same source.

## How It Works

1. User runs `./setup` and answers: **name**, **what they do**, **app name**
2. Persona matching finds the best fit from 6 archetypes
3. `scripts/personalize.cjs` directly modifies source files:
   - `src/App.tsx` — header app name
   - `src/lib/i18n/en.json` — tagline, subtitle, suggested prompts
   - `src/components/WelcomeCard.tsx` — tool tile order and selection
   - `public/manifest.json` — PWA name
   - `capacitor.config.ts` — Android app name
4. `npm run build` compiles the personalized source into the production bundle
5. The resulting APK is a completely custom app — different name, different prompts, different tool layout

---

## Atlas — for Alex Chen (AI startup founder, CEO)

| Aspect | Value |
|--------|-------|
| **Persona** | `tech-founder` |
| **Header** | Atlas |
| **Tagline** | Your AI command center |
| **Subtitle** | Research markets, orchestrate teams, build products, and evolve your vision — all from one place. |
| **Top Tools** | researcher.desc,codeAssistant.desc,orchestrate.desc,projects.desc,discover.desc,evolve.desc |
| **Android Name** | Atlas |
| **PWA Name** | Atlas |

**Suggested Prompts:**
- Analyze the competitive landscape for AI-powered SaaS tools
- Build a metrics dashboard tracking MRR, churn, and CAC
- Create a 90-day product launch roadmap

---

## Forge — for Jordan Kim (Senior full-stack developer, TypeScript engineer)

| Aspect | Value |
|--------|-------|
| **Persona** | `developer` |
| **Header** | Forge |
| **Tagline** | AI-powered development |
| **Subtitle** | Write code, debug, research APIs, orchestrate complex builds, and ship faster with AI assistance. |
| **Top Tools** | codeAssistant.desc,researcher.desc,orchestrate.desc,terminal.desc,browseFiles.desc,sessions.desc |
| **Android Name** | Forge |
| **PWA Name** | Forge |

**Suggested Prompts:**
- Explain the difference between React Server Components and SSR
- Build a REST API with authentication and rate limiting
- Set up a monorepo with turborepo, shared packages, and type safety

---

## Nexus — for Maya Patel (PhD researcher, computational biology, data scientist)

| Aspect | Value |
|--------|-------|
| **Persona** | `researcher` |
| **Header** | Nexus |
| **Tagline** | Deep research, clear answers |
| **Subtitle** | Explore topics in depth with live web sources, synthesize findings, and build knowledge — powered by AI. |
| **Top Tools** | researcher.desc,orchestrate.desc,browseFiles.desc,codeAssistant.desc,projects.desc,evolve.desc |
| **Android Name** | Nexus |
| **PWA Name** | Nexus |

**Suggested Prompts:**
- Research the latest developments in quantum computing 2026
- Build a literature review matrix for gene therapy approaches
- Summarize recent papers on transformer architecture improvements

---

## Signal — for Marcus Lee (Quantitative investor, venture capital, portfolio manager)

| Aspect | Value |
|--------|-------|
| **Persona** | `investor` |
| **Header** | Signal |
| **Tagline** | Market intelligence, amplified |
| **Subtitle** | Research markets, analyze opportunities, track trends, and make informed decisions with AI-powered insights. |
| **Top Tools** | researcher.desc,discover.desc,orchestrate.desc,projects.desc,codeAssistant.desc,evolve.desc |
| **Android Name** | Signal |
| **PWA Name** | Signal |

**Suggested Prompts:**
- Analyze the semiconductor industry outlook for 2026-2027
- Build a stock screening dashboard with P/E, growth, and momentum
- Create a due diligence checklist for evaluating SaaS companies

---

## Studio — for Leo Morales (Content creator, brand strategist, video producer)

| Aspect | Value |
|--------|-------|
| **Persona** | `creative` |
| **Header** | Studio |
| **Tagline** | Create without limits |
| **Subtitle** | Generate ideas, produce content, manage media, and build creative tools — with AI as your creative partner. |
| **Top Tools** | researcher.desc,photoGallery.desc,orchestrate.desc,codeAssistant.desc,browseFiles.desc,projects.desc |
| **Android Name** | Studio |
| **PWA Name** | Studio |

**Suggested Prompts:**
- Research the best AI tools for video editing in 2026
- Build a mood board tool with drag-and-drop image organization
- Create a 30-day social media content calendar for a fashion brand

---

## Compass — for Sarah Chen (Senior product manager, agile, roadmap planning)

| Aspect | Value |
|--------|-------|
| **Persona** | `product-manager` |
| **Header** | Compass |
| **Tagline** | Navigate complexity with AI |
| **Subtitle** | Plan roadmaps, coordinate teams, track progress, and make data-driven product decisions. |
| **Top Tools** | projects.desc,orchestrate.desc,researcher.desc,evolve.desc,discover.desc,codeAssistant.desc |
| **Android Name** | Compass |
| **PWA Name** | Compass |

**Suggested Prompts:**
- Research best practices for user onboarding flows in 2026
- Build a feature prioritization matrix using RICE scoring
- Create a product requirements document for user authentication

---

## What Makes This Unique

Traditional apps ship **one experience for millions of users**. Enso ships a **personal evolution for each user**.

- **No runtime config layer** — the source code IS the customization
- **Every user owns the factory** — complete source + build pipeline + evolution engine
- **The app evolves** — `/evolve` sprints continue to modify the same source files
- **APK is a snapshot** — each build captures the current state of the user's personal tool
- **Unlimited freedom** — Claude Code can modify ANY file, not just what config allows

This is not theming. This is not configuration. This is **recompilation with a new identity**.
