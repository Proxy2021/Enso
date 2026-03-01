import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

type AgentToolResult = { content: Array<{ type: string; text?: string }> };

// ── Param types ──

type BrowseParams = { category?: string };
type SearchParams = { query: string };
type InspectParams = { slug: string };
type InstalledParams = Record<string, never>;
type InstallParams = { slug: string };
type UninstallParams = { slug: string };

// ── Data types ──

interface SkillSummary {
  slug: string;
  name: string;
  description: string;
  emoji: string;
  version: string;
  author: string;
  downloads?: number;
  installed: boolean;
}

interface SkillDetail {
  slug: string;
  name: string;
  description: string;
  emoji: string;
  version: string;
  author: string;
  readme: string;
  requires: { env: string[]; bins: string[] };
  installed: boolean;
}

interface InstalledSkill {
  slug: string;
  name: string;
  description: string;
  emoji: string;
  version: string;
  path: string;
}

// ── CLI helpers ──

const execFileAsync = promisify(execFile);

async function runClawHub(args: string[], timeoutMs = 15_000): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync("clawhub", args, {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), code: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number; message?: string };
    // Check if clawhub is not installed
    if (e.message?.includes("ENOENT") || e.message?.includes("not found") || e.message?.includes("not recognized")) {
      return {
        stdout: "",
        stderr: "clawhub CLI not found. Install it with: npm install -g clawhub",
        code: 127,
      };
    }
    return {
      stdout: e.stdout?.trim() ?? "",
      stderr: e.stderr?.trim() ?? e.message ?? "Unknown error",
      code: e.code ?? 1,
    };
  }
}

function jsonResult(data: unknown): AgentToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string): AgentToolResult {
  return { content: [{ type: "text", text: `[ERROR] ${message}` }] };
}

/** Parse `clawhub list` output into InstalledSkill entries. */
function parseListOutput(stdout: string): InstalledSkill[] {
  const skills: InstalledSkill[] = [];
  // clawhub list outputs lines like:
  //   skill-name  v1.0.0  Description text  /path/to/skill
  // or JSON if --json flag is supported
  try {
    const parsed = JSON.parse(stdout);
    if (Array.isArray(parsed)) {
      return parsed.map((s: Record<string, unknown>) => ({
        slug: String(s.slug ?? s.name ?? ""),
        name: String(s.name ?? s.slug ?? ""),
        description: String(s.description ?? ""),
        emoji: String(s.emoji ?? ""),
        version: String(s.version ?? ""),
        path: String(s.path ?? s.installPath ?? ""),
      }));
    }
  } catch {
    // Not JSON — parse text output
  }

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("─") || trimmed.startsWith("=") || trimmed.toLowerCase().startsWith("name")) continue;
    // Try tab/multi-space splitting
    const parts = trimmed.split(/\t+|\s{2,}/);
    if (parts.length >= 2) {
      skills.push({
        slug: parts[0].trim(),
        name: parts[0].trim(),
        description: parts.length >= 3 ? parts.slice(1, -1).join(" ").trim() : "",
        emoji: "",
        version: parts.length >= 2 ? (parts.find((p) => /^v?\d+\.\d+/.test(p)) ?? "") : "",
        path: parts[parts.length - 1]?.startsWith("/") || parts[parts.length - 1]?.includes("\\") ? parts[parts.length - 1].trim() : "",
      });
    }
  }
  return skills;
}

