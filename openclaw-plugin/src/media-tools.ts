import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { existsSync, lstatSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { basename, dirname, extname, isAbsolute, join, normalize, resolve } from "path";
import { homedir, platform } from "os";
import { execSync } from "child_process";
import { toMediaUrl } from "./server.js";
import { parseImageMeta, type ExifData } from "./exif-parser.js";

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

// ── Constants ─────────────────────────────────────────────────────────────

const MEDIA_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp4", ".webm", ".mov", ".m4v", ".pdf"]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const DEFAULT_MEDIA_LIMIT = 120;

// ── Helpers ───────────────────────────────────────────────────────────────

function jsonResult(data: unknown): AgentToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string): AgentToolResult {
  return { content: [{ type: "text", text: `[ERROR] ${message}` }] };
}

/** Resolve a user-provided path. Aligned with filesystem-tools.ts — no root restriction. */
function safeResolvePath(inputPath: string): { ok: true; path: string } | { ok: false; error: string } {
  if (!inputPath || !inputPath.trim()) return { ok: false, error: "path is required" };
  const expanded = inputPath.startsWith("~")
    ? join(homedir(), inputPath.slice(1))
    : inputPath;
  const candidate = isAbsolute(expanded)
    ? expanded
    : join(process.cwd(), expanded);
  return { ok: true, path: normalize(resolve(candidate)) };
}

function mediaTypeForExt(ext: string): "image" | "video" | "document" | "other" {
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) return "image";
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
    console.error("[enso:media] store write error:", e);
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
  // No path → show drives as starting point
  if (!inputPath) return listDrives();
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

// ── Tool Registration ─────────────────────────────────────────────────────

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
  ];
}

export function registerMediaTools(api: OpenClawPluginApi): void {
  for (const tool of createMediaTools()) {
    api.registerTool(tool);
  }
}
