import { cardRegistry } from "./registry";
import ChatCard from "./ChatCard";
import UserBubbleCard from "./UserBubbleCard";
import TerminalCard from "./TerminalCard";
import ShellCard from "./ShellCard";
import DynamicUICard from "./DynamicUICard";
import OrchestrationCard from "./OrchestrationCard";
import EvolutionHistoryCard from "./EvolutionHistoryCard";
import ProjectsCard from "./ProjectsCard";
import { ThinkingCard } from "../components/ThinkingCard";

// Register built-in card types (order matters — first match wins in resolve)

cardRegistry.register({
  type: "projects",
  renderer: ProjectsCard,
  match: () => false,
});

cardRegistry.register({
  type: "evolution-history",
  renderer: EvolutionHistoryCard,
  match: () => false,
});

cardRegistry.register({
  type: "orchestration",
  renderer: OrchestrationCard,
  match: (msg) => Boolean(msg.orchestrationPlan || msg.orchestrationProgress),
});

cardRegistry.register({
  type: "shell",
  renderer: ShellCard,
  match: (msg) => msg.toolMeta?.toolId === "shell",
});

cardRegistry.register({
  type: "terminal",
  renderer: TerminalCard,
  match: (msg) => msg.toolMeta?.toolId === "claude-code",
});

cardRegistry.register({
  type: "dynamic-ui",
  renderer: DynamicUICard,
  match: (msg) => Boolean(msg.generatedUI),
});

cardRegistry.register({
  type: "thinking",
  renderer: ThinkingCard,
  match: () => false, // client-only optimistic card
});

cardRegistry.register({
  type: "user-bubble",
  renderer: UserBubbleCard,
  match: () => false, // resolved by role, not by match
});

cardRegistry.register({
  type: "chat",
  renderer: ChatCard,
  match: () => true, // default fallback
});

export { cardRegistry } from "./registry";
export type { Card, CardRendererProps, CardTypeRegistration } from "./types";
