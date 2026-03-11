import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { existsSync, lstatSync, readdirSync, readFileSync, writeFileSync, mkdirSync, statSync, unlinkSync } from "fs";
import { basename, dirname, extname, isAbsolute, join, normalize, resolve } from "path";
import { homedir, platform } from "os";
import { execSync, execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { toMediaUrl } from "./server.js";
import { parseImageMeta, type ExifData } from "./exif-parser.js";
import { logError } from "./action-log.js";

type AgentToolResult = { content: Array<{ type: string; text?: string }> };

// ── Param types ───────────────────────────────────────────────────────────

type ScanMediaParams = { path: string; limit?: number };
type InspectMediaParams = { path: string };
type GroupMediaParams = { path: string; limit?: number };
type BrowseFolderParams = { path?: string; filter?: string; sortBy?: string; sortDir?: string };
type BookmarkFolderParams = { path: string; action?: string };
type ViewPhotoParams = { path: string };
type DescribePhotoParams = { path: string };
type SearchPhotosParams = { path: string; query: string; limit?: number };
type BatchTagParams = { path: string; limit?: number };
type ToggleFavoriteParams = { path: string; favorite?: boolean };
type ManageCollectionParams = { action: string; collectionName?: string; photoPath?: string; newName?: string };
type RatePhotoParams = { path: string; rating: number };
type ProcessPhotosParams = { inputDir: string; style: string; outputSubfolder?: string };
type ProcessSinglePhotoParams = { inputFile: string; outputFile?: string; style: string; maxSize?: number };
type StylePreviewsParams = { photoPath: string; styles?: string[] };

// ── Style Registry (loaded from styles.json) ─────────────────────────────

interface StyleInfo {
  id: string;
  name: string;
  subtitle: string;
  category: string;
  description: string;
  tags: string[];
  ui: { bg: string; border: string; text: string };
  signature: string;
  famous_for: string;
  best_for: string[];
  mood: string[];
  intensity: number;
  era: string;
}

let _styleIds: string[] | null = null;
let _styleInfoMap: Record<string, StyleInfo> | null = null;

function getStylesFilePath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "styles.json");
}

function loadStyleRegistry(): { ids: string[]; infoMap: Record<string, StyleInfo> } {
  if (_styleIds && _styleInfoMap) return { ids: _styleIds, infoMap: _styleInfoMap };

  const stylesPath = getStylesFilePath();
  try {
    const raw = JSON.parse(readFileSync(stylesPath, "utf-8"));
    const ids: string[] = [];
    const infoMap: Record<string, StyleInfo> = {};
    const categories: Record<string, string> = {};
    for (const cat of (raw.categories || [])) categories[cat.id] = cat.name;

    for (const [id, def] of Object.entries(raw.styles || {})) {
      const s = def as Record<string, unknown>;
      if (!(s as { recipe?: unknown }).recipe) continue;
      ids.push(id);
      infoMap[id] = {
        id,
        name: (s.name as string) || id,
        subtitle: (s.subtitle as string) || "",
        category: categories[(s.category as string)] || (s.category as string) || "",
        description: (s.description as string) || "",
        tags: (s.tags as string[]) || [],
        ui: (s.ui as { bg: string; border: string; text: string }) || { bg: "", border: "", text: "" },
        signature: (s.signature as string) || "",
        famous_for: (s.famous_for as string) || "",
        best_for: (s.best_for as string[]) || [],
        mood: (s.mood as string[]) || [],
        intensity: (s.intensity as number) || 3,
        era: (s.era as string) || "",
      };
    }
    _styleIds = ids;
    _styleInfoMap = infoMap;
    return { ids, infoMap };
  } catch (err) {
    logError("media:styles", "Failed to load styles.json", err);
    return { ids: [], infoMap: {} };
  }
}

/** Invalidate cached style registry (call after styles.json changes) */
export function invalidateStyleCache(): void {
  _styleIds = null;
  _styleInfoMap = null;
}

// ── Constants ─────────────────────────────────────────────────────────────

const RAW_EXTS = new Set([".3fr", ".arw", ".cr2", ".cr3", ".nef", ".dng", ".raf", ".orf", ".rw2", ".pef", ".srw"]);
const MEDIA_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp4", ".webm", ".mov", ".m4v", ".pdf", ...RAW_EXTS]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ...RAW_EXTS]);
const VIDEO_EXTS = new Set([".mp4", ".webm", ".mov", ".m4v"]);
const DEFAULT_MEDIA_LIMIT = 120;
const THUMB_DIR = join(homedir(), ".openclaw", "enso-apps", "multimedia", "thumbs");
const TRANSCODE_DIR = join(homedir(), ".openclaw", "enso-apps", "multimedia", "transcode");

/** Video codecs that browsers can natively decode */
const WEB_CODECS = new Set(["h264", "vp8", "vp9", "av1"]);

// ── Helpers ───────────────────────────────────────────────────────────────

function jsonResult(data: unknown): AgentToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string): AgentToolResult {
  return { content: [{ type: "text", text: `[ERROR] ${message}` }] };
}

function ok(data: Record<string, unknown>): AgentToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

/** Resolve a user-provided path. Aligned with filesystem-tools.ts — no root restriction. */
function safeResolvePath(inputPath: string): { ok: true; path: string } | { ok: false; error: string } {
  if (!inputPath || !inputPath.trim()) return { ok: false, error: "path is required" };
  let expanded = inputPath.startsWith("~")
    ? join(homedir(), inputPath.slice(1))
    : inputPath;
  // Bare Windows drive letters like "F:" aren't recognized as absolute — normalise to "F:\"
  if (/^[A-Za-z]:$/.test(expanded)) expanded += "\\";
  const candidate = isAbsolute(expanded)
    ? expanded
    : join(process.cwd(), expanded);
  return { ok: true, path: normalize(resolve(candidate)) };
}

function mediaTypeForExt(ext: string): "image" | "video" | "document" | "other" {
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext) || RAW_EXTS.has(ext)) return "image";
  if ([".mp4", ".webm", ".mov", ".m4v"].includes(ext)) return "video";
  if ([".pdf"].includes(ext)) return "document";
  return "other";
}

interface MediaItem {
  name: string;
  path: string;
  ext: string;
  type: "image" | "video" | "document" | "other";
  size: number;
  mediaUrl: string;
  thumbnailUrl?: string;
  modifiedAt: string;
  exif?: ExifData | null;
  isFavorite?: boolean;
  rating?: number;
  aiTags?: string[];
  aiDescription?: string;
}

interface DirEntry {
  name: string;
  path: string;
  itemCount: number;
}

// ── Video Thumbnail Generation ───────────────────────────────────────────

let ffmpegAvailable: boolean | null = null;

function hasFfmpeg(): boolean {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore", timeout: 3000, windowsHide: true });
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}

/**
 * Generate a JPEG thumbnail for a video file. Returns the thumbnail path if
 * successful, or undefined. Thumbnails are cached in THUMB_DIR with a
 * filename based on the video path hash.
 */
function getVideoThumbnail(videoPath: string): string | undefined {
  if (!hasFfmpeg()) return undefined;
  try {
    mkdirSync(THUMB_DIR, { recursive: true });
    // Use base64url of the path as a unique, filesystem-safe key
    const key = Buffer.from(videoPath, "utf-8").toString("base64url");
    const thumbPath = join(THUMB_DIR, key + ".jpg");
    if (existsSync(thumbPath)) return thumbPath;
    // Extract a frame at 1 second (or the first frame for very short clips)
    execFileSync("ffmpeg", [
      "-y", "-ss", "1", "-i", videoPath,
      "-frames:v", "1", "-q:v", "6",
      "-vf", "scale=320:-2",
      thumbPath,
    ], { timeout: 10_000, windowsHide: true, stdio: "ignore" });
    if (existsSync(thumbPath)) return thumbPath;
  } catch { /* ignore — thumbnail generation is best-effort */ }
  return undefined;
}

/**
 * Get the cached video codec for a file, probing with ffprobe if not yet cached.
 * Returns the codec name (e.g. "h264", "mpeg4") or undefined.
 */
function getVideoCodec(videoPath: string): string | undefined {
  if (!hasFfmpeg()) return undefined;
  const key = Buffer.from(videoPath, "utf-8").toString("base64url");
  const codecFile = join(THUMB_DIR, key + ".codec");
  if (existsSync(codecFile)) {
    try { return readFileSync(codecFile, "utf-8").trim() || undefined; } catch {}
  }
  try {
    mkdirSync(THUMB_DIR, { recursive: true });
    const result = execFileSync("ffprobe", [
      "-v", "quiet", "-select_streams", "v:0",
      "-show_entries", "stream=codec_name", "-of", "csv=p=0",
      videoPath,
    ], { timeout: 5000, windowsHide: true, encoding: "utf-8" });
    const codec = result.trim().split("\n")[0]?.trim();
    if (codec) {
      try { writeFileSync(codecFile, codec, "utf-8"); } catch {}
    }
    return codec || undefined;
  } catch { return undefined; }
}

