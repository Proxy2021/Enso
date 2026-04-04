import { logAction } from "./action-log.js";

// ── Types ──

export type AppExperience = "card" | "terminal";

export interface AppEntry {
  appId: string;
  primaryTool: string;
  actions: string[];
  signatureId: string;
  description: string;
  experience?: AppExperience; // default: "card"
}

// ── Catalog ──

export const APP_CATALOG: AppEntry[] = [
  {
    appId: "alpharank",
    primaryTool: "alpharank_latest_predictions",
    actions: [
      "latest_predictions", "predict", "market_regime", "daily",
      "status", "backtest",
      "portfolio_performance", "portfolio_list", "portfolio_checkin",
      "portfolio_create", "portfolio_simulate", "portfolio_audit",
      "predictions", "daily_routine", // backward-compat for template onAction() names
    ],
    signatureId: "ranked_predictions_table",
    description: "Stock market analysis: ranked stock predictions, market regime, portfolio management, daily pipeline, backtesting",
  },
  {
    appId: "filesystem",
    primaryTool: "enso_fs_list_drives",
    actions: ["list_drives", "list_directory", "read_text_file", "open_file", "open_external", "stat_path", "search_paths", "create_directory", "rename_path", "delete_path", "move_path"],
    signatureId: "directory_listing",
    description: "File manager: browse directories, read files, search, create/rename/delete/move files and folders",
  },
  {
    appId: "web_browser",
    primaryTool: "enso_browser_open",
    actions: ["open", "navigate", "click", "scroll", "back", "type"],
    signatureId: "remote_browser",
    description: "Remote browser: browse the web, view bookmarks, click, scroll, type — all from within an Enso card",
  },
  {
    appId: "researcher",
    primaryTool: "enso_researcher_search",
    actions: ["search", "deep_dive", "compare", "follow_up", "send_report", "delete_history", "clear_all_history", "deep_research"],
    signatureId: "research_board",
    description: "Research any topic in any language: deep multi-angle web research with AI synthesis, multimedia, podcast generation, gap analysis, contradiction detection, auto-escalating deep research via Claude Code, and email reports",
  },
  {
    appId: "clawhub",
    primaryTool: "enso_clawhub_browse",
    actions: ["browse", "search", "inspect", "installed", "install", "uninstall"],
    signatureId: "clawhub_store",
    description: "ClawHub skill store: browse, search, install and manage OpenClaw skills",
  },
  {
    appId: "media_gallery",
    primaryTool: "enso_media_gallery_browse",
    actions: ["browse", "view", "favorite", "rate", "collection", "search", "inspect", "stats"],
    signatureId: "media_gallery_view",
    description: "Media gallery: browse, search & organize photos and videos with filters, ratings, favorites, collections, and EXIF metadata",
  },
  {
    appId: "photo_studio",
    primaryTool: "enso_photo_studio_import_photos",
    actions: [
      "import_photos", "preview_styles", "apply_style", "batch_process",
      "list_styles", "manage_collection", "compare_versions", "photobook",
      "upload_photos", "analyze_photo", "adjust", "style_gallery",
      "export_photos", "history",
    ],
    signatureId: "photo_studio_view",
    description: "Photo studio: import, edit, apply artistic styles (56 film & creative looks), batch process, AI analysis, adjust, compare, and export photos",
  },
  {
    appId: "video_studio",
    primaryTool: "enso_video_studio_view",
    actions: ["view", "generate", "animate", "craft_prompt", "script_to_scenes", "gallery", "history", "short_video", "batch_generate", "style_gallery", "photo_story"],
    signatureId: "video_studio_view",
    description: "AI video generation studio: create cinematic videos from text prompts, animate still images, craft optimized prompts, browse video gallery",
  },
  // ── Email ──
  {
    appId: "email",
    primaryTool: "enso_email_send",
    actions: ["send"],
    signatureId: "email_send",
    description: "Email: send messages via Gmail SMTP with attachments, CC/BCC, HTML support",
  },
  // ── Terminal System Apps ──
  {
    appId: "claude_code",
    primaryTool: "claude-code",
    actions: ["code", "resume", "compact"],
    signatureId: "terminal",
    description: "AI coding assistant: write code, fix bugs, build projects",
    experience: "terminal",
  },
  {
    appId: "shell",
    primaryTool: "shell",
    actions: ["create"],
    signatureId: "terminal",
    description: "System terminal: run commands, manage processes",
    experience: "terminal",
  },
];

// ── Lookups ──

export function getApp(appId: string): AppEntry | undefined {
  return APP_CATALOG.find((item) => item.appId === appId);
}

/** Add a new app at runtime (from Tool Factory / Build App). No-op if appId already exists. */
export function registerApp(app: AppEntry): void {
  if (APP_CATALOG.some((c) => c.appId === app.appId)) return;
  APP_CATALOG.push(app);
  logAction({ ts: Date.now(), type: "action", category: "catalog", message: `registered app "${app.appId}"` });
}

/** Remove a dynamically added app by appId. Returns true if removed. */
export function unregisterApp(appId: string): boolean {
  const idx = APP_CATALOG.findIndex((c) => c.appId === appId);
  if (idx === -1) return false;
  APP_CATALOG.splice(idx, 1);
  logAction({ ts: Date.now(), type: "action", category: "catalog", message: `removed app "${appId}"` });
  return true;
}

/** System apps — core platform capabilities that can't be removed. */
const SYSTEM_APPS = new Set(["filesystem", "media", "screen", "browser", "claude_code", "shell", "media_gallery", "photo_studio"]);

/** List all non-system apps (user-created + shipped). */
export function getUserApps(): AppEntry[] {
  return APP_CATALOG.filter((c) => !SYSTEM_APPS.has(c.appId));
}

/** Check whether an appId is a system app. */
export function isSystemApp(appId: string): boolean {
  return SYSTEM_APPS.has(appId);
}

