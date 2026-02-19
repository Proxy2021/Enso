import { useChatStore } from "../store/chat";
import { cardRegistry } from "../cards";
import type { Card } from "../cards/types";
import { useMemo, useState } from "react";
import type { AgentStep } from "@shared/types";

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

function formatAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function CardLoadingOverlay({ action }: { action?: string }) {
  const label = action ? formatAction(action) : "Updating";
  return (
    <div className="absolute inset-0 z-10 rounded-2xl pointer-events-auto overflow-hidden cursor-wait">
      <div className="absolute inset-0 bg-gray-950/45" />
      <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
      <div className="absolute bottom-2 right-3 flex items-center gap-2 bg-gray-900/95 rounded-full pl-2.5 pr-3 py-1.5 border border-gray-600/60 shadow-lg">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
        </span>
        <span className="text-[11px] text-gray-300 font-medium">{label}</span>
      </div>
    </div>
  );
}

function EnhanceButton({ card }: { card: Card }) {
  const enhanceCard = useChatStore((s) => s.enhanceCard);
  const status = card.enhanceStatus;

  if (status === "loading") {
    return (
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-violet-500/40 bg-violet-500/10 text-violet-300">
        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-[10px]">Enhancing</span>
      </div>
    );
  }

  if (status === "unavailable") {
    return (
      <div
        className="text-[10px] px-2 py-0.5 rounded-full border border-gray-600/30 bg-gray-700/10 text-gray-500 cursor-default"
        title="No app experience available for this content"
      >
        No app
      </div>
    );
  }

  if (status === "ready") return null;

  return (
    <button
      onClick={() => enhanceCard(card.id)}
      className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors"
      title="Turn this response into an interactive app"
    >
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
      </svg>
      App
    </button>
  );
}

