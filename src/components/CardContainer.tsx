import { useChatStore } from "../store/chat";
import { cardRegistry } from "../cards";
import type { Card } from "../cards/types";
import { useEffect, useMemo, useState, useCallback, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { useElapsedTime, formatElapsed, estimateDuration } from "../lib/useElapsedTime";
import { isOrchestrationCardData } from "@shared/types";
import type { AgentStep, ToolBuildSummary } from "@shared/types";
import { AppBuilderDialog } from "./AppBuilderDialog";
import { CodeInvestigateDialog } from "./CodeInvestigateDialog";
import { useVoiceInput } from "./VoiceMicButton";
import { getActiveBackend } from "../lib/connection";
import { isNative } from "../lib/platform";
import { nativeShare } from "../lib/native-share";
import TerminalContent from "./TerminalContent";
import { copyAsMarkdown, copyAsPlainText, downloadAsPDF, downloadAsCSV, hasMarkdownTables } from "../lib/export";
import { API, TIMINGS } from "../lib/constants";

const APP_ICONS: Record<string, string> = {
  alpharank: "\uD83D\uDCC8",
  filesystem: "\uD83D\uDCC1",
  media_gallery: "\uD83D\uDDBC\uFE0F",
  travel_planner: "\u2708\uFE0F",
  meal_planner: "\uD83C\uDF7D\uFE0F",
};

/** Human-friendly names for card headers. Falls back to prettified appId. */
const APP_LABELS: Record<string, string> = {
  alpharank: "AlphaRank",
  filesystem: "File Browser",
  media_gallery: "Photo Gallery",
  web_browser: "Browser",
  researcher: "Researcher",
  clawhub: "ClawHub",
};

function getCardLabel(card: Card, effectiveType: string): string {
  if (card.type === "terminal") return "Terminal";
  if (card.type === "shell") return "Shell";
  if (card.type === "mission") return "Mission Planner";
  if (effectiveType === "dynamic-ui") {
    const mode = card.viewMode === "app" ? card.appCardMode : card.cardMode;
    const family = mode?.appId ?? mode?.toolFamily;
    if (family) {
      if (APP_LABELS[family]) return APP_LABELS[family];
      // Prettify unknown apps: "media_gallery" → "Media Gallery"
      return family.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    }
    return "Enso";
  }
  if (effectiveType === "chat") return "Enso";
  return effectiveType.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

interface CardContainerProps {
  card: Card;
  isActive: boolean;
}

const TYPE_ICONS: Record<string, string> = {
  chat: "\uD83E\uDD16",
  terminal: "\uD83D\uDCBB",
  "dynamic-ui": "\u2728",
  "user-bubble": "\uD83D\uDC64",
  mission: "\uD83C\uDFAF",
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
  const elapsed = useElapsedTime();
  const estimate = estimateDuration(action);
  const progress = estimate ? Math.min(elapsed / estimate, 0.95) : undefined;

  return (
    <div className="absolute inset-0 z-10 rounded-2xl pointer-events-auto overflow-hidden cursor-wait">
      <div className="absolute inset-0 bg-gray-950/45" />
      <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
      {/* Progress bar at bottom edge */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-800/80">
        {progress != null ? (
          <div
            className="h-full bg-indigo-500/80 transition-[width] duration-1000 ease-out rounded-r-full"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        ) : (
          <div className="h-full w-1/3 bg-indigo-500/60 rounded-full animate-[indeterminate_1.8s_ease-in-out_infinite]" />
        )}
      </div>
      {/* Status pill */}
      <div className="absolute bottom-2.5 right-3 flex items-center gap-2 bg-gray-900/95 rounded-full pl-2.5 pr-3 py-1.5 border border-gray-600/60 shadow-lg">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
        </span>
        <span className="text-[11px] text-gray-300 font-medium">{label}</span>
        <span className="text-[10px] text-gray-500 tabular-nums">{formatElapsed(elapsed)}</span>
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


function EnhanceButton({ card }: { card: Card }) {
  const enhanceCard = useChatStore((s) => s.enhanceCard);
  const enhanceCardWithFamily = useChatStore((s) => s.enhanceCardWithFamily);
  const toolFamilies = useChatStore((s) => s.toolFamilies);
  const [showMenu, setShowMenu] = useState(false);
  const [showFactory, setShowFactory] = useState(false);
  const suggestedFamily = useChatStore((s) => s.cards[card.id]?.suggestedFamily);
  const status = card.enhanceStatus;
  const menuRef = useRef<HTMLDivElement>(null);

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
    setShowMenu(false);
    setShowFactory(true);
  }, []);

  const handleAppClick = useCallback((appId: string) => {
    setShowMenu(false);
    enhanceCardWithFamily(card.id, appId);
  }, [card.id, enhanceCardWithFamily]);

  if (status === "loading") {
    return (
      <div className="flex items-center gap-1 sm:gap-1.5 min-h-[28px] px-1.5 sm:px-2 py-0.5 rounded-full border border-violet-500/40 bg-violet-500/10 text-violet-300">
        <svg className="animate-spin h-3.5 w-3.5 sm:h-3 sm:w-3 shrink-0" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-[10px] hidden sm:inline">Enhancing</span>
      </div>
    );
  }

  if (status === "unavailable") {
    return (
      <>
        <button
          onClick={handleBuildAppClick}
          className="flex items-center justify-center gap-1 text-[10px] min-h-[28px] min-w-[28px] sm:min-w-0 px-1 sm:px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 active:bg-amber-500/30 active:scale-[0.95] transition-all duration-150"
          title="Build a new app for this content"
        >
          <svg className="h-3.5 w-3.5 sm:h-3 sm:w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="hidden sm:inline">Build App</span>
        </button>
        {showFactory && (
          <AppBuilderDialog
            cardId={card.id}
            cardText={card.text ?? ""}
            onClose={() => setShowFactory(false)}
          />
        )}
      </>
    );
  }

  if (status === "ready") return null;

  // Suggested state — server detected a matching tool family in the background
  if (status === "suggested" && suggestedFamily) {
    const familyIcon = APP_ICONS[suggestedFamily] ?? "\u2728";
    const familyLabel = suggestedFamily.replace(/_/g, " ");
    return (
      <button
        onClick={() => enhanceCardWithFamily(card.id, suggestedFamily)}
        className="flex items-center justify-center gap-1 sm:gap-1.5 text-[10px] min-h-[28px] px-1.5 sm:px-2.5 py-0.5 rounded-full border border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 active:bg-emerald-500/35 active:scale-[0.95] transition-all duration-150"
        title={`Enhance as ${familyLabel} (auto-detected)`}
      >
        <span className="text-xs leading-none">{familyIcon}</span>
        <span className="capitalize hidden sm:inline">{familyLabel}</span>
        <svg className="h-3 w-3 opacity-60 hidden sm:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        className="flex items-center justify-center gap-1 text-[10px] min-h-[28px] min-w-[28px] sm:min-w-0 px-1 sm:px-2 py-0.5 rounded-full border border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 active:bg-violet-500/30 active:scale-[0.95] transition-all duration-150"
        title="Turn this response into an interactive app"
      >
        <svg className="h-3.5 w-3.5 sm:h-3 sm:w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
        </svg>
        <span className="hidden sm:inline">App</span>
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
            className="w-full text-left px-3 py-2 hover:bg-gray-800/70 active:bg-gray-700/70 transition-all duration-150 border-b border-gray-700/50"
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
                key={f.appId ?? f.toolFamily}
                onClick={() => handleAppClick(f.appId ?? f.toolFamily)}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-800/70 active:bg-gray-700/70 transition-all duration-150"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{APP_ICONS[f.appId ?? f.toolFamily] ?? "\uD83D\uDD27"}</span>
                  <div className="min-w-0">
                    <div className="text-xs text-gray-200 truncate">{(f.appId ?? f.toolFamily).replace(/_/g, " ")}</div>
                    <div className="text-[10px] text-gray-500 truncate">{f.description}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Build custom app */}
          <button
            onClick={handleBuildAppClick}
            className="w-full text-left px-3 py-2 hover:bg-gray-800/70 active:bg-gray-700/70 transition-all duration-150 border-t border-gray-700/50"
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

function PinButton({ cardId }: { cardId: string }) {
  const isPinned = useChatStore((s) => s.pinnedCards.includes(cardId));
  const pinCard = useChatStore((s) => s.pinCard);
  const unpinCard = useChatStore((s) => s.unpinCard);

  return (
    <button
      onClick={() => isPinned ? unpinCard(cardId) : pinCard(cardId)}
      className={`min-h-[28px] min-w-[28px] px-1 py-0.5 rounded-full border transition-colors flex items-center justify-center ${
        isPinned
          ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
          : "border-gray-600/50 bg-transparent text-gray-500 hover:text-gray-300"
      }`}
      title={isPinned ? "Unpin" : "Pin to sidebar"}
    >
      <svg className="h-3.5 w-3.5 sm:h-3 sm:w-3 shrink-0" viewBox="0 0 24 24" fill={isPinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 17v5" />
        <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h14v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1h.5a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5h-9a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5H8a1 1 0 0 1 1 1z" />
      </svg>
    </button>
  );
}

function ShareDialog({ card, onClose }: { card: Card; onClose: () => void }) {
  const [busy, setBusy] = useState(false);

  const backend = getActiveBackend();
  const serverUrl = backend?.url || window.location.origin;

  // Extract current path and toolFamily for scoped sharing
  const cardData = (card.appData ?? card.data ?? {}) as Record<string, unknown>;
  const currentPath = typeof cardData.path === "string" ? cardData.path : null;
  const appId = card.appCardMode?.appId ?? card.appCardMode?.toolFamily ?? card.cardMode?.appId ?? card.cardMode?.toolFamily;
  const isMediaGallery = (appId === "media_gallery") && !!currentPath;
  const familyLabel = appId ? appId.replace(/_/g, " ") : "app";

  /** Resolve token (creating scoped context if needed). */
  const resolveShareToken = async (): Promise<{ token: string; shareCardId?: string }> => {
    let token = backend?.token || "";
    let shareCardId: string | undefined;

    if (isMediaGallery) {
      const baseUrl = backend?.url || "";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${baseUrl}${API.SHARE_CREATE}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ cardId: card.id, allowedRoot: currentPath }),
      });
      if (res.ok) {
        const data = await res.json();
        token = data.token || token;
        shareCardId = data.shareCardId;
      }
    } else if (!token) {
      try {
        const baseUrl = backend?.url || "";
        const res = await fetch(`${baseUrl}${API.SHARE_TOKEN}`);
        if (res.ok) {
          const data = await res.json();
          token = data.token || "";
        }
      } catch { /* proceed without token */ }
    }

    return { token, shareCardId };
  };

  /** Build a deep-link URL for the share (includes cardId so recipients see the shared app). */
  const buildShareUrl = (token: string, shareCardId?: string): string => {
    const url = new URL(serverUrl);
    url.searchParams.set("backend", serverUrl);
    if (token) url.searchParams.set("token", token);
    if (shareCardId) url.searchParams.set("share", shareCardId);
    return url.toString();
  };

  /** Android native: open system share sheet with link + description. */
  const handleNativeShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { token, shareCardId } = await resolveShareToken();
      const shareUrl = buildShareUrl(token, shareCardId ?? card.id);
      const title = `Enso — ${familyLabel}`;
      const description = isMediaGallery
        ? `Shared folder from Enso`
        : `Check out this ${familyLabel} on Enso`;
      await nativeShare({ title, text: description, url: shareUrl });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  /** Web/PWA: export as HTML file. */
  const handleExport = async (mode: "live" | "offline") => {
    if (busy) return;
    setBusy(true);
    try {
      const { token, shareCardId } = await resolveShareToken();
      const exportCard = shareCardId ? { ...card, id: shareCardId } : card;

      const { exportCardAsHtml } = await import("../lib/exportApp");
      await exportCardAsHtml(
        exportCard,
        mode,
        mode === "live" ? { serverUrl, token } : undefined,
      );
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-sm mx-4 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-sm font-semibold text-gray-100">Share this app</h3>
        </div>
        <div className="px-4 py-2 text-xs text-gray-300 space-y-2">
          {isMediaGallery ? (
            <>
              <p>
                <strong className="text-blue-400">Scoped share:</strong> The recipient will have access
                <strong> only</strong> to this folder and its subfolders:
              </p>
              <p className="text-[10px] text-blue-300/80 font-mono truncate bg-blue-500/10 border border-blue-500/20 rounded px-2 py-1" title={currentPath}>
                {currentPath}
              </p>
            </>
          ) : (
            <p>
              <strong className="text-amber-400">Warning:</strong> Anyone with the link gets direct access
              to your Enso server. They can interact with this app and trigger actions on your machine.
            </p>
          )}
          <p className="text-[10px] text-gray-500 font-mono truncate" title={serverUrl}>
            {serverUrl}
          </p>
        </div>
        <div className="px-4 py-3 border-t border-gray-700/50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-lg border border-gray-600 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-all duration-150 active:scale-[0.97] cursor-pointer"
          >
            Cancel
          </button>
          {isNative ? (
            <button
              onClick={handleNativeShare}
              disabled={busy}
              className="px-3 py-1.5 text-xs rounded-lg border border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-all duration-150 active:scale-[0.97] cursor-pointer disabled:opacity-50"
            >
              {busy ? "Preparing…" : "Share"}
            </button>
          ) : (
            <>
              <button
                onClick={() => handleExport("offline")}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800 transition-all duration-150 active:scale-[0.97] cursor-pointer disabled:opacity-50"
              >
                Save Offline
              </button>
              <button
                onClick={() => handleExport("live")}
                disabled={busy}
                className="px-3 py-1.5 text-xs rounded-lg border border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 transition-all duration-150 active:scale-[0.97] cursor-pointer disabled:opacity-50"
              >
                {busy ? "Exporting…" : "Share Live"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ContentExportMenu({ card }: { card: Card }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const text = card.text ?? "";
  const hasTables = hasMarkdownTables(text);

  useEffect(() => {
    if (!open) return;
    const handler = (e: globalThis.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Flash the export button when card first completes
  useEffect(() => {
    if (card.status === "complete") {
      setJustCompleted(true);
      const timer = setTimeout(() => setJustCompleted(false), TIMINGS.TOAST_DURATION);
      return () => clearTimeout(timer);
    }
  }, [card.status]);

  const title = (() => {
    const firstLine = text.split("\n").find(l => l.trim());
    if (!firstLine) return "Enso Export";
    return firstLine.replace(/^#+\s*/, "").slice(0, 60);
  })();

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`text-[10px] min-h-[28px] min-w-[28px] sm:min-w-0 px-1 sm:px-1.5 py-0.5 rounded-full border border-gray-600/50 bg-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors flex items-center justify-center gap-1 ${justCompleted ? "ring-2 ring-indigo-400/50 animate-pulse" : ""}`}
        title="Export content"
      >
        <svg className="h-3.5 w-3.5 sm:h-3 sm:w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span className="text-[10px]">Export</span>
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-1 bg-gray-900 border border-gray-700/80 rounded-lg shadow-[0_-4px_20px_rgba(0,0,0,0.5)] overflow-hidden min-w-[160px] z-[200]">
          <button
            onClick={async () => { await copyAsMarkdown(text); setCopied(true); setTimeout(() => { setCopied(false); setOpen(false); }, TIMINGS.COPY_FEEDBACK); }}
            className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-700/50 transition-all duration-150 flex items-center gap-2"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {copied ? "Copied!" : "Copy Markdown"}
          </button>
          <button
            onClick={async () => { await copyAsPlainText(text); setCopied(true); setTimeout(() => { setCopied(false); setOpen(false); }, TIMINGS.COPY_FEEDBACK); }}
            className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-700/50 transition-all duration-150 flex items-center gap-2"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            Copy Plain Text
          </button>
          <div className="h-px bg-gray-700/50 mx-2" />
          <button
            onClick={() => { downloadAsPDF(title, text); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-700/50 transition-all duration-150 flex items-center gap-2"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            Download PDF
          </button>
          {hasTables && (
            <button
              onClick={() => { downloadAsCSV(text, title.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 30)); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-700/50 transition-all duration-150 flex items-center gap-2"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="3" y1="15" x2="21" y2="15" />
                <line x1="9" y1="3" x2="9" y2="21" />
                <line x1="15" y1="3" x2="15" y2="21" />
              </svg>
              Download CSV
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ExportButton({ card }: { card: Card }) {
  const [showDialog, setShowDialog] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        className="text-[10px] min-h-[28px] min-w-[28px] sm:min-w-0 px-1 sm:px-1.5 py-0.5 rounded-full border border-gray-600/50 bg-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors flex items-center justify-center gap-1"
        title="Share / Export app"
      >
        <svg className="h-3.5 w-3.5 sm:h-3 sm:w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
        <span className="hidden sm:inline">Share</span>
      </button>
      {showDialog && <ShareDialog card={card} onClose={() => setShowDialog(false)} />}
    </>
  );
}

function DeepResearchBuildView({ text }: { text: string }) {
  return (
    <div className="bg-[#0d1117] rounded-lg border border-gray-800 overflow-hidden">
      <TerminalContent
        text={text}
        status="streaming"
        accentColor="violet"
        showHeader
        headerLabel="Deep Research"
        maxHeightClass="max-h-[500px]"
      />
    </div>
  );
}

function OrchestrationTerminalView({ text, isComplete }: { text: string; isComplete?: boolean }) {
  return (
    <div className="bg-[#0d1117] rounded-lg border border-gray-800 overflow-hidden">
      <TerminalContent
        text={text}
        status={isComplete ? "complete" : "streaming"}
        accentColor="green"
        showHeader
        headerLabel="Orchestration"
        maxHeightClass="max-h-[500px]"
      />
    </div>
  );
}

function ViewToggle({ card }: { card: Card }) {
  const toggleCardView = useChatStore((s) => s.toggleCardView);
  const viewMode = card.viewMode ?? "original";
  const family = card.appCardMode?.appId ?? card.appCardMode?.toolFamily;
  const familyIcon = family ? (APP_ICONS[family] ?? "\u2728") : null;
  const familyLabel = family ? family.replace(/_/g, " ") : "App";
  const isBuilding = card.deepResearchStatus === "building";

  // Deep research / archetype / orchestration toggle labels
  const isOrchestration = card.type === "orchestration";
  const orchHasBespokeUI = isOrchestration && !!card.appGeneratedUI && card.enhanceStatus === "ready";
  const isFocusedArchetype = isBuilding || family === "archetype" ||
    card.appCardMode?.signatureId === "focused_archetype_custom";
  const isDeepResearch = isBuilding || (family === "researcher" && (
    card.appCardMode?.signatureId === "deep_research_custom" ||
    (card.appData as Record<string, unknown>)?.metadata &&
    ((card.appData as Record<string, unknown>)?.metadata as Record<string, unknown>)?.isDeepResearch
  ));
  const isBespokeView = isDeepResearch || isFocusedArchetype || isOrchestration;
  const originalLabel = isOrchestration ? "Plan" : isBespokeView ? "Standard" : "Original";
  const originalLabelShort = isOrchestration ? "Plan" : isBespokeView ? "Std" : "Text";
  const appLabel = isOrchestration
    ? (orchHasBespokeUI ? "✨ Result" : "⚡ Terminal")
    : isFocusedArchetype ? "✨ Result" : isDeepResearch ? "Deep" : familyLabel;
  const appLabelShort = isOrchestration
    ? (orchHasBespokeUI ? "Result" : "Term")
    : isFocusedArchetype ? "Result" : isDeepResearch ? "Deep" : "App";
  const appIcon = isOrchestration ? null : isBespokeView ? "✨" : familyIcon;

  return (
    <div className="inline-flex rounded-full border border-gray-600/50 bg-gray-800/60 p-0.5">
      <button
        onClick={() => toggleCardView(card.id, "original")}
        className={`text-[10px] min-h-[26px] px-1.5 sm:px-2.5 py-0.5 rounded-full transition-all duration-150 active:scale-[0.95] ${
          viewMode === "original"
            ? "bg-gray-600/60 text-gray-200"
            : "text-gray-400 hover:text-gray-300 active:text-gray-200"
        }`}
      >
        <span className="sm:hidden">{originalLabelShort}</span>
        <span className="hidden sm:inline">{originalLabel}</span>
      </button>
      <button
        onClick={() => toggleCardView(card.id, "app")}
        className={`text-[10px] min-h-[26px] px-1.5 sm:px-2.5 py-0.5 rounded-full transition-all duration-150 active:scale-[0.95] ${
          isBuilding
            ? "bg-violet-500/20 text-violet-300 border-violet-500/30 animate-pulse"
            : viewMode === "app"
              ? "bg-violet-500/30 text-violet-200 border-violet-500/40"
              : "text-gray-400 hover:text-gray-300 active:text-gray-200"
        }`}
      >
        {appIcon && <span className="mr-0.5 sm:mr-1">{appIcon}</span>}
        <span className="capitalize hidden sm:inline">{appLabel}</span>
        <span className="capitalize sm:hidden">{appLabelShort}</span>
      </button>
    </div>
  );
}

function RefineFooter({ cardId, onRefine, onImproveWithCode }: {
  cardId: string;
  onRefine: (instruction: string) => void;
  onImproveWithCode: (instruction: string) => void;
}) {
  const [showInput, setShowInput] = useState(false);
  const [instruction, setInstruction] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { VoiceMic } = useVoiceInput(setInstruction);

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

  const handleCodeSubmit = () => {
    const trimmed = instruction.trim();
    if (!trimmed) return;
    onImproveWithCode(trimmed);
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
            <VoiceMic />
            <button
              onClick={handleSubmit}
              disabled={!instruction.trim()}
              className="px-2 py-1 text-[11px] rounded-md border border-violet-500/50 bg-violet-500/15 text-violet-300 hover:bg-violet-500/25 active:bg-violet-500/35 active:scale-[0.95] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Refine
            </button>
            <button
              onClick={handleCodeSubmit}
              disabled={!instruction.trim()}
              className="px-2 py-1 text-[11px] rounded-md border border-indigo-500/50 bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 active:bg-indigo-500/35 active:scale-[0.95] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
              title="Improve with Claude Code (can modify executors, templates, and app structure)"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              Code
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
              className="flex items-center justify-center gap-1 text-[10px] min-h-[28px] min-w-[28px] sm:min-w-0 px-1 sm:px-2 py-0.5 rounded-full border border-gray-600/50 bg-gray-800/50 text-gray-400 hover:text-gray-200 hover:border-gray-500/60 active:bg-gray-700/60 active:scale-[0.95] transition-all duration-150 shrink-0 ml-2"
              title="Refine this app's UI"
            >
              <svg className="h-3.5 w-3.5 sm:h-3 sm:w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              <span className="hidden sm:inline">Refine</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CardContextMenu({ x, y, onRemove, onClose, cardText }: { x: number; y: number; onRemove: () => void; onClose: () => void; cardText?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handler = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const handleCopy = async () => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();
    const textToCopy = selectedText || cardText || "";
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => onClose(), TIMINGS.COPY_FEEDBACK);
    } catch {
      // fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = textToCopy;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => onClose(), TIMINGS.COPY_FEEDBACK);
    }
  };

  return (
    <div
      ref={ref}
      className="fixed z-[300] bg-gray-900 border border-gray-700/80 rounded-lg shadow-[0_12px_40px_rgba(0,0,0,0.5)] overflow-hidden min-w-[140px]"
      style={{ left: x, top: y }}
    >
      <button
        onClick={handleCopy}
        className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-700/50 active:bg-gray-600/50 transition-all duration-150 flex items-center gap-2"
      >
        {copied ? (
          <svg className="h-3.5 w-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
        {copied ? "Copied!" : "Copy"}
      </button>
      <button
        onClick={() => { onRemove(); onClose(); }}
        className="w-full text-left px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/15 active:bg-rose-500/25 transition-all duration-150 flex items-center gap-2"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18" />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
        </svg>
        Remove
      </button>
    </div>
  );
}

function CapabilityDiscoveryBar({ card }: { card: Card }) {
  const sendMessage = useChatStore((s) => s.sendMessage);
  const cards = useChatStore((s) => s.cards);
  const cardOrder = useChatStore((s) => s.cardOrder);

  const userQuery = useMemo(() => {
    const thisIdx = cardOrder.indexOf(card.id);
    if (thisIdx < 0) return null;
    for (let i = thisIdx - 1; i >= 0; i--) {
      const c = cards[cardOrder[i]];
      if (c?.role === "user" && c.text) return c.text.trim();
    }
    return null;
  }, [card.id, cardOrder, cards]);

  if (!userQuery) return null;
  const isSlashCommand = userQuery.startsWith("/");
  if ((card.text?.length ?? 0) < 100) return null;

  const buttons: Array<{ label: string; icon: string; prefix: string }> = [];
  if (!isSlashCommand || !userQuery.startsWith("/research")) {
    buttons.push({ label: "Deep Research", icon: "\uD83D\uDD0D", prefix: "/research " });
  }
  if (!isSlashCommand || !userQuery.startsWith("/orchestrate")) {
    buttons.push({ label: "Orchestrate", icon: "\u26A1", prefix: "/orchestrate " });
  }
  if (!isSlashCommand || !userQuery.startsWith("/code")) {
    buttons.push({ label: "Write Code", icon: "\uD83D\uDCBB", prefix: "/code " });
  }
  if (buttons.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap px-3 pb-2 pt-1 border-t border-gray-700/30">
      <span className="text-[10px] text-gray-600 mr-0.5">Try:</span>
      {buttons.map((btn) => (
        <button
          key={btn.prefix}
          onClick={() => sendMessage(btn.prefix + userQuery)}
          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border border-gray-600/40 bg-gray-800/40 text-gray-400 hover:text-gray-200 hover:border-gray-500/60 hover:bg-gray-700/40 active:bg-gray-600/40 active:scale-[0.96] transition-all duration-150"
        >
          <span>{btn.icon}</span>
          <span>{btn.label}</span>
        </button>
      ))}
    </div>
  );
}

export default function CardContainer({ card, isActive }: CardContainerProps) {
  const collapseCard = useChatStore((s) => s.collapseCard);
  const expandCard = useChatStore((s) => s.expandCard);
  const removeCard = useChatStore((s) => s.removeCard);
  const sendCardAction = useChatStore((s) => s.sendCardAction);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const [showCodeDialog, setShowCodeDialog] = useState(false);
  const [buildSummaryDismissed, setBuildSummaryDismissed] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const isCollapsed = card.display === "collapsed";
  const isDeepBuilding = card.deepResearchStatus === "building";
  const isDeepBuildAppView = isDeepBuilding && card.viewMode === "app";
  const isOrchestration = card.type === "orchestration";
  const orchHasTerminal = false; // Terminal tabs now built into OrchestrationCard itself
  const orchHasBespokeUI = isOrchestration && !!card.appGeneratedUI && card.enhanceStatus === "ready";
  const orchShowTerminal = false; // Removed: OrchestrationCard has internal terminal tab view
  const orchShowBespoke = isOrchestration && card.viewMode === "app" && orchHasBespokeUI;
  const orchComplete = (() => {
    if (!isOrchestrationCardData(card.data)) return false;
    const s = card.data.orchestrationProgress?.plan?.status;
    return s === "completed" || s === "failed";
  })();
  const isAppView = (card.viewMode === "app" && card.enhanceStatus === "ready" && card.appGeneratedUI) || isDeepBuildAppView;
  const isDynamicCard = card.type === "dynamic-ui" && !!card.generatedUI;
  const isShareable = isAppView || isDynamicCard;
  const isGeneralSmartCard = card.type === "dynamic-ui" && (card.cardMode?.appId ?? card.cardMode?.toolFamily) === "general";
  const canEnhance = card.role === "assistant" && card.status === "complete"
    && (card.type === "chat" || isGeneralSmartCard);

  // "Research this" is available on any assistant card with text, except researcher cards themselves
  const cardFamily = (isAppView ? card.appCardMode?.appId : card.cardMode?.appId)
    ?? (isAppView ? card.appCardMode?.toolFamily : card.cardMode?.toolFamily);
  const canResearch = card.role === "assistant" && card.status === "complete"
    && !!card.text && card.type !== "terminal" && card.type !== "shell" && card.type !== "mission"
    && cardFamily !== "researcher";

  const effectiveType = isAppView ? "dynamic-ui" : card.type;
  const registration = cardRegistry.get(effectiveType);

  // Build a synthetic card for app view rendering
  const renderCard = useMemo<Card>(() => {
    if (!isAppView) {
      // During/after deep research build, use snapshot of standard data
      // so the Standard view shows original research, not deep_dive interim data
      if ((isDeepBuilding || card.standardDataSnapshot) && card.standardDataSnapshot != null) {
        return {
          ...card,
          data: card.standardDataSnapshot,
          generatedUI: card.standardGeneratedUISnapshot ?? card.generatedUI,
        };
      }
      return card;
    }
    return {
      ...card,
      data: card.appData,
      generatedUI: card.appGeneratedUI,
      cardMode: card.appCardMode,
    };
  }, [card, isAppView, isDeepBuilding]);

  if (!registration) {
    return (
      <div className="mb-3 text-gray-500 text-sm">
        Unknown card type: {card.type}
      </div>
    );
  }

  const Renderer = registration.renderer;
  const icon = TYPE_ICONS[effectiveType] ?? "\uD83D\uDCCB";

  if (card.type === "thinking") {
    return <Renderer card={card} isActive={isActive} onAction={handleAction} />;
  }

  if (card.type === "user-bubble") {
    return (
      <div onContextMenu={handleContextMenu} className="relative">
        {contextMenu && (
          <CardContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            cardText={card.text ?? ""}
            onRemove={() => removeCard(card.id)}
            onClose={() => setContextMenu(null)}
          />
        )}
        <Renderer
          card={card}
          isActive={isActive}
          onAction={(action, payload) => sendCardAction(card.id, action, payload)}
        />
      </div>
    );
  }

  const isLoading = (card.status === "streaming" || card.enhanceStatus === "loading") && !isDeepBuilding && !isOrchestration;
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

  function handleAction(action: string, payload?: unknown) {
    if (isLoading) return;
    if (action === "open_url" && typeof (payload as Record<string,unknown>)?.url === "string") {
      window.open((payload as Record<string,unknown>).url as string, "_blank", "noopener");
      return;
    }
    // Client-side photo save (download to device)
    if (action === "__save_photo") {
      const p = payload as Record<string, unknown> | undefined;
      const url = typeof p?.url === "string" ? p.url : null;
      if (url) {
        import("../lib/media-actions").then(({ savePhoto }) => {
          savePhoto(url, typeof p?.filename === "string" ? p.filename : undefined);
        }).catch(console.error);
      }
      return;
    }
    // Client-side photo share (Web Share API or native share sheet)
    if (action === "__share_photo") {
      const p = payload as Record<string, unknown> | undefined;
      const url = typeof p?.url === "string" ? p.url : null;
      if (url) {
        import("../lib/media-actions").then(({ sharePhoto }) => {
          sharePhoto(url, typeof p?.filename === "string" ? p.filename : undefined);
        }).catch(console.error);
      }
      return;
    }
    // Client-side research share as long screenshot image
    if (action === "__share_research_image") {
      const p = payload as Record<string, unknown> | undefined;
      const targetCardId = typeof p?.cardId === "string" ? p.cardId : card.id;
      const topic = typeof p?.topic === "string" ? p.topic : "Research";
      const el = document.querySelector(`[data-card-id="${targetCardId}"]`) as HTMLElement | null;
      if (!el) return;

      (async () => {
        try {
          const { toPng } = await import("html-to-image");
          const dataUrl = await toPng(el, {
            pixelRatio: 2,
            cacheBust: true,
            backgroundColor: "#030712",
            filter: (node: HTMLElement) => {
              // Skip context menus, tooltips, etc.
              if (node.classList?.contains("group-hover:opacity-100")) return false;
              return true;
            },
          });
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          const filename = `enso-research-${topic.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 40)}.png`;
          const file = new File([blob], filename, { type: "image/png" });

          // Native app: share via Android share sheet with image file
          const { nativeShareImage, isNative: isNativePlatform } = await import("../lib/native-share");
          if (isNativePlatform) {
            await nativeShareImage({ dataUrl, title: `Research: ${topic}`, filename });
            return;
          }

          // Mobile browser: try Web Share API with file
          const isMobile = /Mobi|Android/i.test(navigator.userAgent);
          if (isMobile && navigator.share && navigator.canShare?.({ files: [file] })) {
            try {
              await navigator.share({ title: `Research: ${topic}`, files: [file] });
              return;
            } catch (err) {
              if ((err as DOMException)?.name === "AbortError") return;
            }
          }

          // Desktop fallback: download the image
          const a = document.createElement("a");
          a.href = dataUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } catch (err) {
          console.error("[share_research_image] capture failed:", err);
          // Fallback to text share
          handleAction("__share_research", payload);
        }
      })();
      return;
    }
    // Client-side research share as PDF
    if (action === "__share_research_pdf") {
      const p = payload as Record<string, unknown> | undefined;
      const topic = typeof p?.topic === "string" ? p.topic : "Research";
      (async () => {
        try {
          const { shareResearchAsPDF } = await import("../lib/research-pdf");
          const { blob, filename } = await shareResearchAsPDF({
            topic,
            summary: typeof p?.summary === "string" ? p.summary : "",
            keyFindings: Array.isArray(p?.keyFindings) ? p.keyFindings : [],
            sections: Array.isArray(p?.sections) ? p.sections : [],
            sources: Array.isArray(p?.sources) ? p.sources : [],
            narrative: typeof p?.narrative === "string" ? p.narrative : "",
            videos: Array.isArray(p?.videos) ? p.videos : [],
            books: Array.isArray(p?.books) ? p.books : [],
            movies: Array.isArray(p?.movies) ? p.movies : [],
            contradictions: Array.isArray(p?.contradictions) ? p.contradictions : [],
          });

          // Native app: share PDF via Android share sheet
          const { nativeShareFile, isNative: isNativePlatform } = await import("../lib/native-share");
          if (isNativePlatform) {
            // Convert blob to base64 data URL for native sharing
            const reader = new FileReader();
            const dataUrl = await new Promise<string>((resolve) => {
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
            await nativeShareFile({ dataUrl, title: `Research: ${topic}`, filename, mimeType: "application/pdf" });
            return;
          }

          // Mobile browser: try Web Share API with file
          const file = new File([blob], filename, { type: "application/pdf" });
          const isMobile = /Mobi|Android/i.test(navigator.userAgent);
          if (isMobile && navigator.share && navigator.canShare?.({ files: [file] })) {
            try {
              await navigator.share({ title: `Research: ${topic}`, files: [file] });
              return;
            } catch (err) {
              if ((err as DOMException)?.name === "AbortError") return;
            }
          }

          // Desktop fallback: download the PDF
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (err) {
          console.error("[share_research_pdf] generation failed:", err);
        }
      })();
      return;
    }
    // Client-side copy text to clipboard (for citation export and other template actions)
    if (action === "__copy_text") {
      const p = payload as Record<string, unknown> | undefined;
      const text = typeof p?.text === "string" ? p.text : "";
      if (text) {
        navigator.clipboard.writeText(text).catch(() => {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        });
      }
      return;
    }
    // Client-side photo upload — opens file picker, uploads to server, then triggers backend action
    if (action === "__upload_photos") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.multiple = true;
      input.onchange = async () => {
        const files = input.files;
        if (!files || files.length === 0) return;
        try {
          const { getBackendBaseUrl, authHeaders } = await import("../lib/connection");
          const { isNative } = await import("../lib/platform");
          const uploaded: { filePath: string; mediaUrl: string; name: string }[] = [];
          for (const file of Array.from(files)) {
            let res: Response;
            if (isNative) {
              // On Android/Capacitor, Blob fetch bodies are serialized as "{}"
              // by the WebView. Convert to base64 JSON so the server can decode.
              const buf = await file.arrayBuffer();
              const bytes = new Uint8Array(buf);
              let binary = "";
              for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
              const b64 = btoa(binary);
              res = await fetch(`${getBackendBaseUrl()}/upload`, {
                method: "POST",
                headers: authHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify({ data: b64, mimeType: file.type || "image/jpeg" }),
              });
            } else {
              res = await fetch(`${getBackendBaseUrl()}/upload`, {
                method: "POST",
                headers: authHeaders({ "Content-Type": file.type }),
                body: file,
              });
            }
            if (res.ok) {
              const { filePath, mediaUrl } = await res.json();
              uploaded.push({ filePath, mediaUrl, name: file.name });
            }
          }
          if (uploaded.length > 0) {
            sendCardAction(card.id, "upload_photos", {
              files: uploaded.map((u) => u.filePath),
              names: uploaded.map((u) => u.name),
              mediaUrls: uploaded.map((u) => u.mediaUrl),
            });
          }
        } catch (err) {
          console.error("[upload_photos] failed:", err);
        }
      };
      input.click();
      return;
    }
    sendCardAction(card.id, action, payload);
  }

  return (
    <div className="relative group mb-3" onContextMenu={handleContextMenu}>
      {contextMenu && (
        <CardContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          cardText={card.text ?? ""}
          onRemove={() => removeCard(card.id)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {isCollapsed ? (
        <button
          onClick={() => expandCard(card.id)}
          className="w-full text-left min-h-[36px] px-2.5 sm:px-3 py-1.5 bg-gray-900/75 border border-gray-700/70 rounded-xl text-sm text-gray-300 hover:bg-gray-900 hover:text-gray-200 active:bg-gray-800 active:scale-[0.99] transition-all duration-150 flex items-center gap-2 shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
        >
          <svg className="h-3 w-3 shrink-0 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span className="shrink-0">{icon}</span>
          <span className="text-[11px] text-gray-500 shrink-0">{getCardLabel(card, effectiveType)}</span>
          <span className="truncate text-gray-400">{truncate(card.text, 60)}</span>
        </button>
      ) : (
        <div data-card-id={card.id} className={`relative rounded-2xl border border-gray-700/70 bg-gray-900/40 backdrop-blur-sm shadow-[0_10px_26px_rgba(0,0,0,0.28)] ${isActive ? "ring-1 ring-indigo-400/35" : ""}`}>
          <div className="flex items-center justify-between px-2 sm:px-3 py-1.5 border-b border-gray-700/60">
            {card.status === "complete" ? (
              <button
                onClick={() => collapseCard(card.id)}
                className="flex items-center gap-1 sm:gap-1.5 text-xs text-gray-400 min-w-0 hover:text-gray-200 active:text-gray-100 transition-all duration-150"
                title="Collapse card"
              >
                <svg className="h-3 w-3 shrink-0 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                <span>{icon}</span>
                <span className="truncate">{getCardLabel(card, effectiveType)}</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-gray-400 min-w-0">
                <span>{icon}</span>
                <span className="truncate">{getCardLabel(card, effectiveType)}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              {card.role === "assistant" && card.status === "complete" && (
                <button
                  onClick={() => setShowCodeDialog(true)}
                  className="text-[10px] min-h-[28px] min-w-[28px] sm:min-w-0 px-1 sm:px-1.5 py-0.5 rounded-full border border-gray-600/50 text-gray-500 hover:text-indigo-300 hover:border-indigo-500/50 active:bg-indigo-500/15 active:scale-[0.95] transition-all duration-150 flex items-center justify-center gap-1"
                  title="Enhance with Claude Code"
                >
                  <svg className="h-3.5 w-3.5 sm:h-3 sm:w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                  <span className="hidden sm:inline">Code</span>
                </button>
              )}
              {canResearch && (
                <button
                  onClick={() => {
                    const data = (isAppView ? card.appData : card.data) as Record<string, unknown> | undefined;
                    const dataTopic = typeof data?.topic === "string" ? data.topic
                      : typeof data?.title === "string" ? data.title
                      : typeof data?.query === "string" ? data.query : null;
                    if (dataTopic) {
                      sendMessage(`Research ${dataTopic}`);
                    } else {
                      const text = (card.text ?? "").trim();
                      const topic = text.length > 200 ? text.slice(0, 200) : text;
                      sendMessage(`Research this: ${topic}`);
                    }
                  }}
                  className="text-[10px] min-h-[28px] min-w-[28px] sm:min-w-0 px-1 sm:px-1.5 py-0.5 rounded-full border border-gray-600/50 text-gray-500 hover:text-cyan-300 hover:border-cyan-500/50 active:bg-cyan-500/15 active:scale-[0.95] transition-all duration-150 flex items-center justify-center gap-1"
                  title="Deep research on this topic"
                >
                  <svg className="h-3.5 w-3.5 sm:h-3 sm:w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  <span className="hidden sm:inline">Research</span>
                </button>
              )}
              {!isShareable && card.role === "assistant" && card.status === "complete" && !!card.text && card.type !== "shell" && card.type !== "terminal" && (
                <ContentExportMenu card={card} />
              )}
              {isShareable && card.status === "complete" && <ExportButton card={card} />}
              {isShareable && card.status === "complete" && <PinButton cardId={card.id} />}
              {(card.enhanceStatus === "ready" || isDeepBuilding || orchHasBespokeUI) && <ViewToggle card={card} />}
              {canEnhance && <EnhanceButton card={card} />}
              {statusLabel !== "ready" && (
                <div className={`text-[10px] uppercase tracking-wide px-1.5 sm:px-2 py-0.5 rounded-full border ${statusTone}`}>
                  {statusLabel}
                </div>
              )}
            </div>
          </div>
          {isDeepBuildAppView ? (
            <DeepResearchBuildView text={card.buildTerminalText ?? ""} />
          ) : orchShowTerminal ? (
            <OrchestrationTerminalView
              text={card.buildTerminalText ?? ""}
              isComplete={orchComplete}
            />
          ) : orchShowBespoke ? (
            <Renderer
              card={{ ...card, data: card.appData, generatedUI: card.appGeneratedUI, cardMode: card.appCardMode }}
              isActive={isActive}
              onAction={handleAction}
            />
          ) : (
            <Renderer
              card={renderCard}
              isActive={isActive}
              onAction={handleAction}
            />
          )}
          {isAppView && card.appBuildSummary && !buildSummaryDismissed && (
            <BuildSummaryBanner
              summary={card.appBuildSummary}
              onDismiss={() => setBuildSummaryDismissed(true)}
            />
          )}
          {card.steps && card.steps.length > 1 && (
            <AgentSteps steps={card.steps} />
          )}
          {card.role === "assistant" && card.status === "complete" && card.type === "chat" && !card.generatedUI && !isAppView && !isLoading && (
            <CapabilityDiscoveryBar card={card} />
          )}
          {isAppView && !isLoading && (
            <RefineFooter
              cardId={card.id}
              onRefine={(instruction) => sendCardAction(card.id, "refine", { instruction })}
              onImproveWithCode={(instruction) => sendCardAction(card.id, "improve_with_code", { instruction })}
            />
          )}
          {isLoading && card.type !== "terminal" && card.type !== "shell" && <CardLoadingOverlay action={loadingLabel} />}
        </div>
      )}

      {showCodeDialog && (
        <CodeInvestigateDialog
          cardId={card.id}
          onClose={() => setShowCodeDialog(false)}
        />
      )}
    </div>
  );
}
