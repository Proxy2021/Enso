import { useChatStore } from "../store/chat";
import { cardRegistry } from "../cards";
import type { Card } from "../cards/types";

interface CardContainerProps {
  card: Card;
  isActive: boolean;
}

const TYPE_ICONS: Record<string, string> = {
  chat: "\uD83D\uDCAC",
  terminal: "\uD83D\uDCBB",
  "dynamic-ui": "\u2728",
  "user-bubble": "\uD83D\uDC64",
};

function truncate(text: string | undefined, max: number): string {
  if (!text) return "";
  const oneLine = text.replace(/\n/g, " ").trim();
  return oneLine.length > max ? oneLine.slice(0, max) + "..." : oneLine;
}

/** Format a snake_case or camelCase action name into readable text. */
function formatAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function CardLoadingOverlay({ action }: { action?: string }) {
  const label = action ? formatAction(action) : "Updating";
  return (
    <div className="absolute inset-0 z-10 rounded-xl pointer-events-none overflow-hidden">
      {/* Dim overlay */}
      <div className="absolute inset-0 bg-gray-900/40" />
      {/* Shimmer sweep */}
      <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
      {/* Action indicator */}
      <div className="absolute bottom-2 right-3 flex items-center gap-2 bg-gray-800/95 rounded-full pl-2.5 pr-3 py-1.5 border border-gray-600/50 shadow-lg">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
        </span>
        <span className="text-[11px] text-gray-300 font-medium">{label}</span>
      </div>
    </div>
  );
}

export default function CardContainer({ card, isActive }: CardContainerProps) {
  const collapseCard = useChatStore((s) => s.collapseCard);
  const expandCard = useChatStore((s) => s.expandCard);
  const sendCardAction = useChatStore((s) => s.sendCardAction);

  const isCollapsed = card.display === "collapsed";
  const registration = cardRegistry.get(card.type);

  if (!registration) {
    return (
      <div className="mb-3 text-gray-500 text-sm">
        Unknown card type: {card.type}
      </div>
    );
  }

  const Renderer = registration.renderer;
  const icon = TYPE_ICONS[card.type] ?? "\uD83D\uDCCB";

  // User bubbles don't get the collapse wrapper
  if (card.type === "user-bubble") {
    return (
      <Renderer
        card={card}
        isActive={isActive}
        onAction={(action, payload) => sendCardAction(card.id, action, payload)}
      />
    );
  }

  const isLoading = card.status === "streaming";

  return (
    <div className="relative group">
      {/* Collapse/expand toggle */}
      {card.status === "complete" && (
        <button
          onClick={() => (isCollapsed ? expandCard(card.id) : collapseCard(card.id))}
          className="absolute -left-6 top-1 opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-gray-300 text-xs z-10"
          title={isCollapsed ? "Expand" : "Collapse"}
        >
          {isCollapsed ? "\u25B6" : "\u25BC"}
        </button>
      )}

      {isCollapsed ? (
        <button
          onClick={() => expandCard(card.id)}
          className="w-full text-left mb-3 px-3 py-1.5 bg-gray-800/50 border border-gray-800 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-300 transition-colors flex items-center gap-2"
        >
          <span>{icon}</span>
          <span className="truncate">{truncate(card.text, 80)}</span>
        </button>
      ) : (
        <div className="relative">
          <Renderer
            card={card}
            isActive={isActive}
            onAction={(action, payload) => sendCardAction(card.id, action, payload)}
          />
          {isLoading && <CardLoadingOverlay action={card.pendingAction} />}
        </div>
      )}
    </div>
  );
}
