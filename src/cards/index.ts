import { lazy } from "react";
import { TOOL_ID_CLAUDE_CODE } from "../lib/constants";
import { cardRegistry } from "./registry";
import ChatCard from "./ChatCard";
import UserBubbleCard from "./UserBubbleCard";
import { ThinkingCard } from "../components/ThinkingCard";

const TerminalCard = lazy(() => import("./TerminalCard"));
const ShellCard = lazy(() => import("./ShellCard"));
const DynamicUICard = lazy(() => import("./DynamicUICard"));
const OrchestrationCard = lazy(() => import("./OrchestrationCard"));
const EvolutionHistoryCard = lazy(() => import("./EvolutionHistoryCard"));
const DiscoveryHistoryCard = lazy(() => import("./DiscoveryHistoryCard"));
const ProjectsCard = lazy(() => import("./ProjectsCard"));
const SessionDashboardCard = lazy(() => import("./SessionDashboardCard"));
const TodoListCard = lazy(() => import("./TodoListCard"));

// Register built-in card types (order matters — first match wins in resolve)

cardRegistry.register({
  type: "todo-list",
  renderer: TodoListCard,
  match: (msg) => !!(msg.data && typeof msg.data === "object" && "todoList" in (msg.data as Record<string, unknown>)),
});

cardRegistry.register({
  type: "session-dashboard",
  renderer: SessionDashboardCard,
  match: () => false,
});

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
  type: "discovery-history",
  renderer: DiscoveryHistoryCard,
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
  match: (msg) => msg.toolMeta?.toolId === TOOL_ID_CLAUDE_CODE,
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
