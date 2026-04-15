/**
 * Team Generator — Auto-compose AI teams and personas for new projects.
 *
 * Given a project description, tech stack, and codebase path, generates:
 * 1. Domain-specific team agents (with roles, goals, perspectives)
 * 2. Target user personas (with backgrounds, goals, test scenarios)
 *
 * Uses Gemini Flash for fast structured output.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, basename, extname } from "path";
import { llm } from "./llm.js";
import { logAction, logError } from "./action-log.js";
import type { TeamAgent, Persona } from "./project-manager.js";

// ── Codebase Scanner ──

interface CodebaseScan {
  languages: string[];
  frameworks: string[];
  entryPoints: string[];
  keyFiles: string[];
  readmeExcerpt: string;
  packageDescription: string;
  structure: string;
}

const LANG_MAP: Record<string, string> = {
  ".py": "Python", ".js": "JavaScript", ".ts": "TypeScript", ".tsx": "TypeScript/React",
  ".jsx": "React", ".go": "Go", ".rs": "Rust", ".java": "Java", ".kt": "Kotlin",
  ".swift": "Swift", ".rb": "Ruby", ".cs": "C#", ".cpp": "C++", ".c": "C",
};

const FRAMEWORK_HINTS: Record<string, string> = {
  "requirements.txt": "Python", "setup.py": "Python", "pyproject.toml": "Python",
  "package.json": "Node.js", "tsconfig.json": "TypeScript",
  "Cargo.toml": "Rust", "go.mod": "Go", "Gemfile": "Ruby",
  "build.gradle": "Gradle/Java", "pom.xml": "Maven/Java",
  "CMakeLists.txt": "CMake/C++", "Makefile": "Make",
  "Dockerfile": "Docker", "docker-compose.yml": "Docker Compose",
  ".github": "GitHub Actions", "Jenkinsfile": "Jenkins",
};

function scanCodebase(codebasePath: string): CodebaseScan {
  const result: CodebaseScan = {
    languages: [], frameworks: [], entryPoints: [], keyFiles: [],
    readmeExcerpt: "", packageDescription: "", structure: "",
  };

  if (!existsSync(codebasePath)) return result;

  try {
    const topLevel = readdirSync(codebasePath, { withFileTypes: true });
    const dirs: string[] = [];
    const files: string[] = [];
    const langSet = new Set<string>();
    const frameworkSet = new Set<string>();

    for (const entry of topLevel) {
      const name = entry.name;
      if (name.startsWith(".") && name !== ".github") continue;
      if (name === "node_modules" || name === "__pycache__" || name === ".git" || name === "venv") continue;

      if (entry.isDirectory()) {
        dirs.push(name + "/");
        // Check for framework hints in directories
        if (FRAMEWORK_HINTS[name]) frameworkSet.add(FRAMEWORK_HINTS[name]);
      } else {
        files.push(name);
        const ext = extname(name);
        if (LANG_MAP[ext]) langSet.add(LANG_MAP[ext]);
        if (FRAMEWORK_HINTS[name]) frameworkSet.add(FRAMEWORK_HINTS[name]);
      }
    }

    // Read README
    for (const readme of ["README.md", "readme.md", "README.rst", "README.txt", "README"]) {
      const readmePath = join(codebasePath, readme);
      if (existsSync(readmePath)) {
        const content = readFileSync(readmePath, "utf-8");
        result.readmeExcerpt = content.slice(0, 2000);
        break;
      }
    }

    // Read package.json description
    const pkgPath = join(codebasePath, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (pkg.description) result.packageDescription = pkg.description;
        if (pkg.dependencies) {
          const deps = Object.keys(pkg.dependencies);
          if (deps.includes("react")) frameworkSet.add("React");
          if (deps.includes("next")) frameworkSet.add("Next.js");
          if (deps.includes("express")) frameworkSet.add("Express");
          if (deps.includes("fastify")) frameworkSet.add("Fastify");
          if (deps.includes("electron")) frameworkSet.add("Electron");
          if (deps.includes("vue")) frameworkSet.add("Vue");
          if (deps.includes("angular")) frameworkSet.add("Angular");
        }
      } catch { /* ignore parse errors */ }
    }

    // Read requirements.txt for Python frameworks
    const reqPath = join(codebasePath, "requirements.txt");
    if (existsSync(reqPath)) {
      const req = readFileSync(reqPath, "utf-8").toLowerCase();
      if (req.includes("django")) frameworkSet.add("Django");
      if (req.includes("flask")) frameworkSet.add("Flask");
      if (req.includes("fastapi")) frameworkSet.add("FastAPI");
      if (req.includes("scikit-learn") || req.includes("sklearn")) frameworkSet.add("scikit-learn");
      if (req.includes("tensorflow")) frameworkSet.add("TensorFlow");
      if (req.includes("pytorch") || req.includes("torch")) frameworkSet.add("PyTorch");
      if (req.includes("lightgbm")) frameworkSet.add("LightGBM");
      if (req.includes("pandas")) frameworkSet.add("Pandas");
    }

    // Identify key files (entry points, configs)
    const entryHints = ["main.py", "app.py", "index.ts", "index.js", "server.ts", "server.js",
      "main.go", "main.rs", "Main.java", "daily_routine.py", "manage.py"];
    for (const f of files) {
      if (entryHints.includes(f)) result.entryPoints.push(f);
    }

    // Build structure string
    result.structure = [...dirs.sort(), ...files.sort()].join("\n");
    result.languages = [...langSet];
    result.frameworks = [...frameworkSet];
    result.keyFiles = files.filter(f =>
      f.endsWith(".md") || f.endsWith(".json") || f.endsWith(".yaml") || f.endsWith(".yml") ||
      f.endsWith(".toml") || entryHints.includes(f)
    ).slice(0, 15);

    // Scan one level deep for more language/framework info
    for (const dir of dirs.slice(0, 10)) {
      try {
        const subEntries = readdirSync(join(codebasePath, dir));
        for (const sub of subEntries.slice(0, 30)) {
          const ext = extname(sub);
          if (LANG_MAP[ext]) langSet.add(LANG_MAP[ext]);
        }
      } catch { /* skip permission errors */ }
    }
    result.languages = [...langSet];

  } catch (err) {
    logError("team-generator", "Codebase scan failed", err);
  }

  return result;
}