/** Parse `clawhub search` output into SkillSummary entries. */
function parseSearchOutput(stdout: string, installedSlugs: Set<string>): SkillSummary[] {
  try {
    const parsed = JSON.parse(stdout);
    if (Array.isArray(parsed)) {
      return parsed.map((s: Record<string, unknown>) => ({
        slug: String(s.slug ?? s.name ?? ""),
        name: String(s.name ?? s.slug ?? ""),
        description: String(s.description ?? ""),
        emoji: String(s.emoji ?? ""),
        version: String(s.version ?? ""),
        author: String(s.author ?? s.publisher ?? ""),
        downloads: typeof s.downloads === "number" ? s.downloads : undefined,
        installed: installedSlugs.has(String(s.slug ?? s.name ?? "")),
      }));
    }
  } catch {
    // Not JSON — parse text output
  }

  const skills: SkillSummary[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("─") || trimmed.startsWith("=") || trimmed.toLowerCase().startsWith("search")) continue;
    // Try to extract slug and description from formatted lines
    // Common patterns: "  slug-name  Description text  by author  v1.0.0"
    //                  "slug-name — Description text"
    const dashMatch = trimmed.match(/^([a-z0-9][a-z0-9-]*)\s+[—–-]\s+(.+)/i);
    if (dashMatch) {
      const slug = dashMatch[1];
      skills.push({
        slug,
        name: slug,
        description: dashMatch[2].trim(),
        emoji: "",
        version: "",
        author: "",
        installed: installedSlugs.has(slug),
      });
      continue;
    }
    const parts = trimmed.split(/\t+|\s{2,}/);
    if (parts.length >= 1 && /^[a-z0-9][a-z0-9-]*$/.test(parts[0])) {
      const slug = parts[0];
      skills.push({
        slug,
        name: slug,
        description: parts.slice(1).join(" ").trim(),
        emoji: "",
        version: "",
        author: "",
        installed: installedSlugs.has(slug),
      });
    }
  }
  return skills;
}

/** Parse `clawhub inspect` output into SkillDetail. */
function parseInspectOutput(stdout: string, slug: string, isInstalled: boolean): SkillDetail {
  try {
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    const meta = (parsed.metadata as Record<string, unknown>) ?? {};
    const ocMeta = (meta.openclaw as Record<string, unknown>) ?? {};
    const requires = (ocMeta.requires as Record<string, unknown>) ?? {};
    return {
      slug: String(parsed.slug ?? parsed.name ?? slug),
      name: String(parsed.name ?? parsed.slug ?? slug),
      description: String(parsed.description ?? ""),
      emoji: String(ocMeta.emoji ?? parsed.emoji ?? ""),
      version: String(parsed.version ?? ""),
      author: String(parsed.author ?? parsed.publisher ?? ""),
      readme: String(parsed.readme ?? parsed.content ?? parsed.body ?? ""),
      requires: {
        env: Array.isArray(requires.env) ? requires.env.map(String) : [],
        bins: Array.isArray(requires.bins) ? requires.bins.map(String) : [],
      },
      installed: isInstalled,
    };
  } catch {
    // Parse text output — best-effort
    return {
      slug,
      name: slug,
      description: stdout.split("\n").find((l) => l.trim() && !l.startsWith("#"))?.trim() ?? "",
      emoji: "",
      version: "",
      author: "",
      readme: stdout,
      requires: { env: [], bins: [] },
      installed: isInstalled,
    };
  }
}

/** Get set of installed skill slugs (cached per invocation). */
async function getInstalledSlugs(): Promise<Set<string>> {
  const result = await runClawHub(["list", "--json"]);
  if (result.code === 127) return new Set();
  if (result.code !== 0) {
    // Try without --json flag
    const fallback = await runClawHub(["list"]);
    if (fallback.code !== 0) return new Set();
    return new Set(parseListOutput(fallback.stdout).map((s) => s.slug));
  }
  return new Set(parseListOutput(result.stdout).map((s) => s.slug));
}

// ── Tool implementations ──

async function clawHubBrowse(params: BrowseParams): Promise<AgentToolResult> {
  const category = params.category?.trim() || "";
  const queries: string[] = category
    ? [category]
    : ["popular AI agent skills", "productivity automation", "developer tools", "data analysis"];

  const installedSlugs = await getInstalledSlugs();

  // Search with multiple queries to get a diverse set
  const allSkills: SkillSummary[] = [];
  const seenSlugs = new Set<string>();

  for (const query of queries) {
    const result = await runClawHub(["search", query, "--json"]);
    if (result.code === 127) {
      return jsonResult({
        tool: "enso_clawhub_browse",
        error: true,
        message: "clawhub CLI not found. Install with: npm install -g clawhub",
        skills: [],
        installedSlugs: [],
      });
    }
    let skills: SkillSummary[];
    if (result.code !== 0) {
      // Try without --json
      const fallback = await runClawHub(["search", query]);
      if (fallback.code !== 0) continue;
      skills = parseSearchOutput(fallback.stdout, installedSlugs);
    } else {
      skills = parseSearchOutput(result.stdout, installedSlugs);
    }
    for (const skill of skills) {
      if (!seenSlugs.has(skill.slug)) {
        seenSlugs.add(skill.slug);
        allSkills.push(skill);
      }
    }
  }

  return jsonResult({
    tool: "enso_clawhub_browse",
    category: category || "popular",
    skills: allSkills,
    installedSlugs: [...installedSlugs],
    totalFound: allSkills.length,
  });
}