function buildMediaItem(fullPath: string, stat: ReturnType<typeof lstatSync>): MediaItem {
  const ext = extname(fullPath).toLowerCase();
  const isImage = IMAGE_EXTS.has(ext);
  const item: MediaItem = {
    name: basename(fullPath),
    path: fullPath,
    ext,
    type: mediaTypeForExt(ext),
    size: stat.size,
    mediaUrl: toMediaUrl(fullPath),
    modifiedAt: stat.mtime.toISOString(),
  };
  // Only parse EXIF for images
  if (isImage) {
    try { item.exif = parseImageMeta(fullPath) ?? undefined; } catch { /* ignore */ }
  }
  // Generate thumbnail for videos + check codec for browser compatibility
  if (VIDEO_EXTS.has(ext)) {
    const thumbPath = getVideoThumbnail(fullPath);
    if (thumbPath) item.thumbnailUrl = toMediaUrl(thumbPath);
    // Check if video needs transcoding for browser playback
    const cacheKey = Buffer.from(fullPath, "utf-8").toString("base64url");
    const cachedTranscode = join(TRANSCODE_DIR, cacheKey + ".mp4");
    if (existsSync(cachedTranscode)) {
      item.mediaUrl = toMediaUrl(cachedTranscode);
    } else {
      const codec = getVideoCodec(fullPath);
      if (codec && !WEB_CODECS.has(codec)) {
        item.mediaUrl += "&transcode=1";
      }
    }
  }
  // Attach persisted metadata
  const stored = storeGet(`ai:${fullPath}`) as { description?: string; tags?: string[] } | null;
  if (stored) {
    item.aiTags = stored.tags;
    item.aiDescription = stored.description;
  }
  const favs = storeGet("favorites") as Record<string, unknown> | null;
  if (favs && favs[fullPath]) item.isFavorite = true;
  const ratings = storeGet("ratings") as Record<string, number> | null;
  if (ratings && ratings[fullPath]) item.rating = ratings[fullPath];
  return item;
}

// ── Metadata Store ────────────────────────────────────────────────────────
// Persistent JSON file at ~/.openclaw/enso-apps/multimedia/store.json

const STORE_DIR = join(homedir(), ".openclaw", "enso-apps", "multimedia");
const STORE_PATH = join(STORE_DIR, "store.json");
let storeCache: Record<string, unknown> | null = null;

function storeLoad(): Record<string, unknown> {
  if (storeCache) return storeCache;
  try {
    if (existsSync(STORE_PATH)) {
      storeCache = JSON.parse(readFileSync(STORE_PATH, "utf-8")) as Record<string, unknown>;
      return storeCache;
    }
  } catch { /* corrupt file, start fresh */ }
  storeCache = {};
  return storeCache;
}

function storeSave(): void {
  if (!storeCache) return;
  try {
    mkdirSync(STORE_DIR, { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify(storeCache, null, 2), "utf-8");
  } catch (e) {
    logError("media", "store write error", e);
  }
}

function storeGet(key: string): unknown {
  const data = storeLoad();
  return data[key] ?? null;
}

function storeSet(key: string, value: unknown): void {
  const data = storeLoad();
  data[key] = value;
  storeSave();
}

// ── Drive listing (entry point) ───────────────────────────────────────────

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
    const letters = "CDEFGHIJKLMNOPQRSTUVWXYZAB";
    return [...letters].filter((l) => existsSync(`${l}:\\`)).map((l) => ({
      name: `${l}:\\`,
      path: `${l}:\\`,
      type: "drive" as const,
    }));
  }
  // macOS / Linux
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
  const home = homedir();
  if (!mounts.some((m) => m.path === home)) {
    mounts.push({ name: `~ (${basename(home)})`, path: home, type: "drive" });
  }
  return mounts;
}

function listDrives(): AgentToolResult {
  const drives = getSystemDrives();
  const bookmarks = (storeGet("bookmarked_folders") ?? []) as Array<{ name: string; path: string }>;

  // Quick-access locations
  const home = homedir();
  const quickAccess: Array<{ name: string; path: string }> = [];
  const tryAdd = (label: string, p: string) => {
    if (existsSync(p)) quickAccess.push({ name: label, path: p });
  };
  tryAdd("Pictures", join(home, "Pictures"));
  tryAdd("Photos", join(home, "Photos"));
  tryAdd("Downloads", join(home, "Downloads"));
  tryAdd("Desktop", join(home, "Desktop"));
  tryAdd("OneDrive Pictures", join(home, "OneDrive", "Pictures"));

  return jsonResult({
    tool: "enso_media_list_drives",
    drives,
    quickAccess,
    bookmarks,
    total: drives.length,
    home,
  });
}

function bookmarkFolder(params: BookmarkFolderParams): AgentToolResult {
  const action = (params.action ?? "toggle").trim();
  const safe = safeResolvePath(params.path);
  if (!safe.ok) return errorResult(safe.error);

  const bookmarks = (storeGet("bookmarked_folders") ?? []) as Array<{ name: string; path: string }>;
  const idx = bookmarks.findIndex((b) => b.path === safe.path);

  if (action === "remove" || (action === "toggle" && idx >= 0)) {
    if (idx >= 0) bookmarks.splice(idx, 1);
  } else {
    if (idx < 0) {
      bookmarks.push({ name: basename(safe.path), path: safe.path });
    }
  }
  storeSet("bookmarked_folders", bookmarks);

  // Return drive listing so the UI refreshes
  return listDrives();
}

// ── Existing tools (enhanced) ─────────────────────────────────────────────

function scanMedia(params: ScanMediaParams): AgentToolResult {
  const safe = safeResolvePath(params.path);
  if (!safe.ok) return errorResult(safe.error);
  if (!existsSync(safe.path)) return errorResult(`path does not exist: ${safe.path}`);
  if (!lstatSync(safe.path).isDirectory()) return errorResult(`path is not a directory: ${safe.path}`);

  const limit = Math.max(1, Math.min(600, params.limit ?? DEFAULT_MEDIA_LIMIT));
  const items: MediaItem[] = [];

  const walk = (dir: string, depth: number) => {
    if (items.length >= limit || depth > 4) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (items.length >= limit) break;
      if (entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (!MEDIA_EXTS.has(ext)) continue;
        try {
          const stat = lstatSync(full);
          items.push(buildMediaItem(full, stat));
        } catch { /* skip unreadable files */ }
      }
    }
  };
  walk(safe.path, 0);

  return jsonResult({
    tool: "enso_media_scan_library",
    path: safe.path,
    total: items.length,
    items,
  });
}

function inspectMedia(params: InspectMediaParams): AgentToolResult {
  const safe = safeResolvePath(params.path);
  if (!safe.ok) return errorResult(safe.error);
  if (!existsSync(safe.path)) return errorResult(`path does not exist: ${safe.path}`);
  if (!lstatSync(safe.path).isFile()) return errorResult(`path is not a file: ${safe.path}`);
  const stat = lstatSync(safe.path);
  const item = buildMediaItem(safe.path, stat);
  return jsonResult({ tool: "enso_media_inspect_file", ...item });
}

function groupMediaByType(params: GroupMediaParams): AgentToolResult {
  const scanned = scanMedia({ path: params.path, limit: params.limit });
  const text = scanned.content[0]?.text ?? "";
  if (text.startsWith("[ERROR]")) return scanned;
  const parsed = JSON.parse(text) as { items?: Array<{ type: string }> };
  const counts = new Map<string, number>();
  for (const item of parsed.items ?? []) {
    counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
  }
  return jsonResult({
    tool: "enso_media_group_by_type",
    path: params.path,
    groups: Array.from(counts.entries()).map(([type, count]) => ({ type, count })),
  });
}

// ── Phase 1: Browse & View ────────────────────────────────────────────────

