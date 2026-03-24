#!/usr/bin/env node
/**
 * personalize.js — Direct source code modification for app personalization.
 *
 * Called by ./setup to customize the Enso codebase for a specific user.
 * Instead of runtime config, this modifies the actual source files so the
 * user's codebase IS their custom app. Future /evolve sprints can modify
 * these same files further.
 *
 * Usage: node scripts/personalize.js <json>
 *   where <json> is: { userName, userRole, appName, persona }
 *
 * Persona IDs: tech-founder, developer, researcher, investor, creative, product-manager
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

// ── Persona definitions ──

const PERSONAS = {
  "tech-founder": {
    tagline: "Your AI command center",
    subtitle: "Research markets, orchestrate teams, build products, and evolve your vision — all from one place.",
    accent: "indigo",
    templates: [
      '{ icon: "🔍", titleKey: "welcome.tile.researcher", descKey: "welcome.tile.researcher.desc", toolFamily: "researcher" }',
      '{ icon: "💻", titleKey: "welcome.tile.codeAssistant", descKey: "welcome.tile.codeAssistant.desc", prompt: "/code" }',
      '{ icon: "⚡", titleKey: "welcome.tile.orchestrate", descKey: "welcome.tile.orchestrate.desc", prompt: "/orchestrate" }',
      '{ icon: "📁", titleKey: "welcome.tile.projects", descKey: "welcome.tile.projects.desc", prompt: "/projects" }',
      '{ icon: "🔬", titleKey: "welcome.tile.discover", descKey: "welcome.tile.discover.desc", prompt: "/discover" }',
      '{ icon: "🧬", titleKey: "welcome.tile.evolve", descKey: "welcome.tile.evolve.desc", prompt: "/evolve" }',
      '{ icon: "📁", titleKey: "welcome.tile.browseFiles", descKey: "welcome.tile.browseFiles.desc", toolFamily: "filesystem" }',
      '{ icon: "🖥️", titleKey: "welcome.tile.terminal", descKey: "welcome.tile.terminal.desc", prompt: "/shell" }',
      '{ icon: "📊", titleKey: "welcome.tile.sessions", descKey: "welcome.tile.sessions.desc", prompt: "/sessions" }',
    ],
    prompts: {
      "welcome.prompt.research": "Analyze the competitive landscape for AI-powered SaaS tools",
      "welcome.prompt.compare": "Compare AWS vs GCP vs Azure for startup infrastructure",
      "welcome.prompt.build": "Build a metrics dashboard tracking MRR, churn, and CAC",
      "welcome.prompt.diagram": "Design a system architecture for a multi-tenant SaaS platform",
      "welcome.prompt.create": "Create a 90-day product launch roadmap",
      "welcome.prompt.explain": "Research the latest YC batch trends and investment themes",
    },
  },
  "developer": {
    tagline: "AI-powered development",
    subtitle: "Write code, debug, research APIs, orchestrate complex builds, and ship faster with AI assistance.",
    accent: "emerald",
    templates: [
      '{ icon: "💻", titleKey: "welcome.tile.codeAssistant", descKey: "welcome.tile.codeAssistant.desc", prompt: "/code" }',
      '{ icon: "🔍", titleKey: "welcome.tile.researcher", descKey: "welcome.tile.researcher.desc", toolFamily: "researcher" }',
      '{ icon: "⚡", titleKey: "welcome.tile.orchestrate", descKey: "welcome.tile.orchestrate.desc", prompt: "/orchestrate" }',
      '{ icon: "🖥️", titleKey: "welcome.tile.terminal", descKey: "welcome.tile.terminal.desc", prompt: "/shell" }',
      '{ icon: "📁", titleKey: "welcome.tile.browseFiles", descKey: "welcome.tile.browseFiles.desc", toolFamily: "filesystem" }',
      '{ icon: "📊", titleKey: "welcome.tile.sessions", descKey: "welcome.tile.sessions.desc", prompt: "/sessions" }',
      '{ icon: "📁", titleKey: "welcome.tile.projects", descKey: "welcome.tile.projects.desc", prompt: "/projects" }',
      '{ icon: "🧬", titleKey: "welcome.tile.evolve", descKey: "welcome.tile.evolve.desc", prompt: "/evolve" }',
    ],
    prompts: {
      "welcome.prompt.research": "Explain the difference between React Server Components and SSR",
      "welcome.prompt.compare": "Compare Bun vs Deno vs Node.js for a new project in 2026",
      "welcome.prompt.build": "Build a REST API with authentication and rate limiting",
      "welcome.prompt.diagram": "Design a CI/CD pipeline with GitHub Actions and Docker",
      "welcome.prompt.create": "Set up a monorepo with turborepo, shared packages, and type safety",
      "welcome.prompt.explain": "Debug: Cannot read properties of undefined — common causes and fixes",
    },
  },
  "researcher": {
    tagline: "Deep research, clear answers",
    subtitle: "Explore topics in depth with live web sources, synthesize findings, and build knowledge — powered by AI.",
    accent: "blue",
    templates: [
      '{ icon: "🔍", titleKey: "welcome.tile.researcher", descKey: "welcome.tile.researcher.desc", toolFamily: "researcher" }',
      '{ icon: "⚡", titleKey: "welcome.tile.orchestrate", descKey: "welcome.tile.orchestrate.desc", prompt: "/orchestrate" }',
      '{ icon: "📁", titleKey: "welcome.tile.browseFiles", descKey: "welcome.tile.browseFiles.desc", toolFamily: "filesystem" }',
      '{ icon: "💻", titleKey: "welcome.tile.codeAssistant", descKey: "welcome.tile.codeAssistant.desc", prompt: "/code" }',
      '{ icon: "📁", titleKey: "welcome.tile.projects", descKey: "welcome.tile.projects.desc", prompt: "/projects" }',
      '{ icon: "🧬", titleKey: "welcome.tile.evolve", descKey: "welcome.tile.evolve.desc", prompt: "/evolve" }',
      '{ icon: "📊", titleKey: "welcome.tile.sessions", descKey: "welcome.tile.sessions.desc", prompt: "/sessions" }',
    ],
    prompts: {
      "welcome.prompt.research": "Research the latest developments in quantum computing 2026",
      "welcome.prompt.compare": "Compare meta-analysis methods for clinical trial data",
      "welcome.prompt.build": "Build a literature review matrix for gene therapy approaches",
      "welcome.prompt.diagram": "Map the key players and relationships in the AI chip industry",
      "welcome.prompt.create": "Summarize recent papers on transformer architecture improvements",
      "welcome.prompt.explain": "Explain the current state of nuclear fusion research",
    },
  },
  "investor": {
    tagline: "Market intelligence, amplified",
    subtitle: "Research markets, analyze opportunities, track trends, and make informed decisions with AI-powered insights.",
    accent: "teal",
    templates: [
      '{ icon: "🔍", titleKey: "welcome.tile.researcher", descKey: "welcome.tile.researcher.desc", toolFamily: "researcher" }',
      '{ icon: "🔬", titleKey: "welcome.tile.discover", descKey: "welcome.tile.discover.desc", prompt: "/discover" }',
      '{ icon: "⚡", titleKey: "welcome.tile.orchestrate", descKey: "welcome.tile.orchestrate.desc", prompt: "/orchestrate" }',
      '{ icon: "📁", titleKey: "welcome.tile.projects", descKey: "welcome.tile.projects.desc", prompt: "/projects" }',
      '{ icon: "💻", titleKey: "welcome.tile.codeAssistant", descKey: "welcome.tile.codeAssistant.desc", prompt: "/code" }',
      '{ icon: "🧬", titleKey: "welcome.tile.evolve", descKey: "welcome.tile.evolve.desc", prompt: "/evolve" }',
      '{ icon: "📊", titleKey: "welcome.tile.sessions", descKey: "welcome.tile.sessions.desc", prompt: "/sessions" }',
    ],
    prompts: {
      "welcome.prompt.research": "Analyze the semiconductor industry outlook for 2026-2027",
      "welcome.prompt.compare": "Compare revenue growth of NVIDIA vs AMD vs Intel last 4 quarters",
      "welcome.prompt.build": "Build a stock screening dashboard with P/E, growth, and momentum",
      "welcome.prompt.diagram": "Map the AI startup ecosystem — key players, funding, and segments",
      "welcome.prompt.create": "Create a due diligence checklist for evaluating SaaS companies",
      "welcome.prompt.explain": "What are the macro risks to tech stocks this quarter?",
    },
  },
  "creative": {
    tagline: "Create without limits",
    subtitle: "Generate ideas, produce content, manage media, and build creative tools — with AI as your creative partner.",
    accent: "rose",
    templates: [
      '{ icon: "🔍", titleKey: "welcome.tile.researcher", descKey: "welcome.tile.researcher.desc", toolFamily: "researcher" }',
      '{ icon: "🖼️", titleKey: "welcome.tile.photoGallery", descKey: "welcome.tile.photoGallery.desc", toolFamily: "media_gallery" }',
      '{ icon: "⚡", titleKey: "welcome.tile.orchestrate", descKey: "welcome.tile.orchestrate.desc", prompt: "/orchestrate" }',
      '{ icon: "💻", titleKey: "welcome.tile.codeAssistant", descKey: "welcome.tile.codeAssistant.desc", prompt: "/code" }',
      '{ icon: "📁", titleKey: "welcome.tile.browseFiles", descKey: "welcome.tile.browseFiles.desc", toolFamily: "filesystem" }',
      '{ icon: "📁", titleKey: "welcome.tile.projects", descKey: "welcome.tile.projects.desc", prompt: "/projects" }',
      '{ icon: "🧬", titleKey: "welcome.tile.evolve", descKey: "welcome.tile.evolve.desc", prompt: "/evolve" }',
    ],
    prompts: {
      "welcome.prompt.research": "Research the best AI tools for video editing in 2026",
      "welcome.prompt.compare": "Compare Figma vs Framer vs Webflow for landing page design",
      "welcome.prompt.build": "Build a mood board tool with drag-and-drop image organization",
      "welcome.prompt.diagram": "Design a brand identity system for a luxury wellness startup",
      "welcome.prompt.create": "Create a 30-day social media content calendar for a fashion brand",
      "welcome.prompt.explain": "Generate 10 blog post ideas about sustainable design trends",
    },
  },
  "product-manager": {
    tagline: "Navigate complexity with AI",
    subtitle: "Plan roadmaps, coordinate teams, track progress, and make data-driven product decisions.",
    accent: "violet",
    templates: [
      '{ icon: "📁", titleKey: "welcome.tile.projects", descKey: "welcome.tile.projects.desc", prompt: "/projects" }',
      '{ icon: "⚡", titleKey: "welcome.tile.orchestrate", descKey: "welcome.tile.orchestrate.desc", prompt: "/orchestrate" }',
      '{ icon: "🔍", titleKey: "welcome.tile.researcher", descKey: "welcome.tile.researcher.desc", toolFamily: "researcher" }',
      '{ icon: "🧬", titleKey: "welcome.tile.evolve", descKey: "welcome.tile.evolve.desc", prompt: "/evolve" }',
      '{ icon: "🔬", titleKey: "welcome.tile.discover", descKey: "welcome.tile.discover.desc", prompt: "/discover" }',
      '{ icon: "💻", titleKey: "welcome.tile.codeAssistant", descKey: "welcome.tile.codeAssistant.desc", prompt: "/code" }',
      '{ icon: "📊", titleKey: "welcome.tile.sessions", descKey: "welcome.tile.sessions.desc", prompt: "/sessions" }',
    ],
    prompts: {
      "welcome.prompt.research": "Research best practices for user onboarding flows in 2026",
      "welcome.prompt.compare": "Compare project management tools: Linear vs Jira vs Notion",
      "welcome.prompt.build": "Build a feature prioritization matrix using RICE scoring",
      "welcome.prompt.diagram": "Design a product analytics dashboard tracking key user metrics",
      "welcome.prompt.create": "Create a product requirements document for user authentication",
      "welcome.prompt.explain": "Draft sprint planning notes for a 2-week iteration",
    },
  },
};

// ── Persona matching ──

const KEYWORDS = {
  "tech-founder": ["founder", "ceo", "startup", "entrepreneur", "business owner", "co-founder"],
  "developer": ["developer", "engineer", "programmer", "coder", "software", "frontend", "backend", "full-stack", "devops", "sre"],
  "researcher": ["researcher", "academic", "professor", "scientist", "analyst", "phd", "student", "data", "intelligence"],
  "investor": ["investor", "finance", "trading", "portfolio", "hedge", "fund", "quant", "stocks", "crypto", "venture", "vc", "capital"],
  "creative": ["creative", "designer", "artist", "content", "creator", "marketing", "brand", "writer", "photographer", "video", "media"],
  "product-manager": ["product", "manager", "project", "lead", "pm", "scrum", "agile", "roadmap"],
};

function matchPersona(userRole) {
  const words = userRole.toLowerCase().split(/[\s,;/&+]+/);
  let best = null, bestScore = 0;
  for (const [id, keywords] of Object.entries(KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      for (const w of words) {
        if (w.includes(kw) || kw.includes(w)) score += kw.length;
      }
    }
    if (score > bestScore) { bestScore = score; best = id; }
  }
  return best;
}

// ── File modification helpers ──

function replaceInFile(filePath, search, replacement) {
  const abs = path.join(ROOT, filePath);
  let content = fs.readFileSync(abs, "utf-8");
  if (typeof search === "string") {
    if (!content.includes(search)) {
      console.error(`  ⚠ Pattern not found in ${filePath}: "${search.slice(0, 60)}..."`);
      return false;
    }
    content = content.replace(search, replacement);
  } else {
    content = content.replace(search, replacement);
  }
  fs.writeFileSync(abs, content, "utf-8");
  return true;
}

function updateJsonFile(filePath, updates) {
  const abs = path.join(ROOT, filePath);
  const data = JSON.parse(fs.readFileSync(abs, "utf-8"));
  for (const [key, value] of Object.entries(updates)) {
    data[key] = value;
  }
  fs.writeFileSync(abs, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

// ── Main ──

function personalize(config) {
  const { userName, userRole, appName, persona: forcedPersona } = config;
  const personaId = forcedPersona || matchPersona(userRole);
  const persona = PERSONAS[personaId];

  if (!persona) {
    console.log(`  ℹ No matching persona for "${userRole}" — keeping defaults`);
    // Still update the app name if provided
    if (appName && appName !== "Enso") {
      replaceInFile("src/App.tsx",
        '<h1 className="text-sm sm:text-base font-semibold tracking-tight">Enso</h1>',
        `<h1 className="text-sm sm:text-base font-semibold tracking-tight">${appName}</h1>`
      );
      console.log(`  ✓ App name: ${appName}`);
    }
    return { personaId: "default", appName: appName || "Enso" };
  }

  const finalAppName = appName || personaId.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join("");

  console.log(`  → Persona: ${personaId}`);
  console.log(`  → App: ${finalAppName} — "${persona.tagline}"`);

  // 1. Update App.tsx header — app name
  replaceInFile("src/App.tsx",
    '<h1 className="text-sm sm:text-base font-semibold tracking-tight">Enso</h1>',
    `<h1 className="text-sm sm:text-base font-semibold tracking-tight">${finalAppName}</h1>`
  );

  // 2. Update i18n — tagline and subtitle
  updateJsonFile("src/lib/i18n/en.json", {
    "welcome.tagline": persona.tagline,
    "welcome.subtitle": persona.subtitle,
  });
  // Also update Chinese if it has these keys
  try {
    updateJsonFile("src/lib/i18n/zh.json", {
      "welcome.tagline": persona.tagline,
      "welcome.subtitle": persona.subtitle,
    });
  } catch {}

  // 3. Update i18n — suggested prompts
  if (persona.prompts) {
    updateJsonFile("src/lib/i18n/en.json", persona.prompts);
  }

  // 4. Update WelcomeCard.tsx — reorder TEMPLATES array
  if (persona.templates) {
    const templatesStr = "const TEMPLATES: Template[] = [\n  " +
      persona.templates.join(",\n  ") +
      ",\n];";
    replaceInFile("src/components/WelcomeCard.tsx",
      /const TEMPLATES: Template\[\] = \[[\s\S]*?\];/,
      templatesStr
    );
  }

  // 5. Update manifest.json — PWA name
  try {
    const manifestPath = path.join(ROOT, "public/manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    manifest.name = finalAppName;
    manifest.short_name = finalAppName;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  } catch {}

  // 6. Update capacitor.config.ts — Android app name
  replaceInFile("capacitor.config.ts",
    /appName: "[^"]*"/,
    `appName: "${finalAppName}"`
  );

  // 7. Save user profile for future reference
  const profileDir = path.join(process.env.HOME || process.env.USERPROFILE || "", ".enso");
  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(path.join(profileDir, "user-profile.json"), JSON.stringify({
    userName,
    userRole,
    appName: finalAppName,
    persona: personaId,
    createdAt: new Date().toISOString(),
  }, null, 2) + "\n");

  console.log(`  ✓ Source code personalized`);
  console.log(`  ✓ Profile saved to ~/.enso/user-profile.json`);

  return { personaId, appName: finalAppName };
}

// ── CLI entry ──

const input = process.argv[2];
if (!input) {
  console.error("Usage: node scripts/personalize.js '<json>'");
  process.exit(1);
}

try {
  const config = JSON.parse(input);
  const result = personalize(config);
  // Output result as JSON for the setup script to parse
  console.log("PERSONALIZE_RESULT:" + JSON.stringify(result));
} catch (err) {
  console.error("  ✗ Personalization failed:", err.message);
  process.exit(1);
}
