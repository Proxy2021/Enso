import type { EnsoAgentTool, EnsoPluginApi } from "./local-types.js";
import { appendFileSync, closeSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync } from "fs";
import { basename, dirname, extname, isAbsolute, join, normalize, resolve, sep } from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { execSync } from "child_process";
import { homedir, platform, tmpdir } from "os";
import { toMediaUrl } from "./server.js";

/** Detect project root from module location (server/src → ../../). */
const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url));
const DETECTED_PROJECT_ROOT = resolve(join(PLUGIN_DIR, "..", ".."));

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
const RAW_EXTS = new Set([".3fr", ".arw", ".cr2", ".cr3", ".nef", ".dng", ".raf", ".orf", ".rw2", ".pef", ".srw"]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico", ...RAW_EXTS]);
const VIDEO_EXTS = new Set([".mp4", ".webm", ".avi", ".mov", ".mkv", ".m4v", ".mts"]);

/**
 * Detect actual container format by inspecting file magic bytes.
 * MPEG-TS: 0x47 sync byte at 188-byte intervals (offsets 0, 188, 376).
 * MP4: "ftyp" atom signature at bytes 4-7.
 */
function detectVideoContainer(filePath: string): "mpegts" | "mp4" | "unknown" {
  try {
    const fd = openSync(filePath, "r");
    const buf = Buffer.alloc(377);
    const bytesRead = readSync(fd, buf, 0, 377, 0);
    closeSync(fd);
    if (bytesRead < 8) return "unknown";

    // MP4: bytes 4-7 = "ftyp"
    if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return "mp4";

    // MPEG-TS: 0x47 sync byte at 188-byte packet boundaries
    if (bytesRead >= 377 && buf[0] === 0x47 && buf[188] === 0x47 && buf[376] === 0x47) return "mpegts";
    if (bytesRead >= 189 && buf[0] === 0x47 && buf[188] === 0x47) return "mpegts";

    return "unknown";
  } catch {
    return "unknown";
  }
}
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

/** Allowed root directories for filesystem operations. */
const ALLOWED_ROOTS: string[] = [
  normalize(homedir()),
  normalize(tmpdir()),
];
// Add project root if running from a known project directory
const PROJECT_ROOT = normalize(DETECTED_PROJECT_ROOT);
if (!ALLOWED_ROOTS.some((r) => normalize(PROJECT_ROOT).startsWith(r))) {
  ALLOWED_ROOTS.push(PROJECT_ROOT);
}

/** System directories that must never be written to or deleted from. */
const PROTECTED_PATHS: string[] = platform() === "win32"
  ? ["C:\\Windows", "C:\\Program Files", "C:\\Program Files (x86)", "C:\\ProgramData"]
  : ["/bin", "/sbin", "/usr", "/lib", "/lib64", "/boot", "/proc", "/sys", "/dev", "/etc"];

function isUnderAllowedRoot(resolvedPath: string): boolean {
  const normalized = normalize(resolvedPath).toLowerCase();
  return ALLOWED_ROOTS.some((root) => normalized.startsWith(normalize(root).toLowerCase()));
}

function isProtectedPath(resolvedPath: string): boolean {
  const normalized = normalize(resolvedPath).toLowerCase();
  return PROTECTED_PATHS.some((p) => normalized.startsWith(p.toLowerCase()));
}

function safeResolvePath(inputPath: string): { ok: true; path: string } | { ok: false; error: string } {
  if (!inputPath || !inputPath.trim()) return { ok: false, error: "path is required" };
  // Reject null bytes (path injection vector)
  if (inputPath.includes("\0")) return { ok: false, error: "path contains invalid characters" };
  const resolved = resolveUserPath(inputPath);
  // Enforce allowed-roots: only paths under home, tmpdir, or project root
  if (!isUnderAllowedRoot(resolved)) {
    return { ok: false, error: `path is outside allowed directories: ${resolved}` };
  }
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
    const container = detectVideoContainer(safe.path);
    return jsonResult({
      tool: "enso_fs_open_file", fileType: "video",
      path: safe.path, name, ext, size: stat.size,
      mediaUrl: toMediaUrl(safe.path),
      container,
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
  // .ts could be TypeScript or MPEG-TS — sniff the actual bytes
  if (ext === ".ts") {
    const container = detectVideoContainer(safe.path);
    if (container === "mpegts") {
      return jsonResult({
        tool: "enso_fs_open_file", fileType: "video",
        path: safe.path, name, ext, size: stat.size,
        mediaUrl: toMediaUrl(safe.path),
        container: "mpegts",
      });
    }
    // Not MPEG-TS — fall through to text handler
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
  if (!params.path?.trim()) return errorResult("path is required");
  if (params.path.includes("\0")) return errorResult("path contains invalid characters");
  const resolved = resolve(params.path);
  if (!existsSync(resolved)) return errorResult(`path does not exist: ${resolved}`);
  const safe = { ok: true as const, path: resolved };

  try {
    const plat = platform();
    if (plat === "win32") {
      // cmd.exe /c start "" "path" — empty title in quotes, then quoted path for spaces/special chars
      execFile("cmd.exe", ["/c", "start", "", `"${safe.path}"`], { windowsHide: true }, () => {});
    } else if (plat === "darwin") {
      execFile("open", [safe.path], () => {});
    } else {
      execFile("xdg-open", [safe.path], () => {});
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

  // Prevent deletion of protected system directories
  if (isProtectedPath(safe.path)) {
    return errorResult(`cannot delete protected system path: ${safe.path}`);
  }

  // Prevent deletion of allowed roots themselves (only contents, not the root)
  const normalizedPath = normalize(safe.path).toLowerCase();
  if (ALLOWED_ROOTS.some((root) => normalize(root).toLowerCase() === normalizedPath)) {
    return errorResult(`cannot delete an allowed root directory: ${safe.path}`);
  }

  // Prevent deletion of home directory
  if (normalizedPath === normalize(homedir()).toLowerCase()) {
    return errorResult(`cannot delete home directory: ${safe.path}`);
  }

  const parent = dirname(safe.path);
  rmSync(safe.path, { recursive: true, force: true });
  return listDirectory({ path: parent });
}

type WriteFileParams = {
  path: string;
  content: string;
  mode?: "create" | "overwrite" | "append";
};

type CopyPathParams = {
  source: string;
  destination: string;
};

type SearchContentParams = {
  path: string;
  query: string;
  glob?: string;
  maxResults?: number;
  caseSensitive?: boolean;
};

function writeFile(params: WriteFileParams): AgentToolResult {
  const safe = safeResolvePath(params.path);
  if (!safe.ok) return errorResult(safe.error);
  if (isProtectedPath(safe.path)) return errorResult(`cannot write to protected system path: ${safe.path}`);

  const content = params.content ?? "";
  if (Buffer.byteLength(content, "utf-8") > 1_048_576) {
    return errorResult("content exceeds 1MB size limit");
  }

  const mode = params.mode ?? "create";

  if (mode === "create" && existsSync(safe.path)) {
    return errorResult(`file already exists (use mode 'overwrite' to replace): ${safe.path}`);
  }

  // Auto-create parent directories
  mkdirSync(dirname(safe.path), { recursive: true });

  if (mode === "append") {
    appendFileSync(safe.path, content, "utf-8");
  } else {
    writeFileSync(safe.path, content, "utf-8");
  }

  // Return parent directory listing for UI refresh
  const parent = dirname(safe.path);
  const parentEntries = existsSync(parent) ? readdirSync(parent).slice(0, 20) : [];

  return jsonResult({
    tool: "enso_fs_write_file",
    path: safe.path,
    bytesWritten: Buffer.byteLength(content, "utf-8"),
    mode,
    parentDir: parentEntries,
  });
}

function copyPath(params: CopyPathParams): AgentToolResult {
  const safeSrc = safeResolvePath(params.source);
  if (!safeSrc.ok) return errorResult(`source: ${safeSrc.error}`);
  if (!existsSync(safeSrc.path)) return errorResult(`source does not exist: ${safeSrc.path}`);

  const safeDest = safeResolvePath(params.destination);
  if (!safeDest.ok) return errorResult(`destination: ${safeDest.error}`);

  // If destination is a directory, copy into it keeping the original name
  let finalDest = safeDest.path;
  if (existsSync(safeDest.path) && lstatSync(safeDest.path).isDirectory()) {
    finalDest = join(safeDest.path, basename(safeSrc.path));
  }
  if (existsSync(finalDest)) return errorResult(`destination already exists: ${finalDest}`);

  // Auto-create parent directories
  mkdirSync(dirname(finalDest), { recursive: true });

  const srcStat = lstatSync(safeSrc.path);
  if (srcStat.isDirectory()) {
    cpSync(safeSrc.path, finalDest, { recursive: true });
  } else {
    copyFileSync(safeSrc.path, finalDest);
  }

  // Return listing of the destination's parent so the UI shows the result
  return listDirectory({ path: dirname(finalDest) });
}

const SEARCH_CONTENT_SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".cache", ".turbo"]);
const SEARCH_CONTENT_MAX_DEPTH = 6;
const SEARCH_CONTENT_MAX_FILES = 5000;
const SEARCH_CONTENT_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

function searchContent(params: SearchContentParams): AgentToolResult {
  const safe = safeResolvePath(params.path);
  if (!safe.ok) return errorResult(safe.error);
  if (!existsSync(safe.path)) return errorResult(`path does not exist: ${safe.path}`);
  if (!lstatSync(safe.path).isDirectory()) return errorResult(`path is not a directory: ${safe.path}`);

  const query = params.query;
  if (!query?.trim()) return errorResult("query is required");

  const caseSensitive = params.caseSensitive ?? false;
  let regex: RegExp;
  try {
    regex = new RegExp(query, caseSensitive ? "" : "i");
  } catch {
    // Fallback to literal string match
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    regex = new RegExp(escaped, caseSensitive ? "" : "i");
  }

  // Parse glob filter (e.g., "*.ts" → ".ts")
  let extFilter: string | null = null;
  if (params.glob) {
    const g = params.glob.trim();
    if (g.startsWith("*.")) {
      extFilter = g.slice(1).toLowerCase(); // ".ts"
    }
  }

  const maxResults = Math.min(Math.max(Number(params.maxResults ?? 50), 1), 200);
  const matches: Array<{ file: string; line: string; lineNumber: number }> = [];
  let totalFilesSearched = 0;
  let fileCount = 0;

  const walk = (dir: string, depth: number) => {
    if (matches.length >= maxResults || fileCount >= SEARCH_CONTENT_MAX_FILES || depth > SEARCH_CONTENT_MAX_DEPTH) return;
    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // Permission denied, etc.
    }
    for (const entry of entries) {
      if (matches.length >= maxResults || fileCount >= SEARCH_CONTENT_MAX_FILES) break;
      if (entry.name.startsWith(".") && SEARCH_CONTENT_SKIP_DIRS.has(entry.name)) continue;
      if (SEARCH_CONTENT_SKIP_DIRS.has(entry.name)) continue;

      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;

      // Apply glob/extension filter
      if (extFilter) {
        const ext = extname(entry.name).toLowerCase();
        if (ext !== extFilter) continue;
      }

      // Skip large files
      try {
        const st = lstatSync(fullPath);
        if (st.size > SEARCH_CONTENT_MAX_FILE_SIZE) continue;
      } catch { continue; }

      // Skip binary files (check first 8KB for null bytes)
      try {
        const fd = openSync(fullPath, "r");
        const buf = Buffer.alloc(8192);
        const bytesRead = readSync(fd, buf, 0, 8192, 0);
        closeSync(fd);
        if (bytesRead > 0 && buf.subarray(0, bytesRead).includes(0)) continue;
      } catch { continue; }

      fileCount++;
      totalFilesSearched++;

      // Read and search line by line
      try {
        const content = readFileSync(fullPath, "utf-8");
        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          if (matches.length >= maxResults) break;
          if (regex.test(lines[i])) {
            matches.push({
              file: fullPath,
              line: lines[i].trim().slice(0, 500),
              lineNumber: i + 1,
            });
          }
        }
      } catch { /* skip unreadable files */ }
    }
  };

  walk(safe.path, 0);

  return jsonResult({
    tool: "enso_fs_search_content",
    query,
    path: safe.path,
    matchCount: matches.length,
    totalFilesSearched,
    matches,
  });
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

export function createFilesystemTools(): EnsoAgentTool[] {
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
    } as EnsoAgentTool,
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
    } as EnsoAgentTool,
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
    } as EnsoAgentTool,
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
    } as EnsoAgentTool,
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
    } as EnsoAgentTool,
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
    } as EnsoAgentTool,
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
    } as EnsoAgentTool,
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
    } as EnsoAgentTool,
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
    } as EnsoAgentTool,
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
    } as EnsoAgentTool,
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
    } as EnsoAgentTool,
    {
      name: "enso_fs_write_file",
      label: "Write File",
      description: "Write text content to a file. Creates parent directories automatically. Default mode 'create' fails if file exists; use 'overwrite' to replace or 'append' to add to existing file.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", description: "Absolute file path to write." },
          content: { type: "string", description: "Text content to write." },
          mode: {
            type: "string",
            enum: ["create", "overwrite", "append"],
            description: "Write mode: 'create' (fail if exists), 'overwrite' (replace), 'append' (add to end). Default: create.",
          },
        },
        required: ["path", "content"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => writeFile(params as WriteFileParams),
    } as EnsoAgentTool,
    {
      name: "enso_fs_copy_path",
      label: "Copy Path",
      description: "Copy a file or directory to a destination. If destination is an existing directory, copies into it preserving the original name. Recursively copies directories.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          source: { type: "string", description: "Source file or directory path." },
          destination: { type: "string", description: "Destination path or directory." },
        },
        required: ["source", "destination"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => copyPath(params as CopyPathParams),
    } as EnsoAgentTool,
    {
      name: "enso_fs_search_content",
      label: "Search File Contents",
      description: "Search for text or regex patterns within files under a directory. Returns matching lines with file paths and line numbers. Skips binary files and files larger than 5MB.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", description: "Root directory to search." },
          query: { type: "string", description: "Text or regex pattern to search for." },
          glob: { type: "string", description: "File extension filter, e.g. '*.ts' or '*.log'." },
          maxResults: { type: "number", description: "Maximum matches to return (default 50, max 200)." },
          caseSensitive: { type: "boolean", description: "Case-sensitive search (default false)." },
        },
        required: ["path", "query"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => searchContent(params as SearchContentParams),
    } as EnsoAgentTool,
  ];
}

export function registerFilesystemTools(api?: EnsoPluginApi): void {
  for (const tool of createFilesystemTools()) {
    if (api) api.registerTool(tool);
  }
}