// ── Team Generation ──

export interface GenerateTeamParams {
  projectId: string;
  projectName: string;
  description: string;
  vision?: string;
  codebasePath: string;
  techStack?: string;
  testUrl?: string;
  geminiApiKey: string;
}

export interface GeneratedTeam {
  teamAgents: TeamAgent[];
  personas: Persona[];
  validationPersonaIds: string[];
  techStack: string;
  detectedDescription: string;
}

export async function generateTeamForProject(params: GenerateTeamParams): Promise<GeneratedTeam> {
  const { projectId, projectName, description, vision, codebasePath, geminiApiKey } = params;

  logAction({ ts: Date.now(), type: "action", category: "team-generator",
    message: `Generating team for project: ${projectName} (${projectId})` });

  // Step 1: Scan the codebase
  const scan = scanCodebase(codebasePath);

  // Step 2: Build a rich context prompt
  const prompt = buildTeamGenPrompt({
    projectId, projectName, description, vision,
    techStack: params.techStack || scan.frameworks.join(", ") || scan.languages.join(", "),
    scan,
  });

  // Step 3: Call Gemini
  const raw = await llm({ prompt, tier: "fast", timeoutMs: 60_000, apiKey: geminiApiKey });

  // Step 4: Parse response
  const result = parseTeamGenResponse(raw, projectId);

  logAction({ ts: Date.now(), type: "action", category: "team-generator",
    message: `Generated ${result.teamAgents.length} team agents and ${result.personas.length} personas for ${projectName}` });

  return {
    ...result,
    techStack: params.techStack || scan.frameworks.concat(scan.languages).join(", "),
    detectedDescription: scan.packageDescription || scan.readmeExcerpt.split("\n").slice(0, 3).join(" ").slice(0, 200),
  };
}

// ── Prompt Builder ──