async function clawHubSearch(params: SearchParams): Promise<AgentToolResult> {
  const query = params.query?.trim();
  if (!query) {
    return errorResult("Search query is required");
  }

  const installedSlugs = await getInstalledSlugs();
  const result = await runClawHub(["search", query, "--json"]);

  if (result.code === 127) {
    return jsonResult({
      tool: "enso_clawhub_search",
      error: true,
      message: "clawhub CLI not found. Install with: npm install -g clawhub",
      query,
      skills: [],
      installedSlugs: [],
    });
  }

  let skills: SkillSummary[];
  if (result.code !== 0) {
    const fallback = await runClawHub(["search", query]);
    if (fallback.code !== 0) {
      return jsonResult({
        tool: "enso_clawhub_search",
        query,
        skills: [],
        installedSlugs: [...installedSlugs],
        totalFound: 0,
        error: true,
        message: result.stderr || fallback.stderr || "Search failed",
      });
    }
    skills = parseSearchOutput(fallback.stdout, installedSlugs);
  } else {
    skills = parseSearchOutput(result.stdout, installedSlugs);
  }

  return jsonResult({
    tool: "enso_clawhub_search",
    query,
    skills,
    installedSlugs: [...installedSlugs],
    totalFound: skills.length,
  });
}

async function clawHubInspect(params: InspectParams): Promise<AgentToolResult> {
  const slug = params.slug?.trim();
  if (!slug) {
    return errorResult("Skill slug is required");
  }

  const installedSlugs = await getInstalledSlugs();
  const result = await runClawHub(["inspect", slug, "--json"]);

  if (result.code === 127) {
    return jsonResult({
      tool: "enso_clawhub_inspect",
      error: true,
      message: "clawhub CLI not found. Install with: npm install -g clawhub",
      slug,
    });
  }

  if (result.code !== 0) {
    // Try without --json
    const fallback = await runClawHub(["inspect", slug]);
    if (fallback.code !== 0) {
      return jsonResult({
        tool: "enso_clawhub_inspect",
        slug,
        error: true,
        message: result.stderr || fallback.stderr || `Failed to inspect skill "${slug}"`,
      });
    }
    const detail = parseInspectOutput(fallback.stdout, slug, installedSlugs.has(slug));
    return jsonResult({ tool: "enso_clawhub_inspect", ...detail });
  }

  const detail = parseInspectOutput(result.stdout, slug, installedSlugs.has(slug));
  return jsonResult({ tool: "enso_clawhub_inspect", ...detail });
}

async function clawHubInstalled(): Promise<AgentToolResult> {
  const result = await runClawHub(["list", "--json"]);

  if (result.code === 127) {
    return jsonResult({
      tool: "enso_clawhub_installed",
      error: true,
      message: "clawhub CLI not found. Install with: npm install -g clawhub",
      skills: [],
    });
  }

  let skills: InstalledSkill[];
  if (result.code !== 0) {
    const fallback = await runClawHub(["list"]);
    if (fallback.code !== 0) {
      return jsonResult({
        tool: "enso_clawhub_installed",
        skills: [],
        error: true,
        message: result.stderr || fallback.stderr || "Failed to list installed skills",
      });
    }
    skills = parseListOutput(fallback.stdout);
  } else {
    skills = parseListOutput(result.stdout);
  }

  return jsonResult({
    tool: "enso_clawhub_installed",
    skills,
    totalInstalled: skills.length,
  });
}

