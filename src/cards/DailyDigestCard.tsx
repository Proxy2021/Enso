import { useState, useEffect, useRef } from "react";
import { useChatStore } from "../store/chat";
import type { CardRendererProps } from "./types";
import type { DailyDigestDTO, DigestItemDTO, ProactiveSuggestionAction } from "@shared/types";

const CATEGORY_STYLES: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  project: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-300", icon: "folder" },
  research: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-300", icon: "search" },
  communication: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-300", icon: "mail" },
  workflow: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-300", icon: "zap" },
  learning: { bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-300", icon: "book" },
  change: { bg: "bg-zinc-500/10", border: "border-zinc-500/30", text: "text-zinc-300", icon: "refresh-cw" },
};

const PRIORITY_DOTS: Record<string, string> = {
  urgent: "bg-red-400",
  high: "bg-orange-400",
  medium: "bg-blue-400",
  low: "bg-zinc-500",
};

const ICON_MAP: Record<string, string> = {
  "folder-plus": "\uD83D\uDCC2",
  sparkles: "\u2728",
  archive: "\uD83D\uDDC4\uFE0F",
  microscope: "\uD83D\uDD2C",
  search: "\uD83D\uDD0D",
  mail: "\u2709\uFE0F",
  calendar: "\uD83D\uDCC5",
  lightbulb: "\uD83D\uDCA1",
  bookmark: "\uD83D\uDD16",
  shield: "\uD83D\uDEE1\uFE0F",
  "file-text": "\uD83D\uDCC4",
  "arrow-right": "\u27A1\uFE0F",
  container: "\uD83D\uDCE6",
  "git-branch": "\uD83D\uDD00",
  "upload-cloud": "\u2601\uFE0F",
  package: "\uD83D\uDCE6",
  "graduation-cap": "\uD83C\uDF93",
  "trending-up": "\uD83D\uDCC8",
  "check-circle": "\u2705",
  "hard-drive": "\uD83D\uDDB4",
  "alert-triangle": "\u26A0\uFE0F",
  "refresh-cw": "\uD83D\uDD04",
  folder: "\uD83D\uDCC1",
  zap: "\u26A1",
  book: "\uD83D\uDCD6",
};

function DigestItemRow({ item, onAction }: { item: DigestItemDTO; onAction: (action: ProactiveSuggestionAction) => void }) {
  const style = CATEGORY_STYLES[item.category] || CATEGORY_STYLES.change;
  const iconEmoji = ICON_MAP[item.icon] || "\u2022";

  return (
    <div className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${style.border} ${style.bg} group`}>
      <div className="flex items-center gap-2 shrink-0 mt-0.5">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${PRIORITY_DOTS[item.priority] || PRIORITY_DOTS.low}`} />
        <span className="text-sm">{iconEmoji}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-medium ${style.text}`}>{item.title}</div>
        <div className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{item.description}</div>
      </div>
      {item.action && item.action.type !== "dismiss" && (
        <button
          onClick={() => onAction(item.action!)}
          className="shrink-0 text-[10px] px-2 py-1 rounded border border-gray-600/50 bg-gray-800/50 text-gray-300 hover:bg-gray-700/60 hover:text-gray-100 hover:border-gray-500/60 active:scale-[0.96] transition-all opacity-0 group-hover:opacity-100"
        >
          Go
        </button>
      )}
    </div>
  );
}

export default function DailyDigestCard({ card }: CardRendererProps) {
  const [digest, setDigest] = useState<DailyDigestDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const runApp = useChatStore((s) => s.runApp);
  const lastTs = useRef(0);

  useEffect(() => {
    // Try to extract from card data first
    const cardData = card.data as Record<string, unknown> | undefined;
    if (cardData?.dailyDigest) {
      setDigest(cardData.dailyDigest as DailyDigestDTO);
      setLoading(false);
      return;
    }

    // Subscribe to proactive updates via Zustand store
    const unsub = useChatStore.subscribe((state) => {
      const update = state._proactiveUpdate;
      if (!update || (update._ts ?? 0) === lastTs.current) return;
      lastTs.current = update._ts ?? 0;
      if (update.digest) {
        setDigest(update.digest as DailyDigestDTO);
        setLoading(false);
      }
    });

    // Request digest from server
    const ws = useChatStore.getState()._wsClient;
    ws?.send({ type: "proactive.get_digest" } as never);

    return unsub;
  }, [card.data]);

  function handleAction(action: ProactiveSuggestionAction) {
    switch (action.type) {
      case "send_message":
        sendMessage(action.message);
        break;
      case "run_app":
        runApp(action.appId);
        break;
      case "deep_research":
        sendMessage(`/research ${action.topic}`);
        break;
      case "open_project":
        sendMessage(`Open project at ${action.path}`);
        break;
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-6 text-center">
        <div className="w-5 h-5 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin mx-auto mb-2" />
        <p className="text-xs text-gray-500">Loading your daily digest...</p>
      </div>
    );
  }

  if (!digest || digest.items.length === 0) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-sm text-gray-400">No updates for today. You're all caught up!</p>
        <p className="text-xs text-gray-500 mt-1">Enable more data sources in Settings to get personalized suggestions.</p>
      </div>
    );
  }

  // Group items by category
  const grouped = new Map<string, DigestItemDTO[]>();
  for (const item of digest.items) {
    const arr = grouped.get(item.category) || [];
    arr.push(item);
    grouped.set(item.category, arr);
  }

  const categoryLabels: Record<string, string> = {
    project: "Projects",
    research: "Research",
    communication: "Communications",
    workflow: "Workflow",
    learning: "Learning",
    change: "Changes",
  };

  return (
    <div className="px-3 py-3">
      <div className="mb-3">
        <p className="text-sm text-gray-200">{digest.greeting}</p>
        <p className="text-[10px] text-gray-500 mt-0.5">{digest.date}</p>
      </div>

      <div className="space-y-3">
        {Array.from(grouped.entries()).map(([category, items]) => (
          <div key={category}>
            <div className="flex items-center gap-1.5 mb-1.5 px-1">
              <span className={`text-[10px] font-medium uppercase tracking-wider ${(CATEGORY_STYLES[category] || CATEGORY_STYLES.change).text}`}>
                {categoryLabels[category] || category}
              </span>
              <span className="text-[9px] text-gray-600">({items.length})</span>
            </div>
            <div className="space-y-1.5">
              {items.map((item, i) => (
                <DigestItemRow key={`${category}-${i}`} item={item} onAction={handleAction} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 pt-2 border-t border-gray-800/50 flex items-center justify-between">
        <span className="text-[10px] text-gray-600">{digest.items.length} items from your profile</span>
        <button
          onClick={() => sendMessage("What else can you help me with today?")}
          className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          Ask for more
        </button>
      </div>
    </div>
  );
}
