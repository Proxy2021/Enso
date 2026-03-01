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
    const { stdout, stderr } = await execFileAsync("clawhub", [...args, "--no-input"], {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      shell: true,
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

function cliNotFoundResult(tool: string, extra?: Record<string, unknown>): AgentToolResult {
  return jsonResult({
    tool,
    error: true,
    message: "clawhub CLI not found. Install with: npm install -g clawhub",
    skills: [],
    installedSlugs: [],
    ...extra,
  });
}

// ── Parsers ──

/**
 * Parse `clawhub list` text output.
 * Format: `slug  version` per line (2+ spaces between columns).
 */
function parseListOutput(stdout: string): InstalledSkill[] {
  const skills: InstalledSkill[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("─") || trimmed.startsWith("=")) continue;
    const parts = trimmed.split(/\s{2,}/);
    if (parts.length >= 1 && /^[a-z0-9][a-z0-9._-]*$/i.test(parts[0])) {
      const slug = parts[0].trim();
      skills.push({
        slug,
        name: slug,
        description: "",
        emoji: "",
        version: parts[1]?.trim() ?? "",
        path: "",
      });
    }
  }
  return skills;
}

/**
 * Parse `clawhub explore --json` output.
 * Returns `{ items: [ { slug, displayName, summary, tags: {latest}, stats: {downloads, ...}, latestVersion: {version}, ... } ] }`
 */
function parseExploreJson(stdout: string, installedSlugs: Set<string>): SkillSummary[] {
  const parsed = JSON.parse(stdout) as { items?: unknown[] };
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  return items.map((raw) => {
    const s = raw as Record<string, unknown>;
    const tags = (s.tags as Record<string, string>) ?? {};
    const stats = (s.stats as Record<string, number>) ?? {};
    const lv = (s.latestVersion as Record<string, unknown>) ?? {};
    const slug = String(s.slug ?? "");
    return {
      slug,
      name: String(s.displayName ?? slug),
      description: String(s.summary ?? ""),
      emoji: "",
      version: String(lv.version ?? tags.latest ?? ""),
      author: "",
      downloads: typeof stats.downloads === "number" ? stats.downloads : undefined,
      installed: installedSlugs.has(slug),
    };
  });
}

/**
 * Parse `clawhub search` text output.
 * Format: `slug  description text  (score)` per line (2+ spaces between columns).
 */
function parseSearchText(stdout: string, installedSlugs: Set<string>): SkillSummary[] {
  const skills: SkillSummary[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("─") || trimmed.startsWith("=") || trimmed.startsWith("-")) continue;
    const parts = trimmed.split(/\s{2,}/);
    if (parts.length >= 1 && /^[a-z0-9][a-z0-9._-]*$/i.test(parts[0])) {
      const slug = parts[0].trim();
      // Last part might be score like "(3.599)" — strip it
      let desc = parts.slice(1).join(" ").trim();
      desc = desc.replace(/\s*\(\d+\.\d+\)\s*$/, "").trim();
      // If description is the same as slug, it's a placeholder
      if (desc.toLowerCase() === slug.toLowerCase()) desc = "";
      skills.push({
        slug,
        name: slug,
        description: desc,
        emoji: "",
        version: "",
        author: "",
        installed: installedSlugs.has(slug),
      });
    }
  }
  return skills;
}

/**
 * Parse `clawhub inspect --json` output.
 * Returns `{ skill: { slug, displayName, summary, ... }, latestVersion: { version, changelog }, owner: { handle, displayName } }`
 */
function parseInspectJson(stdout: string, slug: string, isInstalled: boolean): SkillDetail {
  const parsed = JSON.parse(stdout) as Record<string, unknown>;
  const skill = (parsed.skill as Record<string, unknown>) ?? {};
  const owner = (parsed.owner as Record<string, unknown>) ?? {};
  const lv = (parsed.latestVersion as Record<string, unknown>) ?? {};
  const tags = (skill.tags as Record<string, string>) ?? {};
  return {
    slug: String(skill.slug ?? slug),
    name: String(skill.displayName ?? skill.slug ?? slug),
    description: String(skill.summary ?? ""),
    emoji: "",
    version: String(lv.version ?? tags.latest ?? ""),
    author: String(owner.handle ?? owner.displayName ?? ""),
    readme: String(lv.changelog ?? ""),
    requires: { env: [], bins: [] },
    installed: isInstalled,
  };
}

/**
 * Parse `clawhub inspect` text output (fallback).
 * Multi-line key-value format:
 *   slug  Display Name
 *   Summary: ...
 *   Owner: ...
 *   Latest: version
 */
function parseInspectText(stdout: string, slug: string, isInstalled: boolean): SkillDetail {
  const lines = stdout.split(/\r?\n/);
  let name = slug;
  let description = "";
  let version = "";
  let author = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("Summary:")) description = trimmed.slice(8).trim();
    else if (trimmed.startsWith("Owner:")) author = trimmed.slice(6).trim();
    else if (trimmed.startsWith("Latest:")) version = trimmed.slice(7).trim();
    else if (!name && trimmed && !trimmed.includes(":")) {
      // First non-empty, non-key line is probably "slug  Display Name"
      const parts = trimmed.split(/\s{2,}/);
      if (parts.length >= 2) name = parts[1];
    }
  }
  // Extract name from first line: "slug  Display Name"
  if (lines.length > 0) {
    const firstParts = lines[0].trim().split(/\s{2,}/);
    if (firstParts.length >= 2) name = firstParts[1];
  }

  return {
    slug,
    name,
    description,
    emoji: "",
    version,
    author,
    readme: stdout,
    requires: { env: [], bins: [] },
    installed: isInstalled,
  };
}