async function clawHubInstall(params: InstallParams): Promise<AgentToolResult> {
  const slug = params.slug?.trim();
  if (!slug) {
    return errorResult("Skill slug is required");
  }

  console.log(`[enso:clawhub] Installing skill "${slug}"...`);
  const result = await runClawHub(["install", slug], 30_000);

  if (result.code === 127) {
    return jsonResult({
      tool: "enso_clawhub_install",
      slug,
      success: false,
      message: "clawhub CLI not found. Install with: npm install -g clawhub",
    });
  }

  if (result.code !== 0) {
    console.log(`[enso:clawhub] Install failed for "${slug}": ${result.stderr}`);
    return jsonResult({
      tool: "enso_clawhub_install",
      slug,
      success: false,
      message: result.stderr || `Failed to install "${slug}"`,
    });
  }

  console.log(`[enso:clawhub] Successfully installed "${slug}"`);
  return jsonResult({
    tool: "enso_clawhub_install",
    slug,
    success: true,
    message: `Successfully installed "${slug}". The skill is now available to OpenClaw agents.`,
    output: result.stdout,
  });
}

async function clawHubUninstall(params: UninstallParams): Promise<AgentToolResult> {
  const slug = params.slug?.trim();
  if (!slug) {
    return errorResult("Skill slug is required");
  }

  console.log(`[enso:clawhub] Uninstalling skill "${slug}"...`);
  const result = await runClawHub(["uninstall", slug], 15_000);

  if (result.code === 127) {
    return jsonResult({
      tool: "enso_clawhub_uninstall",
      slug,
      success: false,
      message: "clawhub CLI not found. Install with: npm install -g clawhub",
    });
  }

  if (result.code !== 0) {
    console.log(`[enso:clawhub] Uninstall failed for "${slug}": ${result.stderr}`);
    return jsonResult({
      tool: "enso_clawhub_uninstall",
      slug,
      success: false,
      message: result.stderr || `Failed to uninstall "${slug}"`,
    });
  }

  console.log(`[enso:clawhub] Successfully uninstalled "${slug}"`);
  return jsonResult({
    tool: "enso_clawhub_uninstall",
    slug,
    success: true,
    message: `Successfully uninstalled "${slug}".`,
    output: result.stdout,
  });
}

// ── Tool registration ──

export function createClawHubTools(): AnyAgentTool[] {
  return [
    {
      name: "enso_clawhub_browse",
      label: "ClawHub Browse",
      description: "Browse popular and trending skills on ClawHub, the OpenClaw skill marketplace. Optionally filter by category.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          category: { type: "string", description: "Category filter (e.g. 'productivity', 'dev tools', 'data'). Empty for popular/trending." },
        },
        required: [],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        clawHubBrowse(params as BrowseParams),
    } as AnyAgentTool,
    {
      name: "enso_clawhub_search",
      label: "ClawHub Search",
      description: "Search ClawHub for skills by keyword or semantic query. Uses vector-based search for intelligent matching.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string", description: "Search query (e.g. 'calendar management', 'web scraping', 'email automation')" },
        },
        required: ["query"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        clawHubSearch(params as SearchParams),
    } as AnyAgentTool,
    {
      name: "enso_clawhub_inspect",
      label: "ClawHub Inspect",
      description: "View detailed information about a specific ClawHub skill including README, requirements, and metadata.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          slug: { type: "string", description: "Skill slug identifier (e.g. 'enso-city-planner')" },
        },
        required: ["slug"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        clawHubInspect(params as InspectParams),
    } as AnyAgentTool,
    {
      name: "enso_clawhub_installed",
      label: "ClawHub Installed",
      description: "List all currently installed OpenClaw skills.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
        required: [],
      },
      execute: async () => clawHubInstalled(),
    } as AnyAgentTool,
    {
      name: "enso_clawhub_install",
      label: "ClawHub Install",
      description: "Install a skill from ClawHub by its slug. The skill becomes available to OpenClaw agents immediately.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          slug: { type: "string", description: "Skill slug to install (e.g. 'enso-city-planner')" },
        },
        required: ["slug"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        clawHubInstall(params as InstallParams),
    } as AnyAgentTool,
    {
      name: "enso_clawhub_uninstall",
      label: "ClawHub Uninstall",
      description: "Uninstall a previously installed skill.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          slug: { type: "string", description: "Skill slug to uninstall" },
        },
        required: ["slug"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        clawHubUninstall(params as UninstallParams),
    } as AnyAgentTool,
  ];
}

export function registerClawHubTools(api: OpenClawPluginApi): void {
  for (const tool of createClawHubTools()) {
    api.registerTool(tool);
  }
}