function buildTeamGenPrompt(params: {
  projectId: string;
  projectName: string;
  description: string;
  vision?: string;
  techStack: string;
  scan: CodebaseScan;
}): string {
  const { projectName, description, vision, techStack, scan } = params;

  return `You are an AI team composition expert. Given a software project, you generate the optimal AI team (agents) and customer personas for autonomous evolution sprints.

## Project: ${projectName}

**Description**: ${description}
${vision ? `**Vision**: ${vision}` : ""}
**Tech Stack**: ${techStack}
${scan.packageDescription ? `**Package Description**: ${scan.packageDescription}` : ""}
${scan.readmeExcerpt ? `\n**README (excerpt)**:\n${scan.readmeExcerpt.slice(0, 1500)}\n` : ""}
${scan.structure ? `\n**Project Structure (top-level)**:\n${scan.structure}\n` : ""}
${scan.entryPoints.length ? `**Entry Points**: ${scan.entryPoints.join(", ")}` : ""}
${scan.languages.length ? `**Languages**: ${scan.languages.join(", ")}` : ""}
${scan.frameworks.length ? `**Frameworks**: ${scan.frameworks.join(", ")}` : ""}

## Instructions

Generate a JSON object with two arrays: "teamAgents" and "personas".

### Team Agents (4-7 agents)

Every project MUST have these core roles:
1. **Project Leader** — Meta-controller. Sets vision, priorities, selects personas, reviews all outputs. agentRole: "architect"
2. **Software Architect** — Technical design, architecture reviews, tech debt. agentRole: "architect"
3. **Engineering Manager** — Code quality, conventions, build validation. agentRole: "reviewer"
4. **QA & Test Manager** — Test scenarios, edge cases, quality metrics. agentRole: "reviewer"

Then add 1-3 DOMAIN-SPECIFIC specialists based on what the project actually needs. Examples:
- A trading system might need: "Quantitative Strategy Analyst" (researcher), "Risk & Compliance Officer" (reviewer)
- A SaaS app might need: "UX/Product Designer" (architect), "DevOps & Infrastructure" (coder)
- A data pipeline might need: "Data Engineer" (coder), "ML Ops Specialist" (reviewer)
- A mobile app might need: "Mobile UX Designer" (architect), "Performance Engineer" (reviewer)

Each agent needs:
- id: kebab-case (e.g., "quant-strategist")
- name: A realistic full name
- role: Job title
- responsibilities: What they do (2-3 sentences, specific to this project)
- goals: 3-4 specific goals for this project
- perspective: Their driving question (one sentence)
- agentRole: One of "researcher" | "architect" | "builder" | "coder" | "reviewer"

### Personas (3-5 personas)

These represent real users of the product who will test it via browser automation. Each persona should be a distinct user archetype with different needs.

Each persona needs:
- id: kebab-case (e.g., "day-trader")
- name: A realistic full name
- role: Their job/role in life
- background: 2-3 sentences about who they are
- goals: 3-4 things they want to accomplish with this product
- frustrations: 2-3 frustrations with current alternatives
- testScenarios: 3-5 specific test scenarios they would try (be concrete — "Open the app, navigate to X, try to do Y, verify Z")

### validationPersonaIds

Pick 2-3 persona IDs that should be used for validation retesting after implementation.

## Output Format

Return ONLY a JSON object (no markdown fences, no explanation):
{
  "teamAgents": [...],
  "personas": [...],
  "validationPersonaIds": [...]
}`;
}

// ── Response Parser ──

function parseTeamGenResponse(raw: string, projectId: string): {
  teamAgents: TeamAgent[];
  personas: Persona[];
  validationPersonaIds: string[];
} {
  // Strip markdown fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned);

    // Validate team agents
    const teamAgents: TeamAgent[] = (parsed.teamAgents || []).map((a: any) => ({
      id: String(a.id || "unknown"),
      name: String(a.name || "Unknown Agent"),
      role: String(a.role || "Unknown Role"),
      responsibilities: String(a.responsibilities || ""),
      goals: Array.isArray(a.goals) ? a.goals.map(String) : [],
      perspective: String(a.perspective || ""),
      agentRole: ["researcher", "architect", "builder", "coder", "reviewer"].includes(a.agentRole)
        ? a.agentRole : "researcher",
      painPoints: [],
    }));

    // Validate personas
    const personas: Persona[] = (parsed.personas || []).map((p: any) => ({
      id: String(p.id || "unknown"),
      name: String(p.name || "Unknown Persona"),
      role: String(p.role || "Unknown Role"),
      background: String(p.background || ""),
      goals: Array.isArray(p.goals) ? p.goals.map(String) : [],
      frustrations: Array.isArray(p.frustrations) ? p.frustrations.map(String) : [],
      testScenarios: Array.isArray(p.testScenarios) ? p.testScenarios.map(String) : [],
    }));

    const validationPersonaIds: string[] = Array.isArray(parsed.validationPersonaIds)
      ? parsed.validationPersonaIds.map(String)
      : personas.slice(0, 2).map(p => p.id);

    // Ensure Project Leader exists
    if (!teamAgents.some(a => a.id === "project-leader")) {
      teamAgents.unshift({
        id: "project-leader",
        name: "Project Leader",
        role: "Project Leader",
        responsibilities: `Meta-controller of ${projectId} evolution. Defines vision, sets goals for all agents, monitors evolution effectiveness, reviews ALL outputs.`,
        goals: ["Ensure vision stays coherent", "Maximize sprint impact", "Balance quality and velocity"],
        perspective: "Am I building the right things? Is the team effective?",
        agentRole: "architect",
        painPoints: [],
      });
    }

    return { teamAgents, personas, validationPersonaIds };
  } catch (err) {
    logError("team-generator", "Failed to parse team generation response", err, { raw: raw.slice(0, 500) });
    throw new Error(`Team generation failed: could not parse LLM response`);
  }
}

// ── Focus Expert Generation (all focus types) ──

export interface GenerateFocusExpertsParams {
  focusId: string;
  focusTitle: string;
  focusDescription: string;
  focusType: string;
  intent?: string;
  deeperIntent?: string;
  semanticTags?: string[];
  evidence?: string[];
  codebasePath?: string;
}

