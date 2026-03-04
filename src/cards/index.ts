import { cardRegistry } from "./registry";
import ChatCard from "./ChatCard";
import UserBubbleCard from "./UserBubbleCard";
import TerminalCard from "./TerminalCard";
import DynamicUICard from "./DynamicUICard";

// Register built-in card types (order matters — first match wins in resolve)

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
