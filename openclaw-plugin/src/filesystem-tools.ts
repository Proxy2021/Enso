import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from "fs";
import { basename, dirname, extname, isAbsolute, join, normalize, resolve, sep } from "path";
import { execSync } from "child_process";
import { homedir, platform } from "os";
import { toMediaUrl } from "./server.js";

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

type CreateDirectoryParams = {
  path: string;
};

type RenamePathParams = {
  path: string;
  newName: string;
};

type DeletePathParams = {
  path: string;
};

type MovePathParams = {
  source: string;
  destination: string;
};

type OpenExternalParams = {
  path: string;
};

const DEFAULT_LIST_LIMIT = 120;
const DEFAULT_SEARCH_LIMIT = 60;
const DEFAULT_MAX_CHARS = 12000;
const DEFAULT_SEARCH_DEPTH = 4;

// File-type detection for open_file
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"]);
const VIDEO_EXTS = new Set([".mp4", ".webm", ".avi", ".mov", ".mkv", ".m4v"]);
const AUDIO_EXTS = new Set([".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac", ".wma"]);
const PDF_EXTS = new Set([".pdf"]);
const TEXT_EXTS = new Set([
  ".txt", ".md", ".json", ".xml", ".csv", ".yml", ".yaml", ".toml",
  ".js", ".ts", ".jsx", ".tsx", ".py", ".sh", ".bash", ".zsh",
  ".rs", ".go", ".java", ".c", ".cpp", ".h", ".hpp", ".cs",
  ".rb", ".php", ".swift", ".kt", ".scala", ".r", ".lua",
  ".html", ".htm", ".css", ".scss", ".less", ".sql",
  ".env", ".gitignore", ".dockerignore", ".editorconfig",
  ".cfg", ".ini", ".conf", ".log", ".bat", ".ps1", ".cmd",
]);

type OpenFileParams = { path: string };

function jsonResult(data: unknown): AgentToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(message: string): AgentToolResult {
  return { content: [{ type: "text", text: `[ERROR] ${message}` }] };
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
  return { ok: true, path: resolved };
}

/** Detect available root drives / mount points. */
function getSystemDrives(): Array<{ name: string; path: string; type: "drive" }> {
  if (platform() === "win32") {
    try {
      const raw = execSync("wmic logicaldisk get name", { encoding: "utf-8", timeout: 3000 });
      const drives = raw.split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => /^[A-Z]:$/i.test(l))
        .map((d) => ({ name: d + "\\", path: d + "\\", type: "drive" as const }));
      if (drives.length > 0) return drives;
    } catch { /* fallback below */ }
    // Fallback: probe common letters
    const letters = "CDEFGHIJKLMNOPQRSTUVWXYZAB";
    return [...letters].filter((l) => existsSync(`${l}:\\`)).map((l) => ({
      name: `${l}:\\`,
      path: `${l}:\\`,
      type: "drive" as const,
    }));
  }
  // macOS / Linux: return top-level mount points + home
  const mounts: Array<{ name: string; path: string; type: "drive" }> = [
    { name: "/", path: "/", type: "drive" },
  ];
  if (existsSync("/Volumes")) {
    try {
      for (const name of readdirSync("/Volumes")) {
        mounts.push({ name: `/Volumes/${name}`, path: `/Volumes/${name}`, type: "drive" });
      }
    } catch { /* ignore */ }
  }
  if (existsSync("/mnt")) {
    try {
      for (const name of readdirSync("/mnt")) {
        const p = `/mnt/${name}`;
        if (existsSync(p) && lstatSync(p).isDirectory()) {
          mounts.push({ name: p, path: p, type: "drive" });
        }
      }
    } catch { /* ignore */ }
  }
  const home = homedir();
  if (!mounts.some((m) => m.path === home)) {
    mounts.push({ name: `~ (${home})`, path: home, type: "drive" });
  }
  return mounts;
}