/**
 * Generate 2-4 domain-specific experts for any focus area type.
 * For project-type with codebasePath: includes codebase context.
 * For creative/learning/lifestyle: uses domain expertise prompt.
 */
export async function generateFocusExperts(params: GenerateFocusExpertsParams): Promise<TeamAgent[]> {
  const { focusId, focusTitle, focusDescription, focusType, intent, deeperIntent, semanticTags, evidence, codebasePath } = params;

  logAction({ ts: Date.now(), type: "action", category: "team-generator",
    message: `Generating experts for focus: "${focusTitle}" (type: ${focusType})` });

  // Build codebase context for project-type focuses
  let codebaseContext = "";
  if (focusType === "project" && codebasePath) {
    try {
      const scan = scanCodebase(codebasePath);
      codebaseContext = `\n## Codebase\nLanguages: ${scan.languages.join(", ")}\nFrameworks: ${scan.frameworks.join(", ")}\nStructure: ${scan.structure}\n${scan.readmeExcerpt ? `README excerpt: ${scan.readmeExcerpt.slice(0, 500)}` : ""}`;
    } catch { /* no codebase scan available */ }
  }

  // User context — generate experts that match the user's level and complement their existing teams
  let userContext = "";
  try {
    const { buildUserContext } = await import("./team-leader.js");
    const ctx = await buildUserContext({ profileChars: 400, themeChars: 500, includeApps: false });
    if (ctx) userContext = `\n## User Context\nThe user this team will serve. Match expert names/personas to feel real for someone with this background, and choose specialties that complement (not duplicate) their existing focus areas.\n${ctx}`;
  } catch { /* non-critical */ }

  const prompt = `You are designing an expert team for a personal AI assistant's focus area.
${userContext}
## Focus Area
Title: "${focusTitle}"
Type: ${focusType}
Description: ${focusDescription}
${intent ? `Goal: ${intent}` : ""}
${deeperIntent ? `Deeper motivation: ${deeperIntent}` : ""}
${semanticTags?.length ? `Themes: ${semanticTags.join(", ")}` : ""}
${evidence?.length ? `Evidence from user's data: ${evidence.join("; ")}` : ""}
${codebaseContext}

## Task
Generate 2-4 domain experts who would be the IDEAL team for someone pursuing this goal.
Each expert should be a distinct specialist with deep knowledge in their area.

Think about what the user is ACTUALLY trying to achieve and who would help them most:
- For photography: a master photographer who can critique composition, a location scout who knows hidden gems
- For a coding project: a software architect, a domain specialist, a QA expert
- For media library: a super librarian who knows cataloging, a film critic who finds connections
- For quant finance: a quantitative strategist, a risk manager, a data pipeline engineer
- For learning goals: a subject expert, a learning coach, a practitioner

Each expert should feel like a REAL person with opinions, not a generic role description.

Return JSON:
{
  "experts": [
    {
      "id": "kebab-case-id",
      "name": "Full Name (realistic, memorable)",
      "role": "Their specific title/role",
      "responsibilities": "2-3 sentences: what they bring to the table, their approach, what they care about",
      "goals": ["2-3 specific goals they'd pursue for this focus area"],
      "perspective": "1-2 sentences: their unique viewpoint, what lens they see through, what they'd challenge",
      "agentRole": "researcher|architect|builder|coder|reviewer"
    }
  ]
}

Rules:
- 2-4 experts, each genuinely different in expertise and perspective
- Names should feel real and memorable (e.g., "Dr. Elena Vasquez", "Marcus Chen", "Sarah Blackwood")
- Responsibilities must be specific to THIS focus area, not generic
- agentRole maps to: researcher (gathers/analyzes), architect (designs/plans), builder (creates), coder (implements), reviewer (validates/critiques)
- perspective should have OPINIONS — these are experts who push back, not yes-men`;

  const response = await llm({
    prompt,
    tier: "utility",
    maxOutputTokens: 4000,
    responseMimeType: "application/json",
    temperature: 0.5,
    timeoutMs: 30_000,
  });

  // Parse response
  let jsonStr = response.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();
  const bs = jsonStr.indexOf("{"), be = jsonStr.lastIndexOf("}");
  if (bs >= 0 && be > bs) jsonStr = jsonStr.slice(bs, be + 1);

  const parsed = JSON.parse(jsonStr) as { experts: TeamAgent[] };

  if (!parsed.experts?.length) {
    throw new Error("LLM returned no experts");
  }

  // Ensure IDs are valid and unique
  for (const expert of parsed.experts) {
    if (!expert.id) expert.id = expert.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!expert.agentRole) expert.agentRole = "researcher";
  }

  logAction({ ts: Date.now(), type: "action", category: "team-generator",
    message: `Generated ${parsed.experts.length} experts for "${focusTitle}": ${parsed.experts.map(e => e.name).join(", ")}` });

  return parsed.experts;
}
