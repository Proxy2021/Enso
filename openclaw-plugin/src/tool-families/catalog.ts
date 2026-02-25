export interface ToolFamilyCapability {
  toolFamily: string;
  fallbackToolName: string;
  actionSuffixes: string[];
  signatureId: string;
  description: string;
}

export const TOOL_FAMILY_CAPABILITIES: ToolFamilyCapability[] = [
  {
    toolFamily: "alpharank",
    fallbackToolName: "alpharank_latest_predictions",
    actionSuffixes: [
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
    toolFamily: "filesystem",
    fallbackToolName: "enso_fs_list_drives",
    actionSuffixes: ["list_drives", "list_directory", "read_text_file", "open_file", "stat_path", "search_paths", "create_directory", "rename_path", "delete_path", "move_path"],
    signatureId: "directory_listing",
    description: "File manager: browse directories, read files, search, create/rename/delete/move files and folders",
  },
  {
    toolFamily: "code_workspace",
    fallbackToolName: "enso_ws_list_repos",
    actionSuffixes: ["list_repos", "detect_dev_tools", "project_overview"],
    signatureId: "workspace_inventory",
    description: "Software projects and repositories: listing repos, project structure, language/framework detection, dev tools",
  },
  {
    toolFamily: "multimedia",
    fallbackToolName: "enso_media_scan_library",
    actionSuffixes: ["scan_library", "inspect_file", "group_by_type"],
    signatureId: "media_gallery",
    description: "Photos, videos, and media files: scanning media libraries, inspecting media metadata, grouping by type",
  },
  {
    toolFamily: "travel_planner",
    fallbackToolName: "enso_travel_plan_trip",
    actionSuffixes: ["plan_trip", "optimize_day", "budget_breakdown"],
    signatureId: "itinerary_board",
    description: "Travel planning: trip itineraries, day-by-day plans, destinations, activities, budget breakdowns",
  },
  {
    toolFamily: "meal_planner",
    fallbackToolName: "enso_meal_plan_week",
    actionSuffixes: ["plan_week", "grocery_list", "swap_meal"],
    signatureId: "weekly_meal_plan",
    description: "Meal planning: weekly meal plans, dietary preferences, grocery lists, recipe suggestions, nutrition",
  },
];

export function getCapabilityForFamily(toolFamily: string): ToolFamilyCapability | undefined {
  return TOOL_FAMILY_CAPABILITIES.find((item) => item.toolFamily === toolFamily);
}

/** Add a new capability at runtime (from Tool Factory). No-op if toolFamily already exists. */
export function addCapability(capability: ToolFamilyCapability): void {
  if (TOOL_FAMILY_CAPABILITIES.some((c) => c.toolFamily === capability.toolFamily)) return;
  TOOL_FAMILY_CAPABILITIES.push(capability);
  console.log(`[enso:catalog] registered new capability "${capability.toolFamily}"`);
}

/** Remove a dynamically added capability by toolFamily. Returns true if removed. */
export function removeCapability(toolFamily: string): boolean {
  const idx = TOOL_FAMILY_CAPABILITIES.findIndex((c) => c.toolFamily === toolFamily);
  if (idx === -1) return false;
  TOOL_FAMILY_CAPABILITIES.splice(idx, 1);
  console.log(`[enso:catalog] removed capability "${toolFamily}"`);
  return true;
}

/** List all dynamically added tool families (not the built-in ones). */
const BUILTIN_FAMILIES = new Set(["alpharank", "filesystem", "code_workspace", "multimedia", "travel_planner", "meal_planner"]);

export function getDynamicCapabilities(): ToolFamilyCapability[] {
  return TOOL_FAMILY_CAPABILITIES.filter((c) => !BUILTIN_FAMILIES.has(c.toolFamily));
}


