import { useState, useEffect, useCallback } from "react";
import { useChatStore } from "../store/chat";
import type { ProactiveSuggestionAction } from "@shared/types";

const PILLAR_COLORS: Record<string, string> = {
  project_health: "border-blue-500/40 bg-blue-500/8",
  research: "border-purple-500/40 bg-purple-500/8",
  communication: "border-amber-500/40 bg-amber-500/8",
  workflow: "border-emerald-500/40 bg-emerald-500/8",
  learning: "border-cyan-500/40 bg-cyan-500/8",
  digest: "border-zinc-500/40 bg-zinc-500/8",
  ambient: "border-zinc-500/40 bg-zinc-500/8",
};

const PILLAR_TEXT: Record<string, string> = {
  project_health: "text-blue-300",
  research: "text-purple-300",
  communication: "text-amber-300",
  workflow: "text-emerald-300",
  learning: "text-cyan-300",
  digest: "text-zinc-300",
  ambient: "text-zinc-300",
};

/**
 * A lightweight dismissible nudge banner shown above ChatInput.
 * Shows at most 1 suggestion per session from the proactive engine.
 * Only appears if the user has been on the page for at least 5 seconds
 * and there are suggestions available beyond what the WelcomeCard shows.
 */
export default function ProactiveNudgeBanner() {
  const suggestions = useChatStore((s) => s.proactiveSuggestions);
  const cardOrder = useChatStore((s) => s.cardOrder);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const runApp = useChatStore((s) => s.runApp);
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);

  // Delay showing the nudge to avoid being annoying on page load
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 8000);
    return () => clearTimeout(timer);
  }, []);

  const handleAction = useCallback((action: ProactiveSuggestionAction, pillar: string) => {
    const ws = useChatStore.getState()._wsClient;
    ws?.send({ type: "proactive.accept", suggestionPillar: pillar } as never);

    switch (action.type) {
      case "send_message": sendMessage(action.message); break;
      case "run_app": runApp(action.appId); break;
      case "deep_research": sendMessage(`/research ${action.topic}`); break;
      case "open_project": sendMessage(`Open project at ${action.path}`); break;
    }
    setDismissed(true);
  }, [sendMessage, runApp]);

  const handleDismiss = useCallback((id: string, pillar: string) => {
    const ws = useChatStore.getState()._wsClient;
    ws?.send({ type: "proactive.dismiss", suggestionId: id, suggestionPillar: pillar } as never);
    setDismissed(true);
  }, []);

  // Don't show if dismissed, not ready, no cards yet (WelcomeCard is showing), or not enough suggestions
  if (dismissed || !visible) return null;
  // Only show nudge when user has started chatting (welcome card handled the initial suggestions)
  if (cardOrder.length < 2) return null;
  // Pick the 4th suggestion (first 3 shown on welcome card)
  const nudge = suggestions[3];
  if (!nudge) return null;

  const color = PILLAR_COLORS[nudge.pillar] || PILLAR_COLORS.ambient;
  const textColor = PILLAR_TEXT[nudge.pillar] || PILLAR_TEXT.ambient;

  return (
    <div className={`mx-3 mb-1 px-3 py-2 rounded-lg border ${color} flex items-center gap-3 animate-in slide-in-from-bottom-2 duration-300`}>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium ${textColor} truncate`}>{nudge.title}</p>
        <p className="text-[10px] text-gray-500 truncate">{nudge.description}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => handleAction(nudge.action as ProactiveSuggestionAction, nudge.pillar)}
          className={`px-2.5 py-1 text-[10px] rounded border border-gray-600/50 bg-gray-800/50 ${textColor} hover:bg-gray-700/60 active:scale-[0.96] transition-all`}
        >
          Go
        </button>
        <button
          onClick={() => handleDismiss(nudge.id, nudge.pillar)}
          className="text-gray-600 hover:text-gray-400 text-xs transition-colors p-0.5"
          title="Dismiss"
        >
          &#x2715;
        </button>
      </div>
    </div>
  );
}