/** Get set of installed skill slugs. */
async function getInstalledSlugs(): Promise<Set<string>> {
  const result = await runClawHub(["list"]);
  if (result.code === 127 || result.code !== 0) return new Set();
  return new Set(parseListOutput(result.stdout).map((s) => s.slug));
}

// ── Tool implementations ──

async function clawHubBrowse(_params: BrowseParams): Promise<AgentToolResult> {
  const installedSlugs = await getInstalledSlugs();

  // Use `explore --json` for browse — returns latest/popular skills
  const result = await runClawHub(["explore", "--json"]);
  if (result.code === 127) return cliNotFoundResult("enso_clawhub_browse");

  if (result.code !== 0) {
    return jsonResult({
      tool: "enso_clawhub_browse",
      skills: [],
      installedSlugs: [...installedSlugs],
      totalFound: 0,
      error: true,
      message: result.stderr || "Failed to browse skills",
    });
  }

  let skills: SkillSummary[];
  try {
    skills = parseExploreJson(result.stdout, installedSlugs);
  } catch {
    return jsonResult({
      tool: "enso_clawhub_browse",
      skills: [],
      installedSlugs: [...installedSlugs],
      totalFound: 0,
      error: true,
      message: "Failed to parse explore output",
    });
  }

  return jsonResult({
    tool: "enso_clawhub_browse",
    skills,
    installedSlugs: [...installedSlugs],
    totalFound: skills.length,
  });
}

async function clawHubSearch(params: SearchParams): Promise<AgentToolResult> {
  const query = params.query?.trim();
  if (!query) return errorResult("Search query is required");

  const installedSlugs = await getInstalledSlugs();
  const result = await runClawHub(["search", query]);

  if (result.code === 127) return cliNotFoundResult("enso_clawhub_search", { query });

  if (result.code !== 0) {
    return jsonResult({
      tool: "enso_clawhub_search",
      query,
      skills: [],
      installedSlugs: [...installedSlugs],
      totalFound: 0,
      error: true,
      message: result.stderr || "Search failed",
    });
  }

  const skills = parseSearchText(result.stdout, installedSlugs);

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
  if (!slug) return errorResult("Skill slug is required");

  const installedSlugs = await getInstalledSlugs();
  // inspect supports --json
  const result = await runClawHub(["inspect", slug, "--json"]);

  if (result.code === 127) return cliNotFoundResult("enso_clawhub_inspect", { slug });

  if (result.code !== 0) {
    // Fallback to text output
    const fallback = await runClawHub(["inspect", slug]);
    if (fallback.code !== 0) {
      return jsonResult({
        tool: "enso_clawhub_inspect",
        slug,
        error: true,
        message: result.stderr || fallback.stderr || `Failed to inspect skill "${slug}"`,
      });
    }
    const detail = parseInspectText(fallback.stdout, slug, installedSlugs.has(slug));
    return jsonResult({ tool: "enso_clawhub_inspect", ...detail });
  }

  let detail: SkillDetail;
  try {
    detail = parseInspectJson(result.stdout, slug, installedSlugs.has(slug));
  } catch {
    // JSON parse failed — try text fallback
    const fallback = await runClawHub(["inspect", slug]);
    detail = parseInspectText(fallback.stdout, slug, installedSlugs.has(slug));
  }
  return jsonResult({ tool: "enso_clawhub_inspect", ...detail });
}

async function clawHubInstalled(): Promise<AgentToolResult> {
  const result = await runClawHub(["list"]);

  if (result.code === 127) return cliNotFoundResult("enso_clawhub_installed");

  if (result.code !== 0) {
    return jsonResult({
      tool: "enso_clawhub_installed",
      skills: [],
      error: true,
      message: result.stderr || "Failed to list installed skills",
    });
  }

  const skills = parseListOutput(result.stdout);
  return jsonResult({
    tool: "enso_clawhub_installed",
    skills,
    totalInstalled: skills.length,
  });
}

async function clawHubInstall(params: InstallParams): Promise<AgentToolResult> {
  const slug = params.slug?.trim();
  if (!slug) return errorResult("Skill slug is required");

  console.log(`[enso:clawhub] Installing skill "${slug}"...`);
  const result = await runClawHub(["install", slug], 30_000);

  if (result.code === 127) {
    return jsonResult({ tool: "enso_clawhub_install", slug, success: false, message: "clawhub CLI not found. Install with: npm install -g clawhub" });
  }
  if (result.code !== 0) {
    console.log(`[enso:clawhub] Install failed for "${slug}": ${result.stderr}`);
    return jsonResult({ tool: "enso_clawhub_install", slug, success: false, message: result.stderr || `Failed to install "${slug}"` });
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
  if (!slug) return errorResult("Skill slug is required");

  console.log(`[enso:clawhub] Uninstalling skill "${slug}"...`);
  const result = await runClawHub(["uninstall", slug], 15_000);

  if (result.code === 127) {
    return jsonResult({ tool: "enso_clawhub_uninstall", slug, success: false, message: "clawhub CLI not found. Install with: npm install -g clawhub" });
  }
  if (result.code !== 0) {
    console.log(`[enso:clawhub] Uninstall failed for "${slug}": ${result.stderr}`);
    return jsonResult({ tool: "enso_clawhub_uninstall", slug, success: false, message: result.stderr || `Failed to uninstall "${slug}"` });
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
