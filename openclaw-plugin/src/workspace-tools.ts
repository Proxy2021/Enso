import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { existsSync, lstatSync, readdirSync } from "fs";
import { dirname, isAbsolute, join, normalize, resolve } from "path";
import { homedir } from "os";

type AgentToolResult = { content: Array<{ type: string; text?: string }> };

type ListReposParams = {
  path?: string;
  limit?: number;
};

type DetectDevToolsParams = {
  names?: string[];
};

type ProjectOverviewParams = {
  path: string;
  maxDepth?: number;
  maxFiles?: number;
};

const DEFAULT_REPO_LIMIT = 50;
const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_MAX_FILES = 2000;

function jsonResult(data: unknown): AgentToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string): AgentToolResult {
  return { content: [{ type: "text", text: `[ERROR] ${message}` }] };
}

function getAllowedRoots(): string[] {
  return Array.from(new Set([resolve(homedir()), resolve(process.cwd())]));
}

function resolveUserPath(inputPath: string): string {
  const expanded = inputPath.startsWith("~")
    ? join(homedir(), inputPath.slice(1))
    : inputPath;
  const candidate = isAbsolute(expanded)
    ? expanded
    : join(process.cwd(), expanded);
  return normalize(resolve(candidate));
}

function safeResolvePath(inputPath: string): { ok: true; path: string } | { ok: false; error: string } {
  const resolved = resolveUserPath(inputPath);
  const allowed = getAllowedRoots().some((root) => resolved === root || resolved.startsWith(`${root}/`));
  if (!allowed) {
    return { ok: false, error: `path is outside allowed roots: ${resolved}` };
  }
  return { ok: true, path: resolved };
}

function listRepos(params: ListReposParams): AgentToolResult {
  const rootSafe = safeResolvePath(params.path ?? ".");
  if (!rootSafe.ok) return errorResult(rootSafe.error);
  if (!existsSync(rootSafe.path)) return errorResult(`path does not exist: ${rootSafe.path}`);
  if (!lstatSync(rootSafe.path).isDirectory()) return errorResult(`path is not a directory: ${rootSafe.path}`);

  const limit = Math.max(1, Math.min(300, params.limit ?? DEFAULT_REPO_LIMIT));
  const repos: Array<{ name: string; path: string }> = [];

  const walk = (dir: string, depth: number) => {
    if (repos.length >= limit || depth > 3) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (repos.length >= limit) break;
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const fullPath = join(dir, entry.name);
      if (existsSync(join(fullPath, ".git"))) {
        repos.push({ name: entry.name, path: fullPath });
        continue;
      }
      walk(fullPath, depth + 1);
    }
  };
  walk(rootSafe.path, 0);

  return jsonResult({
    tool: "enso_ws_list_repos",
    path: rootSafe.path,
    total: repos.length,
    repos,
  });
}

function detectDevTools(params: DetectDevToolsParams): AgentToolResult {
  const names = (params.names && params.names.length > 0)
    ? params.names
    : ["python3", "pip3", "node", "npm", "git", "docker", "go", "rustc", "cargo", "pnpm", "yarn", "make"];

  const envPath = process.env.PATH ?? "";
  const bins = envPath.split(":").filter(Boolean);
  const found: Array<{ name: string; path: string }> = [];
  const missing: string[] = [];

  for (const name of names) {
    let resolvedPath: string | undefined;
    for (const dir of bins) {
      const full = join(dir, name);
      if (existsSync(full)) {
        resolvedPath = full;
        break;
      }
    }
    if (resolvedPath) {
      found.push({ name, path: resolvedPath });
    } else {
      missing.push(name);
    }
  }

  return jsonResult({
    tool: "enso_ws_detect_dev_tools",
    scanned: names.length,
    found,
    missing,
  });
}

function projectOverview(params: ProjectOverviewParams): AgentToolResult {
  const safe = safeResolvePath(params.path);
  if (!safe.ok) return errorResult(safe.error);
  if (!existsSync(safe.path)) return errorResult(`path does not exist: ${safe.path}`);
  if (!lstatSync(safe.path).isDirectory()) return errorResult(`path is not a directory: ${safe.path}`);

  const maxDepth = Math.max(1, Math.min(8, params.maxDepth ?? DEFAULT_MAX_DEPTH));
  const maxFiles = Math.max(100, Math.min(10000, params.maxFiles ?? DEFAULT_MAX_FILES));
  let fileCount = 0;
  const byExt = new Map<string, number>();
  const topFolders = new Map<string, number>();

  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth || fileCount >= maxFiles) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (fileCount >= maxFiles) break;
      if (entry.name.startsWith(".")) continue;
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth === 0) topFolders.set(entry.name, (topFolders.get(entry.name) ?? 0) + 1);
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        fileCount += 1;
        const dot = entry.name.lastIndexOf(".");
        const ext = dot > 0 ? entry.name.slice(dot).toLowerCase() : "(no-ext)";
        byExt.set(ext, (byExt.get(ext) ?? 0) + 1);
        if (depth >= 1) {
          const folder = dirname(fullPath).slice(safe.path.length + 1).split("/")[0] ?? "(root)";
          topFolders.set(folder, (topFolders.get(folder) ?? 0) + 1);
        }
      }
    }
  };
  walk(safe.path, 0);

  const extensionStats = Array.from(byExt.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([ext, count]) => ({ ext, count }));

  const folderStats = Array.from(topFolders.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, count]) => ({ name, count }));

  return jsonResult({
    tool: "enso_ws_project_overview",
    path: safe.path,
    scannedFiles: fileCount,
    extensionStats,
    folderStats,
  });
}

export function createWorkspaceTools(): AnyAgentTool[] {
  return [
    {
      name: "enso_ws_list_repos",
      label: "Workspace List Repos",
      description: "Find git repositories under a path.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", description: "Path to scan for repos." },
          limit: { type: "number", description: "Maximum repos to return." },
        },
      },
      execute: async (_callId: string, params: Record<string, unknown>) => listRepos(params as ListReposParams),
    } as AnyAgentTool,
    {
      name: "enso_ws_detect_dev_tools",
      label: "Workspace Detect Dev Tools",
      description: "Detect common development tools available on PATH.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          names: { type: "array", items: { type: "string" }, description: "Optional tool names to check." },
        },
      },
      execute: async (_callId: string, params: Record<string, unknown>) => detectDevTools(params as DetectDevToolsParams),
    } as AnyAgentTool,
    {
      name: "enso_ws_project_overview",
      label: "Workspace Project Overview",
      description: "Summarize a project by extension and top-level folder stats.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", description: "Project directory path." },
          maxDepth: { type: "number" },
          maxFiles: { type: "number" },
        },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => projectOverview(params as ProjectOverviewParams),
    } as AnyAgentTool,
  ];
}

export function registerWorkspaceTools(api: OpenClawPluginApi): void {
  for (const tool of createWorkspaceTools()) {
    api.registerTool(tool);
  }
}
