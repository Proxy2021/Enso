export interface SlashCommand {
  command: string;
  label: string;
  descKey: string;
  icon?: string;
  category: "build" | "research" | "system" | "history";
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // Build
  { command: "/code", label: "/code", descKey: "slash.code", icon: "\uD83D\uDCBB", category: "build" },
  { command: "/code ", label: "/code <prompt>", descKey: "slash.codePrompt", icon: "\uD83D\uDCBB", category: "build" },
  { command: "/orchestrate", label: "/orchestrate", descKey: "slash.orchestrate", icon: "\u26A1", category: "build" },
  { command: "/evolve", label: "/evolve", descKey: "slash.evolve", icon: "\uD83E\uDDEC", category: "build" },
  // Research
  { command: "/research ", label: "/research <topic>", descKey: "slash.research", icon: "\uD83D\uDD0D", category: "research" },
  { command: "/discover", label: "/discover", descKey: "slash.discover", icon: "\uD83D\uDD2C", category: "research" },
  // System
  { command: "/projects", label: "/projects", descKey: "slash.projects", icon: "\uD83D\uDCC1", category: "system" },
  { command: "/shell", label: "/shell", descKey: "slash.shell", icon: "\uD83D\uDDA5\uFE0F", category: "system" },
  { command: "/tool enso", label: "/tool enso", descKey: "slash.toolEnso", icon: "\uD83D\uDD27", category: "system" },
  { command: "/delete-apps", label: "/delete-apps", descKey: "slash.deleteApps", icon: "\uD83D\uDDD1\uFE0F", category: "system" },
  { command: "/help", label: "/help", descKey: "slash.help", icon: "\u2753", category: "system" },
  // History
  { command: "/evolution-history", label: "/evolution-history", descKey: "slash.evolutionHistory", icon: "\uD83D\uDCCA", category: "history" },
  { command: "/discovery-history", label: "/discovery-history", descKey: "slash.discoveryHistory", icon: "\uD83D\uDD0D", category: "history" },
];

export const CATEGORY_LABELS: Record<SlashCommand["category"], string> = {
  build: "Build",
  research: "Research",
  system: "System",
  history: "History",
};