/** Find the best starting directory for photo browsing. */
function defaultPhotoPath(): string {
  // Try common photo directories
  const home = homedir();
  const candidates = [
    join(home, "Pictures"),
    join(home, "Photos"),
    join(home, "OneDrive", "Pictures"),
    join(home, "Images"),
    home,
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return home;
}

function browseFolder(params: BrowseFolderParams): AgentToolResult {
  const inputPath = (params.path ?? "").trim();
  // No path → build a virtual root listing using drives + quick-access in the
  // standard browseFolder response shape so templates get a consistent format.
  if (!inputPath) {
    const drives = getSystemDrives();
    const home = homedir();
    const quickAccess: Array<{ name: string; path: string }> = [];
    const tryAdd = (label: string, p: string) => {
      if (existsSync(p)) quickAccess.push({ name: label, path: p });
    };
    tryAdd("Desktop", join(home, "Desktop"));
    tryAdd("Documents", join(home, "Documents"));
    tryAdd("Downloads", join(home, "Downloads"));
    tryAdd("Pictures", join(home, "Pictures"));
    tryAdd("Photos", join(home, "Photos"));

    // Map drives + quick-access to the standard directories shape
    const directories: DirEntry[] = [];
    // Quick access first (most useful)
    for (const qa of quickAccess) {
      let itemCount = 0;
      try {
        const sub = readdirSync(qa.path, { withFileTypes: true });
        for (const s of sub) {
          if (s.isFile() && MEDIA_EXTS.has(extname(s.name).toLowerCase())) itemCount++;
        }
      } catch { /* skip */ }
      directories.push({ name: `⭐ ${qa.name}`, path: qa.path, itemCount });
    }
    // Then drives / volumes
    for (const d of drives) {
      // Skip home if already shown via quick access parent
      if (d.path === home) continue;
      directories.push({ name: d.name, path: d.path, itemCount: 0 });
    }

    return jsonResult({
      tool: "enso_media_browse_folder",
      path: "/",
      parentPath: undefined,
      total: 0,
      items: [] as MediaItem[],
      directories,
      filter: params.filter ?? "all",
      sortBy: params.sortBy ?? "name",
      sortDir: params.sortDir ?? "asc",
    });
  }
  const safe = safeResolvePath(inputPath);
  if (!safe.ok) return errorResult(safe.error);
  if (!existsSync(safe.path)) return errorResult(`path does not exist: ${safe.path}`);
  if (!lstatSync(safe.path).isDirectory()) return errorResult(`path is not a directory: ${safe.path}`);

  const filter = params.filter ?? "all"; // all | image | video
  const sortBy = params.sortBy ?? "name"; // name | date | size
  const sortDir = params.sortDir ?? "asc"; // asc | desc

  const items: MediaItem[] = [];
  const directories: DirEntry[] = [];

  let entries;
  try { entries = readdirSync(safe.path, { withFileTypes: true }); } catch (e) {
    return errorResult(`cannot read directory: ${e}`);
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = join(safe.path, entry.name);

    if (entry.isDirectory()) {
      // Count media files in subdirectory (1-level only, quick count)
      let count = 0;
      try {
        const sub = readdirSync(full, { withFileTypes: true });
        for (const s of sub) {
          if (s.isFile() && MEDIA_EXTS.has(extname(s.name).toLowerCase())) count++;
        }
      } catch { /* skip unreadable dirs */ }
      directories.push({ name: entry.name, path: full, itemCount: count });
    } else if (entry.isFile()) {
      const ext = extname(entry.name).toLowerCase();
      if (!MEDIA_EXTS.has(ext)) continue;
      const mtype = mediaTypeForExt(ext);
      if (filter !== "all" && mtype !== filter) continue;
      try {
        const stat = lstatSync(full);
        items.push(buildMediaItem(full, stat));
      } catch { /* skip */ }
    }
  }

  // Sort
  items.sort((a, b) => {
    let cmp = 0;
    if (sortBy === "date") {
      cmp = new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime();
    } else if (sortBy === "size") {
      cmp = a.size - b.size;
    } else {
      cmp = a.name.localeCompare(b.name);
    }
    return sortDir === "desc" ? -cmp : cmp;
  });

  directories.sort((a, b) => a.name.localeCompare(b.name));

  const parentPath = dirname(safe.path);

  return jsonResult({
    tool: "enso_media_browse_folder",
    path: safe.path,
    parentPath: parentPath !== safe.path ? parentPath : undefined,
    total: items.length,
    items,
    directories,
    filter,
    sortBy,
    sortDir,
  });
}

function viewPhoto(params: ViewPhotoParams): AgentToolResult {
  const safe = safeResolvePath(params.path);
  if (!safe.ok) return errorResult(safe.error);
  if (!existsSync(safe.path)) return errorResult(`path does not exist: ${safe.path}`);
  if (!lstatSync(safe.path).isFile()) return errorResult(`path is not a file: ${safe.path}`);

  const stat = lstatSync(safe.path);
  const item = buildMediaItem(safe.path, stat);

  return jsonResult({
    tool: "enso_media_view_photo",
    ...item,
  });
}

// ── Phase 2: AI Vision ────────────────────────────────────────────────────

async function describePhoto(params: DescribePhotoParams): Promise<AgentToolResult> {
  const safe = safeResolvePath(params.path);
  if (!safe.ok) return errorResult(safe.error);
  if (!existsSync(safe.path)) return errorResult(`path does not exist: ${safe.path}`);

  const ext = extname(safe.path).toLowerCase();
  if (!IMAGE_EXTS.has(ext)) return errorResult("not an image file");

  // Check cache first
  const cacheKey = `ai:${safe.path}`;
  const cached = storeGet(cacheKey) as { description?: string; tags?: string[] } | null;
  if (cached?.description) {
    return jsonResult({
      tool: "enso_media_describe_photo",
      name: basename(safe.path),
      path: safe.path,
      mediaUrl: toMediaUrl(safe.path),
      description: cached.description,
      tags: cached.tags ?? [],
      cached: true,
    });
  }

  // Call Gemini Vision
  try {
    const { callGeminiVision } = await import("./ui-generator.js");
    const { getActiveAccount } = await import("./server.js");
    const account = getActiveAccount();
    const apiKey = account?.geminiApiKey;
    if (!apiKey) return errorResult("no Gemini API key configured");

    const response = await callGeminiVision({
      imagePath: safe.path,
      prompt: `Analyze this photo. Respond with ONLY valid JSON (no markdown):
{"description": "A 2-3 sentence description of what is in this photo, its mood, setting, and notable elements.", "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]}

Be specific with tags. Include: subject matter, colors, setting/location type, time of day, mood, objects, activities. Provide 5-10 tags.`,
      apiKey,
    });

    let parsed: { description?: string; tags?: string[] };
    try {
      parsed = JSON.parse(response);
    } catch {
      // Try to extract JSON from response
      const match = response.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        parsed = { description: response, tags: [] };
      }
    }

    // Cache the result
    storeSet(cacheKey, { description: parsed.description, tags: parsed.tags });

    return jsonResult({
      tool: "enso_media_describe_photo",
      name: basename(safe.path),
      path: safe.path,
      mediaUrl: toMediaUrl(safe.path),
      description: parsed.description ?? "",
      tags: parsed.tags ?? [],
      cached: false,
    });
  } catch (e) {
    return errorResult(`AI describe failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function searchPhotos(params: SearchPhotosParams): Promise<AgentToolResult> {
  const safe = safeResolvePath(params.path);
  if (!safe.ok) return errorResult(safe.error);
  if (!existsSync(safe.path)) return errorResult(`path does not exist: ${safe.path}`);

  const query = (params.query ?? "").toLowerCase().trim();
  if (!query) return errorResult("query is required");
  const limit = Math.min(60, params.limit ?? 30);

  // Scan for images
  const items: MediaItem[] = [];
  let entries;
  try { entries = readdirSync(safe.path, { withFileTypes: true }); } catch { entries = []; }

  const walk = (dir: string, depth: number) => {
    if (depth > 3) return;
    let dirEntries;
    try { dirEntries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of dirEntries) {
      if (entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (!IMAGE_EXTS.has(ext)) continue;
        try {
          const stat = lstatSync(full);
          items.push(buildMediaItem(full, stat));
        } catch { /* skip */ }
      }
    }
  };
  walk(safe.path, 0);

  // Score each item against query
  const queryTerms = query.split(/\s+/);
  const scored: Array<{ item: MediaItem; score: number; matchReason: string }> = [];

  for (const item of items) {
    let score = 0;
    const reasons: string[] = [];

    // Match against filename
    const nameLower = item.name.toLowerCase();
    for (const term of queryTerms) {
      if (nameLower.includes(term)) { score += 2; reasons.push("filename"); break; }
    }

    // Match against AI description
    if (item.aiDescription) {
      const descLower = item.aiDescription.toLowerCase();
      for (const term of queryTerms) {
        if (descLower.includes(term)) { score += 5; reasons.push("description"); break; }
      }
    }

    // Match against AI tags
    if (item.aiTags?.length) {
      for (const tag of item.aiTags) {
        const tagLower = tag.toLowerCase();
        for (const term of queryTerms) {
          if (tagLower.includes(term) || term.includes(tagLower)) {
            score += 8;
            reasons.push(`tag:${tag}`);
          }
        }
      }
    }

    // Match against EXIF camera
    if (item.exif?.cameraMake) {
      const cam = `${item.exif.cameraMake} ${item.exif.cameraModel ?? ""}`.toLowerCase();
      for (const term of queryTerms) {
        if (cam.includes(term)) { score += 3; reasons.push("camera"); break; }
      }
    }

    if (score > 0) {
      scored.push({ item, score, matchReason: [...new Set(reasons)].join(", ") });
    }
  }

  // Sort by score desc, take top N
  scored.sort((a, b) => b.score - a.score);
  const results = scored.slice(0, limit).map(({ item, matchReason }) => ({
    ...item,
    matchReason,
  }));

  return jsonResult({
    tool: "enso_media_search_photos",
    path: safe.path,
    query: params.query,
    total: results.length,
    totalScanned: items.length,
    totalWithAI: items.filter(i => i.aiDescription).length,
    results,
  });
}

async function batchTag(params: BatchTagParams): Promise<AgentToolResult> {
  const safe = safeResolvePath(params.path);
  if (!safe.ok) return errorResult(safe.error);
  if (!existsSync(safe.path)) return errorResult(`path does not exist: ${safe.path}`);

  const limit = Math.min(20, params.limit ?? 10);

  // Find images without cached AI data
  let entries;
  try { entries = readdirSync(safe.path, { withFileTypes: true }); } catch {
    return errorResult("cannot read directory");
  }

  const untagged: string[] = [];
  let alreadyTagged = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = extname(entry.name).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;
    const full = join(safe.path, entry.name);
    const cached = storeGet(`ai:${full}`) as { description?: string } | null;
    if (cached?.description) {
      alreadyTagged++;
    } else {
      untagged.push(full);
    }
  }

  // Process up to limit
  let tagged = 0;
  let errors = 0;
  const toProcess = untagged.slice(0, limit);

  for (const filePath of toProcess) {
    try {
      const result = await describePhoto({ path: filePath });
      const text = result.content[0]?.text ?? "";
      if (!text.startsWith("[ERROR]")) {
        tagged++;
      } else {
        errors++;
      }
    } catch {
      errors++;
    }
  }

  return jsonResult({
    tool: "enso_media_batch_tag",
    path: safe.path,
    tagged,
    skipped: alreadyTagged,
    remaining: Math.max(0, untagged.length - limit),
    errors,
  });
}

// ── Phase 3: Favorites, Collections, Ratings ──────────────────────────────

function toggleFavorite(params: ToggleFavoriteParams): AgentToolResult {
  const safe = safeResolvePath(params.path);
  if (!safe.ok) return errorResult(safe.error);
  if (!existsSync(safe.path)) return errorResult(`path does not exist: ${safe.path}`);

  const favs = (storeGet("favorites") ?? {}) as Record<string, { addedAt: number }>;
  const isFav = !!favs[safe.path];
  const newState = params.favorite !== undefined ? params.favorite : !isFav;

  if (newState) {
    favs[safe.path] = { addedAt: Date.now() };
  } else {
    delete favs[safe.path];
  }
  storeSet("favorites", favs);

  // Return the updated photo view
  return viewPhoto({ path: safe.path });
}

function ratePhoto(params: RatePhotoParams): AgentToolResult {
  const safe = safeResolvePath(params.path);
  if (!safe.ok) return errorResult(safe.error);
  if (!existsSync(safe.path)) return errorResult(`path does not exist: ${safe.path}`);

  const rating = Math.max(0, Math.min(5, Math.round(params.rating)));
  const ratings = (storeGet("ratings") ?? {}) as Record<string, number>;

  if (rating === 0) {
    delete ratings[safe.path];
  } else {
    ratings[safe.path] = rating;
  }
  storeSet("ratings", ratings);

  return viewPhoto({ path: safe.path });
}

interface Collection {
  photos: string[];
  createdAt: number;
}

function manageCollection(params: ManageCollectionParams): AgentToolResult {
  const action = params.action;
  const collections = (storeGet("collections") ?? {}) as Record<string, Collection>;

  if (action === "list") {
    const list = Object.entries(collections).map(([name, col]) => ({
      name,
      count: col.photos.length,
      createdAt: col.createdAt,
      coverUrl: col.photos[0] ? toMediaUrl(col.photos[0]) : undefined,
    }));
    return jsonResult({
      tool: "enso_media_manage_collection",
      action: "list",
      collections: list,
    });
  }

  if (action === "create") {
    const name = (params.collectionName ?? "").trim();
    if (!name) return errorResult("collectionName is required");
    if (collections[name]) return errorResult(`collection "${name}" already exists`);
    collections[name] = { photos: [], createdAt: Date.now() };
    storeSet("collections", collections);
    return manageCollection({ action: "list" });
  }

  if (action === "add") {
    const name = (params.collectionName ?? "").trim();
    const photo = (params.photoPath ?? "").trim();
    if (!name || !photo) return errorResult("collectionName and photoPath are required");
    if (!collections[name]) return errorResult(`collection "${name}" does not exist`);
    if (!collections[name].photos.includes(photo)) {
      collections[name].photos.push(photo);
      storeSet("collections", collections);
    }
    return manageCollection({ action: "list" });
  }

  if (action === "remove") {
    const name = (params.collectionName ?? "").trim();
    const photo = (params.photoPath ?? "").trim();
    if (!name || !photo) return errorResult("collectionName and photoPath are required");
    if (!collections[name]) return errorResult(`collection "${name}" does not exist`);
    collections[name].photos = collections[name].photos.filter((p) => p !== photo);
    storeSet("collections", collections);
    return manageCollection({ action: "list" });
  }

  if (action === "delete") {
    const name = (params.collectionName ?? "").trim();
    if (!name) return errorResult("collectionName is required");
    delete collections[name];
    storeSet("collections", collections);
    return manageCollection({ action: "list" });
  }

  if (action === "rename") {
    const name = (params.collectionName ?? "").trim();
    const newName = (params.newName ?? "").trim();
    if (!name || !newName) return errorResult("collectionName and newName are required");
    if (!collections[name]) return errorResult(`collection "${name}" does not exist`);
    collections[newName] = collections[name];
    delete collections[name];
    storeSet("collections", collections);
    return manageCollection({ action: "list" });
  }

  if (action === "view") {
    const name = (params.collectionName ?? "").trim();
    if (!name) return errorResult("collectionName is required");
    const col = collections[name];
    if (!col) return errorResult(`collection "${name}" does not exist`);

    const items: MediaItem[] = [];
    for (const photoPath of col.photos) {
      if (!existsSync(photoPath)) continue;
      try {
        const stat = lstatSync(photoPath);
        items.push(buildMediaItem(photoPath, stat));
      } catch { /* skip */ }
    }

    return jsonResult({
      tool: "enso_media_manage_collection",
      action: "view",
      collectionName: name,
      total: items.length,
      items,
    });
  }

  return errorResult(`unknown action: ${action}`);
}

// ── Photo Processing ──────────────────────────────────────────────────────

const PROCESSED_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".tiff", ".tif", ".bmp", ".webp", ".3fr", ".arw", ".cr2", ".cr3", ".nef", ".dng", ".raf", ".orf", ".rw2", ".pef", ".srw"]);

async function processPhotos(params: ProcessPhotosParams): Promise<AgentToolResult> {
  const { inputDir, style, outputSubfolder } = params;
  const { ids: validStyles } = loadStyleRegistry();

  if (!inputDir || !existsSync(inputDir)) return errorResult(`Input directory not found: ${inputDir}`);
  if (!style || !validStyles.includes(style)) return errorResult(`Unknown style: ${style}. Available: ${validStyles.join(", ")}`);

  const outDir = join(inputDir, outputSubfolder || "processed");
  const scriptPath = join(dirname(fileURLToPath(import.meta.url)), "photo-processor.py");
  const stylesFilePath = getStylesFilePath();

  if (!existsSync(scriptPath)) return errorResult(`Processing script not found: ${scriptPath}`);

  try {
    const output = execFileSync("python3", [
      scriptPath,
      "--input-dir", inputDir,
      "--output-dir", outDir,
      "--style", style,
      "--styles-file", stylesFilePath,
    ], { timeout: 600_000, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });

    // Parse NDJSON output — last line is the summary
    const lines = output.trim().split("\n").filter(Boolean);
    let summary = { processed: 0, failed: 0, skipped: 0, total: 0, output_dir: outDir };
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.status === "complete") summary = parsed;
      } catch { /* skip non-JSON lines */ }
    }

    // List output files and generate media URLs (with thumbnails for web display)
    const thumbDir = join(outDir, "thumbs");
    const hasThumbDir = existsSync(thumbDir);
    const files: Array<{ name: string; path: string; mediaUrl: string; thumbUrl?: string }> = [];
    if (existsSync(outDir)) {
      for (const f of readdirSync(outDir).sort()) {
        const ext = extname(f).toLowerCase();
        if (ext === ".jpg" || ext === ".jpeg" || ext === ".png") {
          const filePath = join(outDir, f);
          const thumbPath = join(thumbDir, f);
          const thumbUrl = hasThumbDir && existsSync(thumbPath) ? toMediaUrl(thumbPath) : undefined;
          files.push({ name: f, path: filePath, mediaUrl: toMediaUrl(filePath), thumbUrl });
        }
      }
    }

    return ok({
      tool: "enso_media_process_photos",
      success: true,
      style,
      outputDir: outDir,
      processed: summary.processed,
      failed: summary.failed,
      skipped: summary.skipped,
      total: summary.total,
      files,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError("media:process", "Photo processing failed", err, { inputDir, style });
    return errorResult(`Processing failed: ${msg}`);
  }
}

// ── Single Photo Processing ──────────────────────────────────────────────

async function processSinglePhoto(params: ProcessSinglePhotoParams): Promise<AgentToolResult> {
  const { inputFile, style } = params;
  const { ids: validStyles } = loadStyleRegistry();

  if (!inputFile || !existsSync(inputFile)) return errorResult(`Input file not found: ${inputFile}`);
  if (!style || !validStyles.includes(style)) return errorResult(`Unknown style: ${style}. Available: ${validStyles.join(", ")}`);

  const scriptPath = join(dirname(fileURLToPath(import.meta.url)), "photo-processor.py");
  const stylesFilePath = getStylesFilePath();

  if (!existsSync(scriptPath)) return errorResult(`Processing script not found: ${scriptPath}`);

  // Determine output path
  const dir = dirname(inputFile);
  const base = basename(inputFile, extname(inputFile));
  const outDir = join(dir, "processed");
  mkdirSync(outDir, { recursive: true });
  const outputFile = params.outputFile || join(outDir, `${base}_${style}.jpg`);

  // Cap processing size for interactive use — full resolution is too slow.
  // 3000px long edge gives excellent quality while processing ~4x faster.
  const maxSize = params.maxSize || 3000;

  try {
    const output = execFileSync("python3", [
      scriptPath,
      "--input-file", inputFile,
      "--output-file", outputFile,
      "--style", style,
      "--styles-file", stylesFilePath,
      "--preview",
      "--preview-size", String(maxSize),
    ], { timeout: 600_000, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });

    const result = JSON.parse(output.trim().split("\n").filter(Boolean).pop() || "{}");

    if (result.status === "error") {
      return errorResult(result.error || "Processing failed");
    }

    // Generate media URLs
    const thumbDir = join(dirname(outputFile), "thumbs");
    const thumbPath = join(thumbDir, basename(outputFile));
    const thumbUrl = existsSync(thumbPath) ? toMediaUrl(thumbPath) : undefined;

    return ok({
      tool: "enso_media_process_single_photo",
      success: true,
      style,
      inputFile,
      outputFile,
      mediaUrl: toMediaUrl(outputFile),
      thumbUrl,
      width: result.width,
      height: result.height,
      size_mb: result.size_mb,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError("media:process-single", "Single photo processing failed", err, { inputFile, style });
    return errorResult(`Processing failed: ${msg}`);
  }
}

// ── Style Previews ───────────────────────────────────────────────────────

async function generateStylePreviews(params: StylePreviewsParams): Promise<AgentToolResult> {
  const { photoPath } = params;
  const { ids: allStyleIds, infoMap } = loadStyleRegistry();

  if (!photoPath || !existsSync(photoPath)) return errorResult(`Photo not found: ${photoPath}`);

  const scriptPath = join(dirname(fileURLToPath(import.meta.url)), "photo-processor.py");
  const stylesFilePath = getStylesFilePath();

  if (!existsSync(scriptPath)) return errorResult(`Processing script not found: ${scriptPath}`);

  // Which styles to preview
  const styleIds = params.styles?.length ? params.styles.filter(s => allStyleIds.includes(s)) : allStyleIds;

  const previewDir = join(dirname(photoPath), ".style-previews");
  mkdirSync(previewDir, { recursive: true });

  const results: Array<{
    id: string; name: string; subtitle: string; category: string;
    description: string; tags: string[];
    previewUrl: string;
    ui: { bg: string; border: string; text: string };
  }> = [];
  const errors: string[] = [];

  for (const styleId of styleIds) {
    const base = basename(photoPath, extname(photoPath));
    const previewPath = join(previewDir, `${base}_${styleId}.jpg`);

    // Skip if preview already exists
    if (existsSync(previewPath)) {
      const info = infoMap[styleId];
      if (info) {
        results.push({
          id: styleId,
          name: info.name,
          subtitle: info.subtitle,
          category: info.category,
          description: info.description,
          tags: info.tags,
          previewUrl: toMediaUrl(previewPath),
          ui: info.ui,
        });
      }
      continue;
    }

    try {
      execFileSync("python3", [
        scriptPath,
        "--input-file", photoPath,
        "--output-file", previewPath,
        "--style", styleId,
        "--styles-file", stylesFilePath,
        "--preview",
        "--preview-size", "800",
        "--quality", "82",
      ], { timeout: 60_000, encoding: "utf-8", maxBuffer: 5 * 1024 * 1024 });

      const info = infoMap[styleId];
      if (info && existsSync(previewPath)) {
        results.push({
          id: styleId,
          name: info.name,
          subtitle: info.subtitle,
          category: info.category,
          description: info.description,
          tags: info.tags,
          previewUrl: toMediaUrl(previewPath),
          ui: info.ui,
        });
      }
    } catch (err) {
      errors.push(`${styleId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Group results by category
  const byCategory: Record<string, typeof results> = {};
  for (const r of results) {
    const cat = r.category || "Other";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(r);
  }

  return ok({
    tool: "enso_media_style_previews",
    success: true,
    photoPath,
    total: results.length,
    failed: errors.length,
    categories: byCategory,
    results,
    errors: errors.length > 0 ? errors : undefined,
  });
}

// ── List Styles ──────────────────────────────────────────────────────────

async function listStyles(): Promise<AgentToolResult> {
  const { ids, infoMap } = loadStyleRegistry();

  // Group by category
  const byCategory: Record<string, StyleInfo[]> = {};
  for (const id of ids) {
    const info = infoMap[id];
    if (!info) continue;
    const cat = info.category || "Other";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(info);
  }

  return ok({
    tool: "enso_media_list_styles",
    success: true,
    total: ids.length,
    styles: ids.map(id => infoMap[id]).filter(Boolean),
    categories: byCategory,
  });
}

// ── Style Gallery ────────────────────────────────────────────────────────

type StyleGalleryParams = { styleId?: string };

interface RecipeStep { en: string; zh: string }

function describeRecipe(recipe: Record<string, unknown>): RecipeStep[] {
  const steps: RecipeStep[] = [];
  if (!recipe) return steps;

  // Handle layer-based recipes
  if (Array.isArray(recipe.layers)) {
    for (const layer of recipe.layers as Array<Record<string, unknown>>) {
      const effect = layer.effect as string;
      const params = (layer.params || {}) as Record<string, unknown>;
      const blend = layer.blend_mode as string;
      const opacity = layer.opacity as number;
      const mask = layer.mask as Record<string, unknown> | undefined;
      let en = "", zh = "";

      switch (effect) {
        case "curves": en = "Color tone curves shaping the palette"; zh = "色调曲线塑造色彩特性"; break;
        case "monochrome": en = "Black & white conversion"; zh = "黑白转换"; break;
        case "shadow_crush": en = `Deep shadow compression (threshold ${params.threshold || 40})`; zh = `深暗部压缩（阈值 ${params.threshold || 40}）`; break;
        case "highlight_blow": en = `Highlight expansion for dramatic brightness`; zh = `高光扩展增加亮度戏剧性`; break;
        case "solid_color": {
          const c = params.color as number[] || [0,0,0];
          en = `Color overlay (${c.join(",")})`;
          zh = `色彩叠加（${c.join(",")}）`;
          break;
        }
        case "contrast": en = `Contrast enhancement (${Math.round(((params.strength as number) || 0.15) * 100)}%)`; zh = `对比度增强（${Math.round(((params.strength as number) || 0.15) * 100)}%）`; break;
        case "warm_boost": en = "Selective warm tone boost"; zh = "选择性暖色调增强"; break;
        case "saturation": en = `Saturation adjustment (${Math.round(((params.factor as number) || 1) * 100)}%)`; zh = `饱和度调整（${Math.round(((params.factor as number) || 1) * 100)}%）`; break;
        case "black_lift": en = `Lifted blacks (+${params.amount || 0})`; zh = `提升黑位（+${params.amount || 0}）`; break;
        case "highlight_fade": en = "Highlight softening"; zh = "高光柔化"; break;
        case "halation": en = "Film halation bloom"; zh = "胶片光晕扩散"; break;
        case "grain": en = `Film grain (amount ${params.amount || 1})`; zh = `胶片颗粒（量 ${params.amount || 1}）`; break;
        case "vignette": en = `Optical vignette (${Math.round(((params.strength as number) || 0.2) * 100)}%)`; zh = `光学暗角（${Math.round(((params.strength as number) || 0.2) * 100)}%）`; break;
        case "desaturate_blend": en = "Partial desaturation"; zh = "部分去饱和"; break;
        case "green_to_teal": en = "Green to teal shift"; zh = "绿色转青色偏移"; break;
        case "teal_boost": en = "Teal enhancement"; zh = "青色增强"; break;
        case "haze_highlights": en = "Highlight haze/softening"; zh = "高光雾化柔化"; break;
        case "flatten_contrast": en = "Contrast flattening"; zh = "对比度压平"; break;
        case "split_tone": en = "Split toning"; zh = "分离色调"; break;
        case "lab_adjust": {
          const parts: string[] = [];
          if (params.a_shift) parts.push(`a*${(params.a_shift as number) > 0 ? "+" : ""}${params.a_shift}`);
          if (params.b_shift) parts.push(`b*${(params.b_shift as number) > 0 ? "+" : ""}${params.b_shift}`);
          if (params.chroma_scale && params.chroma_scale !== 1) parts.push(`chroma ${Math.round((params.chroma_scale as number) * 100)}%`);
          en = `LAB color space: ${parts.join(", ")}`; zh = `LAB色彩空间调整：${parts.join("、")}`;
          break;
        }
        default: en = effect.replace(/_/g, " "); zh = effect.replace(/_/g, " ");
      }
      if (mask) {
        const maskType = (mask.type as string) || "luminosity";
        if (maskType === "color_range") {
          const hue = mask.target_hue as number || 0;
          const hueName = hue < 30 || hue > 330 ? "red" : hue < 90 ? "yellow/green" : hue < 150 ? "green/cyan" : hue < 210 ? "cyan/blue" : hue < 270 ? "blue/purple" : "purple/red";
          const hueNameZh = hue < 30 || hue > 330 ? "红色" : hue < 90 ? "黄绿色" : hue < 150 ? "绿青色" : hue < 210 ? "青蓝色" : hue < 270 ? "蓝紫色" : "紫红色";
          en += ` [${hueName} range]`;
          zh += `【${hueNameZh}范围】`;
        } else {
          const zone = (mask.zone as string) || "all";
          en += ` [${zone} zone]`;
          zh += `【${zone === "shadows" ? "暗部" : zone === "highlights" ? "亮部" : "中间调"}区域】`;
        }
      }
      if (blend && blend !== "normal") {
        en += ` (${blend} ${Math.round((opacity ?? 1) * 100)}%)`;
        zh += `（${blend} ${Math.round((opacity ?? 1) * 100)}%）`;
      }
      steps.push({ en, zh });
    }
    return steps;
  }

  // Flat recipe
  if (recipe.monochrome) { steps.push({ en: "Black & white conversion with custom channel weights", zh: "使用自定义通道权重转换为黑白" }); }
  if (recipe.curves) {
    const c = recipe.curves as Record<string, unknown>;
    if (c.master) steps.push({ en: "H&D characteristic curve for authentic film density response", zh: "H&D特征曲线模拟胶片密度响应" });
    if (c.r || c.g || c.b) steps.push({ en: "Per-channel RGB tone curves for color character", zh: "逐通道RGB色调曲线塑造色彩特性" });
  }
  if (recipe.lab_adjust) {
    const la = recipe.lab_adjust as Record<string, number>;
    const parts: string[] = [];
    if (la.a_shift) parts.push(`a*${la.a_shift > 0 ? "+" : ""}${la.a_shift}`);
    if (la.b_shift) parts.push(`b*${la.b_shift > 0 ? "+" : ""}${la.b_shift}`);
    if (la.chroma_scale && la.chroma_scale !== 1) parts.push(`chroma ${Math.round(la.chroma_scale * 100)}%`);
    steps.push({ en: `LAB color space: ${parts.join(", ")}`, zh: `LAB色彩空间调整：${parts.join("、")}` });
  }
  if (recipe.split_tone) steps.push({ en: "Split toning with luminosity masks", zh: "分离色调配合明度蒙版" });
  if (recipe.shadow_tint || recipe.midtone_tint || recipe.color_tint) steps.push({ en: "Zone-based color tinting", zh: "区域色彩着色" });
  if (recipe.shadow_crush) steps.push({ en: `Shadow compression (threshold ${(recipe.shadow_crush as Record<string, number>).threshold})`, zh: `暗部压缩（阈值 ${(recipe.shadow_crush as Record<string, number>).threshold}）` });
  if (recipe.highlight_blow) steps.push({ en: "Highlight expansion", zh: "高光扩展" });
  if (recipe.contrast) {
    const ct = recipe.contrast as Record<string, unknown>;
    steps.push({ en: `${ct.type === "double_s_curve" ? "Double S-curve" : "S-curve"} contrast (${Math.round(((ct.strength as number) || 0.15) * 100)}%)`, zh: `${ct.type === "double_s_curve" ? "双S曲线" : "S曲线"}对比度（${Math.round(((ct.strength as number) || 0.15) * 100)}%）` });
  }
  if (recipe.flatten_contrast) steps.push({ en: "Contrast flattening", zh: "对比度压平" });
  if (recipe.desaturate_blend) steps.push({ en: "Partial desaturation blend", zh: "部分去饱和混合" });
  if (recipe.warm_boost) steps.push({ en: "Selective warm tone boost", zh: "选择性暖色调增强" });
  if (recipe.haze_highlights) steps.push({ en: "Highlight haze/softening", zh: "高光雾化柔化" });
  if (typeof recipe.black_lift === "number") steps.push({ en: `Lifted blacks (+${recipe.black_lift})`, zh: `提升黑位（+${recipe.black_lift}）` });
  if (typeof recipe.highlight_fade === "number") steps.push({ en: `Highlight fade (-${recipe.highlight_fade})`, zh: `高光衰减（-${recipe.highlight_fade}）` });
  if (recipe.halation) steps.push({ en: "Film halation bloom around bright areas", zh: "亮部区域胶片光晕扩散" });
  if (recipe.grain) {
    const gr = recipe.grain as Record<string, unknown>;
    const amt = gr.amount || gr.iso_profile || "standard";
    steps.push({ en: `Organic film grain (${amt})`, zh: `有机胶片颗粒（${amt}）` });
  }
  if (recipe.vignette) steps.push({ en: `Optical vignette`, zh: `光学暗角` });
  return steps;
}

let _galleryCache: Record<string, unknown> | null = null;

function loadGalleryData(): Record<string, unknown> {
  if (_galleryCache) return _galleryCache;
  const galleryPath = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "photo_studio", "style-gallery.json");
  try {
    if (existsSync(galleryPath)) {
      _galleryCache = JSON.parse(readFileSync(galleryPath, "utf-8"));
      return _galleryCache!;
    }
  } catch (err) {
    logError("media:gallery", "Failed to load style-gallery.json", err);
  }
  return {};
}

/** Invalidate gallery cache */
export function invalidateGalleryCache(): void { _galleryCache = null; }

async function styleGallery(params: StyleGalleryParams): Promise<AgentToolResult> {
  const { ids, infoMap } = loadStyleRegistry();
  const gallery = loadGalleryData();
  const galleryStyles = (gallery as { styles?: Record<string, unknown> }).styles || {};

  // Load raw styles.json for recipe data
  const stylesPath = getStylesFilePath();
  let rawStyles: Record<string, Record<string, unknown>> = {};
  try {
    const raw = JSON.parse(readFileSync(stylesPath, "utf-8"));
    rawStyles = (raw.styles || {}) as Record<string, Record<string, unknown>>;
  } catch { /* ignore */ }

  // Resolve demo assets directory to check which images actually exist
  const demoDir = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "photo_studio", "demo");

  const styleId = params.styleId?.trim();

  if (styleId) {
    // Detail mode — single style
    const info = infoMap[styleId];
    if (!info) return errorResult(`Style "${styleId}" not found`);

    const galleryEntry = (galleryStyles[styleId] || {}) as Record<string, unknown>;
    const recipe = (rawStyles[styleId]?.recipe || {}) as Record<string, unknown>;
    const pipelineSteps = describeRecipe(recipe);

    // Build gallery image URLs from /demo/gallery/<id>/ — only include images that exist on disk
    const galleryImages = ((galleryEntry.gallery || []) as Array<Record<string, unknown>>)
      .filter(img => img.filename && existsSync(join(demoDir, "gallery", styleId, String(img.filename))))
      .map(img => ({
        url: `/demo/gallery/${styleId}/${img.filename}`,
        caption: img.caption || {},
      }));

    const demoFile = join(demoDir, `${styleId}.jpg`);
    return ok({
      tool: "enso_media_style_gallery",
      mode: "detail",
      styleId,
      ...info,
      bio: galleryEntry.bio || {},
      cultural_significance: galleryEntry.cultural_significance || {},
      technical_description: galleryEntry.technical_description || {},
      gallery: galleryImages,
      notable_works: galleryEntry.notable_works || {},
      fun_facts: galleryEntry.fun_facts || {},
      pipelineSteps,
      demoImageUrl: existsSync(demoFile) ? `/demo/${styleId}.jpg` : "",
    });
  }

  // List mode — all styles grouped by category
  const byCategory: Record<string, Array<StyleInfo & { demoImageUrl: string; hasGallery: boolean }>> = {};
  for (const id of ids) {
    const info = infoMap[id];
    if (!info) continue;
    const cat = info.category || "Other";
    if (!byCategory[cat]) byCategory[cat] = [];
    const demoFile = join(demoDir, `${id}.jpg`);
    byCategory[cat].push({
      ...info,
      demoImageUrl: existsSync(demoFile) ? `/demo/${id}.jpg` : "",
      hasGallery: !!galleryStyles[id],
    });
  }

  return ok({
    tool: "enso_media_style_gallery",
    mode: "list",
    total: ids.length,
    categories: byCategory,
  });
}

// ── Tool Registration ─────────────────────────────────────────────────────

// ── AI Photo Analysis — Style Recommendation ─────────────────────────────

async function analyzePhotoForStyle(photoPath: string): Promise<AgentToolResult> {
  if (!photoPath || !existsSync(photoPath)) {
    console.error(`[enso:analyze] Photo not found: ${photoPath}`);
    return errorResult(`Photo not found: ${photoPath}`);
  }

  const { callGeminiVision } = await import("./ui-generator.js");
  const { getActiveAccount } = await import("./server.js");
  const account = getActiveAccount();
  const apiKey = account?.geminiApiKey;
  if (!apiKey) {
    console.error(`[enso:analyze] No Gemini API key. account=${!!account}`);
    return errorResult("No Gemini API key configured");
  }

  // If photo is too large for the Vision API (>8 MB), create a resized copy
  // callGeminiVision has a 10 MB limit; we resize proactively at 8 MB
  let visionPhotoPath = photoPath;
  const photoSize = statSync(photoPath).size;
  if (photoSize > 8 * 1024 * 1024) {
    const tmpResized = join(dirname(photoPath), `.analyze_${basename(photoPath)}`);
    try {
      const scriptPath = join(dirname(fileURLToPath(import.meta.url)), "photo-processor.py");
      // Use the processor's preview mode just to resize — no style applied
      execFileSync("python3", ["-c", `
from PIL import Image
img = Image.open("${photoPath.replace(/"/g, '\\"')}")
img.thumbnail((3000, 3000), Image.LANCZOS)
img.save("${tmpResized.replace(/"/g, '\\"')}", "JPEG", quality=88)
`], { timeout: 15_000 });
      if (existsSync(tmpResized) && statSync(tmpResized).size < 10 * 1024 * 1024) {
        visionPhotoPath = tmpResized;
      }
    } catch { /* if resize fails, try with original anyway */ }
  }

  // Load all style descriptions for the prompt — now with rich metadata
  const { infoMap } = loadStyleRegistry();
  const styleDescriptions = Object.entries(infoMap)
    .map(([id, info]) => {
      const parts = [`- ${id}: "${info.name}" — ${info.description}`];
      if (info.signature) parts.push(`  | Signature: ${info.signature}`);
      if (info.mood?.length) parts.push(`  | Mood: ${info.mood.join(", ")}`);
      if (info.best_for?.length) parts.push(`  | Best for: ${info.best_for.join(", ")}`);
      if (info.intensity) parts.push(`  | Intensity: ${info.intensity}/5`);
      return parts.join("\n");
    })
    .join("\n");

  const prompt = `You are a professional photo editor and art director with deep knowledge of film photography, cinema, and visual aesthetics. Analyze this photograph in detail, then recommend the single best artistic style from the list below.

Consider the photo's subject, lighting, mood, color palette, and composition when matching to a style. Pay special attention to each style's signature look, mood alignment, and what it's best suited for.

AVAILABLE STYLES:
${styleDescriptions}

Respond with ONLY valid JSON (no markdown, no code fences):
{
  "scene": "A detailed 2-3 sentence description of what's in this photo — subject, setting, lighting, colors, mood, composition, time of day.",
  "recommendedStyle": "style_id_here",
  "styleName": "Human Readable Name",
  "reason": "2-3 sentences explaining specifically WHY this style is the perfect match for THIS photo — reference concrete visual elements in the photo and how the style's signature characteristics will enhance them.",
  "caption": "A compelling, evocative 1-2 sentence caption for the resulting styled photo — written as if describing the final art piece in a gallery. Be poetic but specific to this image.",
  "alternateStyle": "second_best_style_id",
  "alternateStyleName": "Second Best Name",
  "alternateReason": "Brief reason for the alternate choice."
}`;

  try {
    const response = await callGeminiVision({
      imagePath: visionPhotoPath,
      prompt,
      apiKey,
      maxOutputTokens: 4096,
    });

    // Clean up temp resized file if we created one
    if (visionPhotoPath !== photoPath) {
      try { unlinkSync(visionPhotoPath); } catch { /* ignore */ }
    }

    // Strip markdown code fences if present, then parse JSON
    let cleaned = response.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?\s*```\s*$/i, "");

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        return errorResult("Failed to parse AI response");
      }
    }

    // Validate recommended style exists
    const recStyle = String(parsed.recommendedStyle || "");
    if (recStyle && !infoMap[recStyle]) {
      // Try fuzzy match
      const found = Object.keys(infoMap).find(id => id.includes(recStyle) || recStyle.includes(id));
      if (found) parsed.recommendedStyle = found;
    }

    // Enrich result with style metadata from the registry
    const recId = String(parsed.recommendedStyle || "");
    const altId = String(parsed.alternateStyle || "");
    const recInfo = recId ? infoMap[recId] : undefined;
    const altInfo = altId ? infoMap[altId] : undefined;

    // ── Generate preview images for recommended + alternate styles ──
    const scriptPath = join(dirname(fileURLToPath(import.meta.url)), "photo-processor.py");
    const stylesFilePath = getStylesFilePath();
    const previewDir = join(dirname(photoPath), ".style-previews");
    mkdirSync(previewDir, { recursive: true });
    const photoBase = basename(photoPath, extname(photoPath));

    let recommendedPreviewUrl = "";
    let alternatePreviewUrl = "";

    for (const sid of [recId, altId].filter(Boolean)) {
      const previewPath = join(previewDir, `${photoBase}_${sid}.jpg`);
      if (!existsSync(previewPath)) {
        try {
          // Process at full resolution for quality, then resize output to 1600px
          execFileSync("python3", [
            scriptPath, "--input-file", photoPath, "--output-file", previewPath,
            "--style", sid, "--styles-file", stylesFilePath,
            "--output-size", "1600", "--quality", "92",
          ], { timeout: 120_000, encoding: "utf-8", maxBuffer: 5 * 1024 * 1024 });
        } catch { /* preview generation is best-effort */ }
      }
      if (existsSync(previewPath)) {
        if (sid === recId) recommendedPreviewUrl = toMediaUrl(previewPath);
        else alternatePreviewUrl = toMediaUrl(previewPath);
      }
    }

    return jsonResult({
      tool: "enso_media_analyze_photo",
      path: photoPath,
      name: basename(photoPath),
      mediaUrl: toMediaUrl(photoPath),
      scene: parsed.scene || "",
      recommendedStyle: recId,
      styleName: parsed.styleName || recInfo?.name || "",
      reason: parsed.reason || "",
      caption: parsed.caption || "",
      // Rich metadata for primary recommendation
      styleSignature: recInfo?.signature || "",
      styleMood: recInfo?.mood || [],
      styleBestFor: recInfo?.best_for || [],
      styleFamousFor: recInfo?.famous_for || "",
      styleIntensity: recInfo?.intensity || 3,
      styleEra: recInfo?.era || "",
      // Alternate recommendation
      alternateStyle: altId,
      alternateStyleName: parsed.alternateStyleName || altInfo?.name || "",
      alternateReason: parsed.alternateReason || "",
      altStyleSignature: altInfo?.signature || "",
      altStyleMood: altInfo?.mood || [],
      altStyleBestFor: altInfo?.best_for || [],
      // Preview images of recommended styles applied to this photo
      recommendedPreviewUrl,
      alternatePreviewUrl,
    });
  } catch (err) {
    console.error(`[enso:analyze] AI analysis failed:`, err instanceof Error ? err.message : String(err));
    return errorResult(`AI analysis failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function createMediaTools(): AnyAgentTool[] {
  return [
    // ── Original tools (enhanced) ──
    {
      name: "enso_media_scan_library",
      label: "Media Scan Library",
      description: "Scan a directory recursively for media files (photos, videos, documents).",
      parameters: {
        type: "object", additionalProperties: false,
        properties: {
          path: { type: "string", description: "Directory to scan" },
          limit: { type: "number", description: "Max files (default 120, max 600)" },
        },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => scanMedia(params as ScanMediaParams),
    } as AnyAgentTool,
    {
      name: "enso_media_inspect_file",
      label: "Media Inspect File",
      description: "Inspect metadata for one media file including EXIF data.",
      parameters: {
        type: "object", additionalProperties: false,
        properties: { path: { type: "string", description: "File path" } },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => inspectMedia(params as InspectMediaParams),
    } as AnyAgentTool,
    {
      name: "enso_media_group_by_type",
      label: "Media Group By Type",
      description: "Group media files by type (image/video/document).",
      parameters: {
        type: "object", additionalProperties: false,
        properties: {
          path: { type: "string", description: "Directory" },
          limit: { type: "number" },
        },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => groupMediaByType(params as GroupMediaParams),
    } as AnyAgentTool,

    // ── Entry point: Drives ──
    {
      name: "enso_media_list_drives",
      label: "Media List Drives",
      description: "List system drives, quick-access folders, and bookmarked folders as the gallery entry point.",
      parameters: {
        type: "object", additionalProperties: false,
        properties: {},
        required: [],
      },
      execute: async () => listDrives(),
    } as AnyAgentTool,
    {
      name: "enso_media_bookmark_folder",
      label: "Media Bookmark Folder",
      description: "Add or remove a folder from bookmarked locations.",
      parameters: {
        type: "object", additionalProperties: false,
        properties: {
          path: { type: "string", description: "Folder path to bookmark/unbookmark" },
          action: { type: "string", description: "toggle (default), add, or remove" },
        },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => bookmarkFolder(params as BookmarkFolderParams),
    } as AnyAgentTool,

    // ── Phase 1: Browse & View ──
    {
      name: "enso_media_browse_folder",
      label: "Media Browse Folder",
      description: "Browse a single directory: list photos, subfolders, with sorting/filtering. Shows drives if no path given.",
      parameters: {
        type: "object", additionalProperties: false,
        properties: {
          path: { type: "string", description: "Directory path (defaults to ~/Pictures)" },
          filter: { type: "string", description: "Filter: all, image, video (default: all)" },
          sortBy: { type: "string", description: "Sort: name, date, size (default: name)" },
          sortDir: { type: "string", description: "Direction: asc, desc (default: asc)" },
        },
        required: [],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => browseFolder(params as BrowseFolderParams),
    } as AnyAgentTool,
    {
      name: "enso_media_view_photo",
      label: "Media View Photo",
      description: "View a single photo with full EXIF metadata and AI description.",
      parameters: {
        type: "object", additionalProperties: false,
        properties: { path: { type: "string", description: "Photo file path" } },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => viewPhoto(params as ViewPhotoParams),
    } as AnyAgentTool,

    // ── Phase 2: AI Vision ──
    {
      name: "enso_media_describe_photo",
      label: "Media Describe Photo (AI)",
      description: "Use AI vision to describe a photo and extract content tags.",
      parameters: {
        type: "object", additionalProperties: false,
        properties: { path: { type: "string", description: "Image file path" } },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => describePhoto(params as DescribePhotoParams),
    } as AnyAgentTool,
    {
      name: "enso_media_search_photos",
      label: "Media Search Photos",
      description: "Search photos by natural language against AI descriptions and tags.",
      parameters: {
        type: "object", additionalProperties: false,
        properties: {
          path: { type: "string", description: "Directory to search in" },
          query: { type: "string", description: "Natural language search query" },
          limit: { type: "number", description: "Max results (default 30)" },
        },
        required: ["path", "query"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => searchPhotos(params as SearchPhotosParams),
    } as AnyAgentTool,
    {
      name: "enso_media_batch_tag",
      label: "Media Batch Tag (AI)",
      description: "Run AI vision on untagged photos in a directory to generate descriptions and tags.",
      parameters: {
        type: "object", additionalProperties: false,
        properties: {
          path: { type: "string", description: "Directory path" },
          limit: { type: "number", description: "Max photos to tag (default 10, max 20)" },
        },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => batchTag(params as BatchTagParams),
    } as AnyAgentTool,

    // ── Phase 3: Favorites, Collections, Ratings ──
    {
      name: "enso_media_toggle_favorite",
      label: "Media Toggle Favorite",
      description: "Toggle favorite status on a photo.",
      parameters: {
        type: "object", additionalProperties: false,
        properties: {
          path: { type: "string", description: "Photo file path" },
          favorite: { type: "boolean", description: "Set true/false, or omit to toggle" },
        },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => toggleFavorite(params as ToggleFavoriteParams),
    } as AnyAgentTool,
    {
      name: "enso_media_manage_collection",
      label: "Media Manage Collection",
      description: "Create, manage, and browse photo collections/albums.",
      parameters: {
        type: "object", additionalProperties: false,
        properties: {
          action: { type: "string", description: "Action: create, add, remove, list, view, rename, delete" },
          collectionName: { type: "string", description: "Collection name" },
          photoPath: { type: "string", description: "Photo path (for add/remove)" },
          newName: { type: "string", description: "New name (for rename)" },
        },
        required: ["action"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => manageCollection(params as ManageCollectionParams),
    } as AnyAgentTool,
    {
      name: "enso_media_rate_photo",
      label: "Media Rate Photo",
      description: "Set a 1-5 star rating on a photo (0 to clear).",
      parameters: {
        type: "object", additionalProperties: false,
        properties: {
          path: { type: "string", description: "Photo file path" },
          rating: { type: "number", description: "Rating 0-5 (0 clears)" },
        },
        required: ["path", "rating"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => ratePhoto(params as RatePhotoParams),
    } as AnyAgentTool,
    {
      name: "enso_media_process_photos",
      label: "Process Photos (Batch)",
      description: `Apply a photo style to all photos in a directory. 28 styles across Film Stocks, Cinematic, Photographers, and Trending categories. Supports JPEG, PNG, TIFF, and RAW files. Outputs processed JPEGs to a subfolder.`,
      parameters: {
        type: "object", additionalProperties: false,
        properties: {
          inputDir: { type: "string", description: "Source directory containing photos" },
          style: { type: "string", description: "Style ID to apply (use enso_media_list_styles to see all)" },
          outputSubfolder: { type: "string", description: "Output subfolder name (default: processed)" },
        },
        required: ["inputDir", "style"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => processPhotos(params as ProcessPhotosParams),
    } as AnyAgentTool,
    {
      name: "enso_media_process_single_photo",
      label: "Process Single Photo",
      description: "Apply a photo style to a single image file. Returns the processed image URL.",
      parameters: {
        type: "object", additionalProperties: false,
        properties: {
          inputFile: { type: "string", description: "Path to the source photo" },
          outputFile: { type: "string", description: "Output path (optional — auto-generated if omitted)" },
          style: { type: "string", description: "Style ID to apply" },
        },
        required: ["inputFile", "style"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => processSinglePhoto(params as ProcessSinglePhotoParams),
    } as AnyAgentTool,
    {
      name: "enso_media_style_previews",
      label: "Generate Style Previews",
      description: "Generate 400px preview thumbnails of a photo in multiple styles. Returns URLs for each style preview, grouped by category.",
      parameters: {
        type: "object", additionalProperties: false,
        properties: {
          photoPath: { type: "string", description: "Path to the source photo" },
          styles: { type: "array", items: { type: "string" }, description: "Optional: specific style IDs to preview (default: all)" },
        },
        required: ["photoPath"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => generateStylePreviews(params as StylePreviewsParams),
    } as AnyAgentTool,
    {
      name: "enso_media_list_styles",
      label: "List Photo Styles",
      description: "List all available photo processing styles with names, descriptions, and categories.",
      parameters: {
        type: "object", additionalProperties: false,
        properties: {},
        required: [],
      },
      execute: async () => listStyles(),
    } as AnyAgentTool,
    {
      name: "enso_media_analyze_photo",
      label: "AI Photo Analysis",
      description: "Analyze a photo using AI vision to determine its content, recommend the best artistic style, and generate a creative caption.",
      parameters: {
        type: "object", additionalProperties: false,
        properties: {
          path: { type: "string", description: "Path to the photo to analyze" },
        },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => analyzePhotoForStyle(params.path as string),
    } as AnyAgentTool,
    {
      name: "enso_media_style_gallery",
      label: "Style Gallery",
      description: "Browse the Style Gallery with rich bilingual descriptions, reference image galleries, and technical processing details for all styles.",
      parameters: {
        type: "object", additionalProperties: false,
        properties: {
          styleId: { type: "string", description: "Style ID for detail view (omit for gallery listing)" },
        },
        required: [],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => styleGallery(params as StyleGalleryParams),
    } as AnyAgentTool,
  ];
}

export function registerMediaTools(api: OpenClawPluginApi): void {
  for (const tool of createMediaTools()) {
    api.registerTool(tool);
  }
}
