import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { existsSync, lstatSync, readdirSync } from "fs";
import { basename, extname, isAbsolute, join, normalize, resolve } from "path";
import { homedir } from "os";

type AgentToolResult = { content: Array<{ type: string; text?: string }> };

type ScanMediaParams = {
  path: string;
  limit?: number;
};

type InspectMediaParams = {
  path: string;
};

type GroupMediaParams = {
  path: string;
  limit?: number;
};

const MEDIA_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp4", ".webm", ".mov", ".m4v", ".pdf"]);
const DEFAULT_MEDIA_LIMIT = 120;

function jsonResult(data: unknown): AgentToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string): AgentToolResult {
  return { content: [{ type: "text", text: `[ERROR] ${message}` }] };
}

function safeResolvePath(inputPath: string): { ok: true; path: string } | { ok: false; error: string } {
  const expanded = inputPath.startsWith("~")
    ? join(homedir(), inputPath.slice(1))
    : inputPath;
  const candidate = isAbsolute(expanded)
    ? expanded
    : join(process.cwd(), expanded);
  const resolved = normalize(resolve(candidate));
  const roots = [resolve(homedir()), resolve(process.cwd())];
  const allowed = roots.some((root) => resolved === root || resolved.startsWith(`${root}/`));
  if (!allowed) return { ok: false, error: `path is outside allowed roots: ${resolved}` };
  return { ok: true, path: resolved };
}

function mediaTypeForExt(ext: string): "image" | "video" | "document" | "other" {
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) return "image";
  if ([".mp4", ".webm", ".mov", ".m4v"].includes(ext)) return "video";
  if ([".pdf"].includes(ext)) return "document";
  return "other";
}

function scanMedia(params: ScanMediaParams): AgentToolResult {
  const safe = safeResolvePath(params.path);
  if (!safe.ok) return errorResult(safe.error);
  if (!existsSync(safe.path)) return errorResult(`path does not exist: ${safe.path}`);
  if (!lstatSync(safe.path).isDirectory()) return errorResult(`path is not a directory: ${safe.path}`);

  const limit = Math.max(1, Math.min(600, params.limit ?? DEFAULT_MEDIA_LIMIT));
  const items: Array<{ name: string; path: string; ext: string; type: "image" | "video" | "document" | "other"; size: number }> = [];

  const walk = (dir: string, depth: number) => {
    if (items.length >= limit || depth > 4) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (items.length >= limit) break;
      if (entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (!MEDIA_EXTS.has(ext)) continue;
        const stat = lstatSync(full);
        items.push({
          name: entry.name,
          path: full,
          ext,
          type: mediaTypeForExt(ext),
          size: stat.size,
        });
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
  const ext = extname(safe.path).toLowerCase();
  return jsonResult({
    tool: "enso_media_inspect_file",
    name: basename(safe.path),
    path: safe.path,
    ext,
    type: mediaTypeForExt(ext),
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
  });
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

export function createMediaTools(): AnyAgentTool[] {
  return [
    {
      name: "enso_media_scan_library",
      label: "Media Scan Library",
      description: "Scan a directory recursively for media files.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string" },
          limit: { type: "number" },
        },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => scanMedia(params as ScanMediaParams),
    } as AnyAgentTool,
    {
      name: "enso_media_inspect_file",
      label: "Media Inspect File",
      description: "Inspect metadata for one media file.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string" },
        },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => inspectMedia(params as InspectMediaParams),
    } as AnyAgentTool,
    {
      name: "enso_media_group_by_type",
      label: "Media Group By Type",
      description: "Group discovered media files by type.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string" },
          limit: { type: "number" },
        },
        required: ["path"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) => groupMediaByType(params as GroupMediaParams),
    } as AnyAgentTool,
  ];
}

export function registerMediaTools(api: OpenClawPluginApi): void {
  for (const tool of createMediaTools()) {
    api.registerTool(tool);
  }
}