function listDrives(): AgentToolResult {
  const drives = getSystemDrives();
  return jsonResult({
    tool: "enso_fs_list_drives",
    drives,
    total: drives.length,
    home: homedir(),
    cwd: process.cwd(),
  });
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

function openFile(params: OpenFileParams): AgentToolResult {
  const safe = safeResolvePath(params.path);
  if (!safe.ok) return errorResult(safe.error);
  if (!existsSync(safe.path)) return errorResult(`path does not exist: ${safe.path}`);
  const stat = lstatSync(safe.path);
  if (!stat.isFile()) return errorResult(`path is not a file: ${safe.path}`);

  const name = basename(safe.path);
  const ext = extname(name).toLowerCase();

  if (IMAGE_EXTS.has(ext)) {
    return jsonResult({
      tool: "enso_fs_open_file", fileType: "image",
      path: safe.path, name, ext, size: stat.size,
      mediaUrl: toMediaUrl(safe.path),
    });
  }
  if (VIDEO_EXTS.has(ext)) {
    return jsonResult({
      tool: "enso_fs_open_file", fileType: "video",
      path: safe.path, name, ext, size: stat.size,
      mediaUrl: toMediaUrl(safe.path),
    });
  }
  if (AUDIO_EXTS.has(ext)) {
    return jsonResult({
      tool: "enso_fs_open_file", fileType: "audio",
      path: safe.path, name, ext, size: stat.size,
      mediaUrl: toMediaUrl(safe.path),
    });
  }
  if (PDF_EXTS.has(ext)) {
    return jsonResult({
      tool: "enso_fs_open_file", fileType: "pdf",
      path: safe.path, name, ext, size: stat.size,
      mediaUrl: toMediaUrl(safe.path),
    });
  }
  if (TEXT_EXTS.has(ext) || ext === "") {
    const maxChars = DEFAULT_MAX_CHARS;
    const raw = readFileSync(safe.path, "utf-8");
    const truncated = raw.length > maxChars;
    const content = truncated ? `${raw.slice(0, maxChars)}\n...` : raw;
    return jsonResult({
      tool: "enso_fs_open_file", fileType: "text",
      path: safe.path, name, ext, size: stat.size,
      content, truncated,
    });
  }

  // Unknown binary
  return jsonResult({
    tool: "enso_fs_open_file", fileType: "binary",
    path: safe.path, name, ext, size: stat.size,
  });
}

function openExternal(params: OpenExternalParams): AgentToolResult {
  const safe = safeResolvePath(params.path);
  if (!safe.ok) return errorResult(safe.error);
  if (!existsSync(safe.path)) return errorResult(`path does not exist: ${safe.path}`);

  try {
    const plat = platform();
    if (plat === "win32") {
      execSync(`start "" "${safe.path}"`, { stdio: "ignore", windowsHide: true });
    } else if (plat === "darwin") {
      execSync(`open "${safe.path}"`, { stdio: "ignore" });
    } else {
      execSync(`xdg-open "${safe.path}"`, { stdio: "ignore" });
    }
    return jsonResult({
      tool: "enso_fs_open_external",
      path: safe.path,
      name: basename(safe.path),
      opened: true,
    });
  } catch (err: any) {
    return errorResult(`Failed to open file: ${err.message ?? err}`);
  }
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

function createDirectory(params: CreateDirectoryParams): AgentToolResult {
  const safe = safeResolvePath(params.path);
  if (!safe.ok) return errorResult(safe.error);
  if (existsSync(safe.path)) return errorResult(`path already exists: ${safe.path}`);
  mkdirSync(safe.path, { recursive: true });
  // Return the parent listing so the UI refreshes with the new folder visible
  const parent = dirname(safe.path);
  return listDirectory({ path: parent });
}

function renamePath(params: RenamePathParams): AgentToolResult {
  const safe = safeResolvePath(params.path);
  if (!safe.ok) return errorResult(safe.error);
  if (!existsSync(safe.path)) return errorResult(`path does not exist: ${safe.path}`);
  if (!params.newName?.trim()) return errorResult("newName is required");
  if (params.newName.includes("/") || params.newName.includes("\\")) return errorResult("newName must not contain path separators");
  const parent = dirname(safe.path);
  const dest = join(parent, params.newName);
  if (existsSync(dest)) return errorResult(`destination already exists: ${dest}`);
  renameSync(safe.path, dest);
  return listDirectory({ path: parent });
}

function deletePath(params: DeletePathParams): AgentToolResult {
  const safe = safeResolvePath(params.path);
  if (!safe.ok) return errorResult(safe.error);
  if (!existsSync(safe.path)) return errorResult(`path does not exist: ${safe.path}`);
  const parent = dirname(safe.path);
  rmSync(safe.path, { recursive: true, force: true });
  return listDirectory({ path: parent });
}

function movePath(params: MovePathParams): AgentToolResult {
  const safeSrc = safeResolvePath(params.source);
  if (!safeSrc.ok) return errorResult(`source: ${safeSrc.error}`);
  if (!existsSync(safeSrc.path)) return errorResult(`source does not exist: ${safeSrc.path}`);
  const safeDest = safeResolvePath(params.destination);
  if (!safeDest.ok) return errorResult(`destination: ${safeDest.error}`);

  // If destination is a directory, move into it keeping the original name
  let finalDest = safeDest.path;
  if (existsSync(safeDest.path) && lstatSync(safeDest.path).isDirectory()) {
    finalDest = join(safeDest.path, basename(safeSrc.path));
  }
  if (existsSync(finalDest)) return errorResult(`destination already exists: ${finalDest}`);
  renameSync(safeSrc.path, finalDest);

  // Return listing of the destination's parent so the UI shows where the file went
  return listDirectory({ path: dirname(finalDest) });
}

export function createFilesystemTools(): AnyAgentTool[] {
  return [
    {
      name: "enso_fs_list_drives",
      label: "Filesystem List Drives",
      description: "List all available system drives / root mount points.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
      execute: async () => listDrives(),
    } as AnyAgentTool,
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
      name: "enso_fs_open_file",
      label: "Filesystem Open File",
      description: "Open a file with appropriate viewer based on type (text, image, video, audio, PDF).",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", description: "File path to open." },
        },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => openFile(params as OpenFileParams),
    } as AnyAgentTool,
    {
      name: "enso_fs_open_external",
      label: "Filesystem Open External",
      description: "Open a file with the system's default application.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", description: "File path to open externally." },
        },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => openExternal(params as OpenExternalParams),
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
    {
      name: "enso_fs_create_directory",
      label: "Filesystem Create Directory",
      description: "Create a new directory. Returns the updated parent listing.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", description: "Full path for the new directory." },
        },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => createDirectory(params as CreateDirectoryParams),
    } as AnyAgentTool,
    {
      name: "enso_fs_rename_path",
      label: "Filesystem Rename",
      description: "Rename a file or directory. Returns the updated parent listing.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", description: "Current path of the file or directory." },
          newName: { type: "string", description: "New name (not a full path, just the filename)." },
        },
        required: ["path", "newName"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => renamePath(params as RenamePathParams),
    } as AnyAgentTool,
    {
      name: "enso_fs_delete_path",
      label: "Filesystem Delete",
      description: "Delete a file or directory recursively. Returns the updated parent listing.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", description: "Path to delete." },
        },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => deletePath(params as DeletePathParams),
    } as AnyAgentTool,
    {
      name: "enso_fs_move_path",
      label: "Filesystem Move",
      description: "Move a file or directory to a new location. Returns the updated destination listing.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          source: { type: "string", description: "Source path." },
          destination: { type: "string", description: "Destination path or directory." },
        },
        required: ["source", "destination"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => movePath(params as MovePathParams),
    } as AnyAgentTool,
  ];
}

export function registerFilesystemTools(api: OpenClawPluginApi): void {
  for (const tool of createFilesystemTools()) {
    api.registerTool(tool);
  }
}
