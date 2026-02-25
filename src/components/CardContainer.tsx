import { useChatStore } from "../store/chat";
import { cardRegistry } from "../cards";
import type { Card } from "../cards/types";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import type { AgentStep, ToolBuildSummary } from "@shared/types";
import { AppBuilderDialog } from "./AppBuilderDialog";

const FAMILY_ICONS: Record<string, string> = {
  alpharank: "\uD83D\uDCC8",
  filesystem: "\uD83D\uDCC1",
  code_workspace: "\uD83D\uDCBB",
  multimedia: "\uD83C\uDFA5",
  travel_planner: "\u2708\uFE0F",
  meal_planner: "\uD83C\uDF7D\uFE0F",
};

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

function BuildSummaryBanner({ summary, onDismiss }: { summary: ToolBuildSummary; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const allPassed = summary.steps.every((s) => s.status === "passed");
  const familyLabel = summary.toolFamily.replace(/_/g, " ");

  return (
    <div className="mx-3 mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${allPassed ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300"}`}>
            {allPassed ? "Built" : "Partial"}
          </span>
          <span className="text-xs text-gray-200 font-medium truncate">
            New app: {familyLabel} ({summary.toolNames.length} tools)
          </span>
          {summary.persisted && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-gray-800 border border-gray-700/50 text-gray-400">Saved</span>
          )}
          {summary.skillGenerated && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-gray-800 border border-gray-700/50 text-sky-400/70">Agent-ready</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            className="text-gray-500 hover:text-gray-300 text-xs px-1"
            title="Dismiss"
          >
            &times;
          </button>
          <span className="text-gray-500 text-[10px]">{expanded ? "\u25B2" : "\u25BC"}</span>
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-2.5 space-y-2">
          <div className="text-[11px] text-gray-400 leading-relaxed">{summary.description}</div>
          <div className="flex flex-wrap gap-1">
            {summary.toolNames.map((name) => (
              <span key={name} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700/50 text-amber-300/80 font-mono">
                {name}
              </span>
            ))}
          </div>
          <div className="space-y-1">
            {summary.steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className={step.status === "passed" ? "text-emerald-400" : "text-rose-400"}>
                  {step.status === "passed" ? "\u2713" : "\u2717"}
                </span>
                <span className="text-gray-300">{step.label}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1 border-t border-gray-700/40">
            <span className="text-[10px] text-gray-500">Actions:</span>
            <div className="flex flex-wrap gap-1">
              {summary.actions.map((a) => (
                <span key={a} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700/50 text-gray-400">
                  {a.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>
          <div className="text-[10px] text-gray-500">
            Scenario: {summary.scenario.length > 120 ? summary.scenario.slice(0, 120) + "..." : summary.scenario}
          </div>
        </div>
      )}
    </div>
  );
}

/** Gather recent conversation context from the store for proposal generation. */
function getConversationContext(): string {
  const { cardOrder, cards } = useChatStore.getState();
  const recent = cardOrder.slice(-6).map((id) => cards[id]).filter(Boolean);
  return recent
    .map((c) => `[${c.role}] ${(c.text ?? "").slice(0, 400)}`)
    .join("\n\n");
}

function EnhanceButton({ card }: { card: Card }) {
  const enhanceCard = useChatStore((s) => s.enhanceCard);
  const enhanceCardWithFamily = useChatStore((s) => s.enhanceCardWithFamily);
  const proposeApp = useChatStore((s) => s.proposeApp);
  const toolFamilies = useChatStore((s) => s.toolFamilies);
  const [showMenu, setShowMenu] = useState(false);
  const [showFactory, setShowFactory] = useState(false);
  const [isProposing, setIsProposing] = useState(false);
  const [cachedContext, setCachedContext] = useState("");
  const pendingProposal = useChatStore((s) => s.cards[card.id]?.pendingProposal);
  const suggestedFamily = useChatStore((s) => s.cards[card.id]?.suggestedFamily);
  const status = card.enhanceStatus;
  const menuRef = useRef<HTMLDivElement>(null);

  // Cleanup subscription on unmount
  const unsubRef = useRef<(() => void) | null>(null);
  useEffect(() => () => { unsubRef.current?.(); }, []);

  // Close menu on click outside
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  const handleBuildAppClick = useCallback(() => {
    if (isProposing) return;
    setShowMenu(false);
    const currentProposal = useChatStore.getState().cards[card.id]?.pendingProposal;
    setIsProposing(true);
    const context = getConversationContext();
    setCachedContext(context);
    proposeApp(card.id, card.text ?? "", context);

    // Subscribe to store: when pendingProposal changes, open dialog
    unsubRef.current?.(); // clean up any prior subscription
    const unsub = useChatStore.subscribe((state) => {
      const proposal = state.cards[card.id]?.pendingProposal;
      if (proposal && proposal !== currentProposal) {
        unsub();
        unsubRef.current = null;
        setIsProposing(false);
        setShowFactory(true);
      }
    });
    unsubRef.current = unsub;

    // Safety timeout: if proposal doesn't arrive in 45s, open dialog anyway
    setTimeout(() => {
      if (unsubRef.current === unsub) {
        unsub();
        unsubRef.current = null;
        setIsProposing(false);
        setShowFactory(true);
      }
    }, 45_000);
  }, [card.id, card.text, proposeApp, isProposing]);

  const handleFamilyClick = useCallback((family: string) => {
    setShowMenu(false);
    enhanceCardWithFamily(card.id, family);
  }, [card.id, enhanceCardWithFamily]);

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
      <>
        {isProposing ? (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300">
            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-[10px]">Proposing app</span>
          </div>
        ) : (
          <button
            onClick={handleBuildAppClick}
            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors"
            title="Build a new app for this content"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Build App
          </button>
        )}
        {showFactory && (
          <AppBuilderDialog
            cardId={card.id}
            cardText={card.text ?? ""}
            initialProposal={pendingProposal ?? ""}
            conversationContext={cachedContext}
            onClose={() => setShowFactory(false)}
          />
        )}
      </>
    );
  }

  if (status === "ready") return null;

  // Suggested state — server detected a matching tool family in the background
  if (status === "suggested" && suggestedFamily) {
    const familyIcon = FAMILY_ICONS[suggestedFamily] ?? "\u2728";
    const familyLabel = suggestedFamily.replace(/_/g, " ");
    return (
      <button
        onClick={() => enhanceCardWithFamily(card.id, suggestedFamily)}
        className="flex items-center gap-1.5 text-[10px] px-2.5 py-0.5 rounded-full border border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-colors"
        title={`Enhance as ${familyLabel} (auto-detected)`}
      >
        <span className="text-xs leading-none">{familyIcon}</span>
        <span className="capitalize">{familyLabel}</span>
        <svg className="h-3 w-3 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </button>
    );
  }

  // Default state — show "App" button with dropdown menu
  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => {
          if (toolFamilies.length > 0) {
            setShowMenu((v) => !v);
          } else {
            enhanceCard(card.id);
          }
        }}
        className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-colors"
        title="Turn this response into an interactive app"
      >
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
        </svg>
        App
        {toolFamilies.length > 0 && (
          <svg className="h-2.5 w-2.5 ml-0.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </button>

      {showMenu && (
        <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-gray-900 border border-gray-700/80 rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.5)] overflow-hidden">
          {/* Auto-detect option */}
          <button
            onClick={() => { setShowMenu(false); enhanceCard(card.id); }}
            className="w-full text-left px-3 py-2 hover:bg-gray-800/70 transition-colors border-b border-gray-700/50"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">&#x2728;</span>
              <div>
                <div className="text-xs text-violet-300 font-medium">Auto-detect</div>
                <div className="text-[10px] text-gray-500">LLM picks the best app type</div>
              </div>
            </div>
          </button>

          {/* Tool family list */}
          <div className="max-h-48 overflow-y-auto">
            {toolFamilies.map((f) => (
              <button
                key={f.toolFamily}
                onClick={() => handleFamilyClick(f.toolFamily)}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-800/70 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{FAMILY_ICONS[f.toolFamily] ?? "\uD83D\uDD27"}</span>
                  <div className="min-w-0">
                    <div className="text-xs text-gray-200 truncate">{f.toolFamily.replace(/_/g, " ")}</div>
                    <div className="text-[10px] text-gray-500 truncate">{f.description}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Build custom app */}
          <button
            onClick={handleBuildAppClick}
            className="w-full text-left px-3 py-2 hover:bg-gray-800/70 transition-colors border-t border-gray-700/50"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">&#x2795;</span>
              <div>
                <div className="text-xs text-amber-300 font-medium">Build custom app...</div>
                <div className="text-[10px] text-gray-500">Generate a new app type with AI</div>
              </div>
            </div>
          </button>
        </div>
      )}

      {showFactory && (
        <AppBuilderDialog
          cardId={card.id}
          cardText={card.text ?? ""}
          initialProposal={pendingProposal ?? ""}
          conversationContext={cachedContext}
          onClose={() => setShowFactory(false)}
        />
      )}
    </div>
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
  const family = card.appCardMode?.toolFamily;
  const familyIcon = family ? (FAMILY_ICONS[family] ?? "\u2728") : null;
  const familyLabel = family ? family.replace(/_/g, " ") : "App";

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
        {familyIcon && <span className="mr-1">{familyIcon}</span>}
        <span className="capitalize">{familyLabel}</span>
      </button>
    </div>
  );
}

function RefineFooter({ cardId, onRefine }: { cardId: string; onRefine: (instruction: string) => void }) {
  const [showInput, setShowInput] = useState(false);
  const [instruction, setInstruction] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showInput]);

  const handleSubmit = () => {
    const trimmed = instruction.trim();
    if (!trimmed) return;
    onRefine(trimmed);
    setInstruction("");
    setShowInput(false);
  };

  return (
    <div className="px-3 pb-2">
      <div className="border-t border-gray-700/50 pt-2 flex items-center gap-2">
        {showInput ? (
          <div className="flex-1 flex items-center gap-1.5">
            <input
              ref={inputRef}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); if (e.key === "Escape") { setShowInput(false); setInstruction(""); } }}
              placeholder="e.g. use blue theme, add a chart, make cards bigger..."
              className="flex-1 bg-gray-800 border border-gray-600/60 rounded-md px-2 py-1 text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-violet-500/50"
            />
            <button
              onClick={handleSubmit}
              disabled={!instruction.trim()}
              className="px-2 py-1 text-[11px] rounded-md border border-violet-500/50 bg-violet-500/15 text-violet-300 hover:bg-violet-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Refine
            </button>
            <button
              onClick={() => { setShowInput(false); setInstruction(""); }}
              className="px-1.5 py-1 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              &times;
            </button>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-between">
            <span className="text-[11px] text-gray-500">
              Buttons run actions that update this card.
            </span>
            <button
              onClick={() => setShowInput(true)}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-gray-600/50 bg-gray-800/50 text-gray-400 hover:text-gray-200 hover:border-gray-500/60 transition-colors shrink-0 ml-2"
              title="Refine this app's UI"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Refine
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AutoHealBanner({
  status,
  error,
  onAction,
}: {
  status: "fixing" | "failed";
  error?: string;
  onAction: (action: string, payload?: unknown) => void;
}) {
  if (status === "fixing") {
    return (
      <div className="mx-3 mt-2 flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/5">
        <svg className="animate-spin h-3.5 w-3.5 text-amber-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-xs text-amber-300">Auto-fixing...</span>
      </div>
    );
  }

  return (
    <div className="mx-3 mt-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-rose-400 text-xs">&#x2717;</span>
          <span className="text-xs text-rose-300 truncate">
            Auto-fix failed{error ? `: ${error.length > 80 ? error.slice(0, 80) + "..." : error}` : ""}
          </span>
        </div>
        <button
          onClick={() => onAction("fix_with_code", { error: error ?? "Auto-fix failed" })}
          className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border border-gray-600/50 bg-gray-800/50 text-gray-400 hover:text-gray-200 hover:border-gray-500/60 transition-colors shrink-0 ml-2"
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          Debug with Code
        </button>
      </div>
    </div>
  );
}

export default function CardContainer({ card, isActive }: CardContainerProps) {
  const collapseCard = useChatStore((s) => s.collapseCard);
  const expandCard = useChatStore((s) => s.expandCard);
  const sendCardAction = useChatStore((s) => s.sendCardAction);
  const [buildSummaryDismissed, setBuildSummaryDismissed] = useState(false);

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

  function handleAction(action: string, payload?: unknown) {
    if (isLoading) return;
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
              {statusLabel !== "ready" && (
                <div className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${statusTone}`}>
                  {statusLabel}
                </div>
              )}
            </div>
          </div>
          <Renderer
            card={renderCard}
            isActive={isActive}
            onAction={handleAction}
          />
          {isAppView && card.appBuildSummary && !buildSummaryDismissed && (
            <BuildSummaryBanner
              summary={card.appBuildSummary}
              onDismiss={() => setBuildSummaryDismissed(true)}
            />
          )}
          {card.autoHealStatus === "fixing" && (
            <AutoHealBanner status="fixing" onAction={handleAction} />
          )}
          {card.autoHealStatus === "failed" && (
            <AutoHealBanner status="failed" error={card.autoHealError} onAction={handleAction} />
          )}
          {card.steps && card.steps.length > 1 && (
            <AgentSteps steps={card.steps} />
          )}
          {isAppView && !isLoading && (
            <RefineFooter cardId={card.id} onRefine={(instruction) => sendCardAction(card.id, "refine", { instruction })} />
          )}
          {isLoading && <CardLoadingOverlay action={loadingLabel} />}
        </div>
      )}

    </div>
  );
}