function AgentSteps({ steps }: { steps: AgentStep[] }) {
  const [expanded, setExpanded] = useState(false);

  if (steps.length < 2) return null;

  return (
    <div className="px-3 pb-2">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors w-full border-t border-gray-700/50 pt-2"
      >
        <svg
          className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span>{steps.length} agent steps</span>
      </button>
      {expanded && (
        <div className="mt-2 space-y-2">
          {steps.map((step, i) => (
            <div
              key={step.seq}
              className="rounded-lg border border-gray-700/50 bg-gray-950/40 px-3 py-2"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-medium text-gray-500">
                  Step {i + 1}
                </span>
                {i === steps.length - 1 && (
                  <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                    Final
                  </span>
                )}
              </div>
              <pre className="text-xs text-gray-400 whitespace-pre-wrap break-words leading-relaxed max-h-48 overflow-y-auto">
                {step.text}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ViewToggle({ card }: { card: Card }) {
  const toggleCardView = useChatStore((s) => s.toggleCardView);
  const viewMode = card.viewMode ?? "original";

  return (
    <div className="inline-flex rounded-full border border-gray-600/50 bg-gray-800/60 p-0.5">
      <button
        onClick={() => toggleCardView(card.id, "original")}
        className={`text-[10px] px-2.5 py-0.5 rounded-full transition-colors ${
          viewMode === "original"
            ? "bg-gray-600/60 text-gray-200"
            : "text-gray-400 hover:text-gray-300"
        }`}
      >
        Original
      </button>
      <button
        onClick={() => toggleCardView(card.id, "app")}
        className={`text-[10px] px-2.5 py-0.5 rounded-full transition-colors ${
          viewMode === "app"
            ? "bg-violet-500/30 text-violet-200 border-violet-500/40"
            : "text-gray-400 hover:text-gray-300"
        }`}
      >
        App
      </button>
    </div>
  );
}

export default function CardContainer({ card, isActive }: CardContainerProps) {
  const collapseCard = useChatStore((s) => s.collapseCard);
  const expandCard = useChatStore((s) => s.expandCard);
  const sendCardAction = useChatStore((s) => s.sendCardAction);
  const channelMode = useChatStore((s) => s.channelMode);
  const [confirmAction, setConfirmAction] = useState<{ action: string; payload?: unknown } | null>(null);

  const isCollapsed = card.display === "collapsed";
  const isAppView = card.viewMode === "app" && card.enhanceStatus === "ready" && card.appGeneratedUI;
  const isGeneralSmartCard = card.type === "dynamic-ui" && card.cardMode?.toolFamily === "general";
  const canEnhance = card.role === "assistant" && card.status === "complete"
    && (card.type === "chat" || isGeneralSmartCard);

  const effectiveType = isAppView ? "dynamic-ui" : card.type;
  const registration = cardRegistry.get(effectiveType);

  // Build a synthetic card for app view rendering
  const renderCard = useMemo<Card>(() => {
    if (!isAppView) return card;
    return {
      ...card,
      data: card.appData,
      generatedUI: card.appGeneratedUI,
      cardMode: card.appCardMode,
    };
  }, [card, isAppView]);

  if (!registration) {
    return (
      <div className="mb-3 text-gray-500 text-sm">
        Unknown card type: {card.type}
      </div>
    );
  }

  const Renderer = registration.renderer;
  const icon = TYPE_ICONS[effectiveType] ?? "\uD83D\uDCCB";

  if (card.type === "user-bubble") {
    return (
      <Renderer
        card={card}
        isActive={isActive}
        onAction={(action, payload) => sendCardAction(card.id, action, payload)}
      />
    );
  }

  const isLoading = card.status === "streaming" || card.enhanceStatus === "loading";
  const loadingLabel = card.enhanceStatus === "loading"
    ? "Enhancing to app"
    : card.operation?.label ?? card.pendingAction;
  const statusLabel = card.status === "streaming" ? "live" : card.status === "error" ? "error" : "ready";
  const statusTone =
    card.status === "streaming"
      ? "text-sky-300 border-sky-500/35 bg-sky-500/10"
      : card.status === "error"
        ? "text-rose-300 border-rose-500/35 bg-rose-500/10"
        : "text-emerald-300 border-emerald-500/35 bg-emerald-500/10";

  const activeCardMode = isAppView ? card.appCardMode : card.cardMode;
  const modeDetail = activeCardMode?.interactionMode === "tool"
    ? [activeCardMode.toolFamily, activeCardMode.signatureId].filter(Boolean).join("/")
    : undefined;

  function actionIntentText(action: string): string {
    const name = formatAction(action);
    if (channelMode === "ui") return `${name} and create a follow-up card.`;
    if (channelMode === "full") return `${name} and update this card in place.`;
    return `${name}.`;
  }

  function handleAction(action: string, payload?: unknown) {
    if (isLoading) return;
    if (isAppView || card.type === "dynamic-ui") {
      setConfirmAction({ action, payload });
      return;
    }
    sendCardAction(card.id, action, payload);
  }

  return (
    <div className="relative group mb-3">
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
          className="w-full text-left px-3 py-2 bg-gray-900/75 border border-gray-700/70 rounded-xl text-sm text-gray-300 hover:bg-gray-900 hover:text-gray-200 transition-colors flex items-center gap-2 shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
        >
          <span>{icon}</span>
          <span className="truncate">{truncate(card.text, 80)}</span>
        </button>
      ) : (
        <div className={`relative rounded-2xl border border-gray-700/70 bg-gray-900/40 backdrop-blur-sm shadow-[0_10px_26px_rgba(0,0,0,0.28)] ${isActive ? "ring-1 ring-indigo-400/35" : ""}`}>
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700/60">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>{icon}</span>
              <span className="capitalize">{effectiveType.replace("-", " ")}</span>
              {modeDetail && (
                <span className="text-[10px] text-gray-500 truncate max-w-[200px]" title={modeDetail}>
                  {modeDetail}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {card.enhanceStatus === "ready" && <ViewToggle card={card} />}
              {canEnhance && <EnhanceButton card={card} />}
              <div className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${statusTone}`}>
                {statusLabel}
              </div>
            </div>
          </div>
          <Renderer
            card={renderCard}
            isActive={isActive}
            onAction={handleAction}
          />
          {card.steps && card.steps.length > 1 && (
            <AgentSteps steps={card.steps} />
          )}
          {isAppView && !isLoading && (
            <div className="px-3 pb-2">
              <div className="text-[11px] text-gray-500 border-t border-gray-700/50 pt-2">
                Buttons run actions. You will get a quick confirmation before anything executes.
              </div>
            </div>
          )}
          {isLoading && <CardLoadingOverlay action={loadingLabel} />}
        </div>
      )}

      {confirmAction && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.55)]">
            <div className="px-4 py-3 border-b border-gray-700/70">
              <h3 className="text-sm font-semibold text-gray-100">Confirm action</h3>
              <p className="text-xs text-gray-400 mt-1">
                This action may call tools or the agent depending on card context.
              </p>
            </div>
            <div className="px-4 py-3 space-y-2">
              <div className="text-sm text-gray-200">{actionIntentText(confirmAction.action)}</div>
              {confirmAction.payload != null && (
                <pre className="text-xs text-gray-300 bg-gray-950/70 border border-gray-800 rounded-lg p-2 overflow-auto max-h-40">
                  {JSON.stringify(confirmAction.payload, null, 2)}
                </pre>
              )}
            </div>
            <div className="px-4 py-3 border-t border-gray-700/70 flex justify-end gap-2">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-3 py-1.5 text-xs rounded-md border border-gray-600 text-gray-300 hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  sendCardAction(card.id, confirmAction.action, confirmAction.payload);
                  setConfirmAction(null);
                }}
                className="px-3 py-1.5 text-xs rounded-md border border-indigo-500/60 bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30 transition-colors"
              >
                Run action
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
