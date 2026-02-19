import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { existsSync, lstatSync, readdirSync, readFileSync } from "fs";
import { extname, isAbsolute, join, normalize, resolve } from "path";
import { homedir } from "os";

type AgentToolResult = { content: Array<{ type: string; text?: string }> };

type ListDirectoryParams = {
  path: string;
  limit?: number;
  includeHidden?: boolean;
};

type ReadTextFileParams = {
  path: string;
  maxChars?: number;
};

type StatPathParams = {
  path: string;
};

type SearchPathsParams = {
  path?: string;
  query: string;
  type?: "file" | "directory" | "any";
  limit?: number;
};

const DEFAULT_LIST_LIMIT = 120;
const DEFAULT_SEARCH_LIMIT = 60;
const DEFAULT_MAX_CHARS = 12000;
const DEFAULT_SEARCH_DEPTH = 4;

function jsonResult(data: unknown): AgentToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(message: string): AgentToolResult {
  return { content: [{ type: "text", text: `[ERROR] ${message}` }] };
}

function getAllowedRoots(): string[] {
  const roots = [resolve(homedir()), resolve(process.cwd())];
  return Array.from(new Set(roots));
}

function isPathAllowed(targetPath: string): boolean {
  const resolved = resolve(targetPath);
  return getAllowedRoots().some((root) => resolved === root || resolved.startsWith(`${root}/`));
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
  if (!inputPath || !inputPath.trim()) return { ok: false, error: "path is required" };
  const resolved = resolveUserPath(inputPath);
  if (!isPathAllowed(resolved)) {
    return { ok: false, error: `path is outside allowed roots: ${resolved}` };
  }
  return { ok: true, path: resolved };
}

function listDirectory(params: ListDirectoryParams): AgentToolResult {
  const safe = safeResolvePath(params.path);
  if (!safe.ok) return errorResult(safe.error);
  if (!existsSync(safe.path)) return errorResult(`path does not exist: ${safe.path}`);
  const stat = lstatSync(safe.path);
  if (!stat.isDirectory()) return errorResult(`path is not a directory: ${safe.path}`);

  const limit = Math.max(1, Math.min(500, params.limit ?? DEFAULT_LIST_LIMIT));
  const includeHidden = params.includeHidden ?? false;
  const entries = readdirSync(safe.path, { withFileTypes: true })
    .filter((entry) => includeHidden || !entry.name.startsWith("."))
    .slice(0, limit)
    .map((entry) => {
      const fullPath = join(safe.path, entry.name);
      const nodeStat = lstatSync(fullPath);
      const type = entry.isDirectory() ? "directory" : entry.isSymbolicLink() ? "symlink" : "file";
      return {
        name: entry.name,
        path: fullPath,
        type,
        size: nodeStat.size,
        extension: type === "file" ? extname(entry.name).replace(/^\./, "") || undefined : undefined,
      };
    });

  return jsonResult({
    tool: "enso_fs_list_directory",
    path: safe.path,
    total: entries.length,
    items: entries,
  });
}

function readTextFile(params: ReadTextFileParams): AgentToolResult {
  const safe = safeResolvePath(params.path);
  if (!safe.ok) return errorResult(safe.error);
  if (!existsSync(safe.path)) return errorResult(`path does not exist: ${safe.path}`);
  const stat = lstatSync(safe.path);
  if (!stat.isFile()) return errorResult(`path is not a file: ${safe.path}`);

  const maxChars = Math.max(200, Math.min(200_000, params.maxChars ?? DEFAULT_MAX_CHARS));
  const raw = readFileSync(safe.path, "utf-8");
  const truncated = raw.length > maxChars;
  const content = truncated ? `${raw.slice(0, maxChars)}\n...` : raw;

  return jsonResult({
    tool: "enso_fs_read_text_file",
    path: safe.path,
    size: stat.size,
    truncated,
    content,
  });
}

function statPath(params: StatPathParams): AgentToolResult {
  const safe = safeResolvePath(params.path);
  if (!safe.ok) return errorResult(safe.error);
  if (!existsSync(safe.path)) return errorResult(`path does not exist: ${safe.path}`);
  const stat = lstatSync(safe.path);
  const type = stat.isDirectory() ? "directory" : stat.isSymbolicLink() ? "symlink" : "file";
  return jsonResult({
    tool: "enso_fs_stat_path",
    path: safe.path,
    type,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.ctimeMs,
    atimeMs: stat.atimeMs,
    mode: stat.mode,
  });
}

function searchPaths(params: SearchPathsParams): AgentToolResult {
  if (!params.query?.trim()) return errorResult("query is required");
  const start = safeResolvePath(params.path ?? ".");
  if (!start.ok) return errorResult(start.error);
  if (!existsSync(start.path)) return errorResult(`path does not exist: ${start.path}`);
  const startStat = lstatSync(start.path);
  if (!startStat.isDirectory()) return errorResult(`search path is not a directory: ${start.path}`);

  const query = params.query.toLowerCase();
  const limit = Math.max(1, Math.min(500, params.limit ?? DEFAULT_SEARCH_LIMIT));
  const type = params.type ?? "any";
  const matches: Array<{ name: string; path: string; type: "file" | "directory" }> = [];

  const walk = (dir: string, depth: number) => {
    if (matches.length >= limit || depth > DEFAULT_SEARCH_DEPTH) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (matches.length >= limit) break;
      if (entry.name.startsWith(".")) continue;
      const fullPath = join(dir, entry.name);
      const entryType: "file" | "directory" = entry.isDirectory() ? "directory" : "file";
      const typeMatches = type === "any" || type === entryType;
      if (typeMatches && entry.name.toLowerCase().includes(query)) {
        matches.push({ name: entry.name, path: fullPath, type: entryType });
      }
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      }
    }
  };
  walk(start.path, 0);

  return jsonResult({
    tool: "enso_fs_search_paths",
    path: start.path,
    query: params.query,
    type,
    total: matches.length,
    matches,
  });
}

export function createFilesystemTools(): AnyAgentTool[] {
  return [
    {
      name: "enso_fs_list_directory",
      label: "Filesystem List Directory",
      description: "List files and folders under a directory path.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", description: "Directory path to list." },
          limit: { type: "number", description: "Maximum number of entries." },
          includeHidden: { type: "boolean", description: "Include dotfiles/directories." },
        },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => listDirectory(params as ListDirectoryParams),
    } as AnyAgentTool,
    {
      name: "enso_fs_read_text_file",
      label: "Filesystem Read Text File",
      description: "Read text file content with truncation for safety.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", description: "File path to read." },
          maxChars: { type: "number", description: "Maximum characters to return." },
        },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => readTextFile(params as ReadTextFileParams),
    } as AnyAgentTool,
    {
      name: "enso_fs_stat_path",
      label: "Filesystem Stat Path",
      description: "Get metadata for a file or directory path.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", description: "Path to inspect." },
        },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => statPath(params as StatPathParams),
    } as AnyAgentTool,
    {
      name: "enso_fs_search_paths",
      label: "Filesystem Search Paths",
      description: "Search for files/folders by name under a directory.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", description: "Root directory to search from." },
          query: { type: "string", description: "Case-insensitive name query." },
          type: { type: "string", enum: ["file", "directory", "any"] },
          limit: { type: "number", description: "Maximum number of matches." },
        },
        required: ["query"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => searchPaths(params as SearchPathsParams),
    } as AnyAgentTool,
  ];
}

export function registerFilesystemTools(api: OpenClawPluginApi): void {
  for (const tool of createFilesystemTools()) {
    api.registerTool(tool);
  }
}
