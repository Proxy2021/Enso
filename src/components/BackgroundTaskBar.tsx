/**
 * BackgroundTaskBar — compact floating bar above the chat input showing
 * active long-running tasks. Lets the user keep chatting while tasks
 * run, with one-tap scroll-to-card navigation.
 *
 * Only shows for cards that are actively streaming with their own
 * visual progress (terminal, orchestration, deep research builds).
 * Normal agent responses use the typing indicator instead.
 */

import { useState, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { useChatStore } from "../store/chat";
import { isOrchestrationCardData } from "@shared/types";
import { formatElapsed } from "../lib/useElapsedTime";
import { t as translate } from "../lib/i18n";
import { TOOL_ID_CLAUDE_CODE } from "../lib/constants";

type BackgroundTask = {
  cardId: string;
  label: string;
  type: "claude_code" | "orchestration" | "build" | "deep_research" | "shell" | "podcast";
  startedAt: number;
  percent?: number;
  /** For podcast tasks — lets the pill trigger re-open via apps.run. */
  entityId?: string;
};

/** Derive active background tasks from card state. */
function useBackgroundTasks(): BackgroundTask[] {
  const { cardOrder, cards, deepJobs } = useChatStore(
    useShallow((s) => ({ cardOrder: s.cardOrder, cards: s.cards, deepJobs: s.deepJobs }))
  );

  const tasks: BackgroundTask[] = [];

  // Deep-content (podcast) jobs — global, not card-scoped.
  // Keyed by `${entityId}::${variant}` so discussion + interview pills coexist.
  for (const key of Object.keys(deepJobs)) {
    const job = deepJobs[key];
    if (!job || job.status !== "running") continue;
    const icon = job.variant === "interview" ? "🎤" : "🎙️";
    tasks.push({
      cardId: job.sourceCardId || `deepjob:${key}`,
      entityId: job.entityId,
      label: `${icon} ${job.title}`,
      type: "podcast",
      startedAt: job.startedAt,
      percent: job.percent,
    });
  }

  for (const id of cardOrder) {
    const card = cards[id];
    if (!card || card.status !== "streaming") continue;

    const ts = card.createdAt ?? Date.now();

    if (card.type === "terminal" && card.toolMeta?.toolId === TOOL_ID_CLAUDE_CODE) {
      tasks.push({
        cardId: id,
        label: card.operation?.label || translate("task.claudeCode"),
        type: "claude_code",
        startedAt: ts,
      });
      continue;
    }

    if (card.type === "shell") {
      tasks.push({ cardId: id, label: translate("task.shell"), type: "shell", startedAt: ts });
      continue;
    }

    if (card.type === "orchestration") {
      const orchData = isOrchestrationCardData(card.data) ? card.data : undefined;
      const plan = orchData?.orchestrationProgress?.plan || orchData?.orchestrationPlan;
      const status = plan?.status;
      if (status === "executing" || status === "planning" || status === "paused") {
        const completed = plan?.tasks?.filter((t) => t.status === "completed").length ?? 0;
        const total = plan?.tasks?.length ?? 0;
        tasks.push({
          cardId: id,
          label: status === "planning" ? translate("task.planning") : `${translate("task.mission")} ${completed}/${total}`,
          type: "orchestration",
          startedAt: ts,
        });
      }
      continue;
    }

    if (card.deepResearchStatus === "building") {
      tasks.push({
        cardId: id,
        label: translate("task.deepResearch"),
        type: "deep_research",
        startedAt: ts,
      });
      continue;
    }
  }
  return tasks;
}

function scrollToCard(cardId: string) {
  const globalScroll = (window as unknown as Record<string, unknown>).__ensoScrollToCard as ((id: string) => void) | undefined;
  if (globalScroll) {
    globalScroll(cardId);
  } else {
    const el = document.getElementById(`card-${cardId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

const PILL_COLORS: Record<string, string> = {
  claude_code: "border-violet-500/40 bg-violet-500/10",
  orchestration: "border-blue-500/40 bg-blue-500/10",
  build: "border-amber-500/40 bg-amber-500/10",
  deep_research: "border-cyan-500/40 bg-cyan-500/10",
  shell: "border-green-500/40 bg-green-500/10",
  podcast: "border-purple-500/40 bg-purple-500/10",
};
const DOT_COLORS: Record<string, string> = {
  claude_code: "bg-violet-400",
  orchestration: "bg-blue-400",
  build: "bg-amber-400",
  deep_research: "bg-cyan-400",
  shell: "bg-green-400",
  podcast: "bg-purple-400",
};

export default function BackgroundTaskBar() {
  const tasks = useBackgroundTasks();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (tasks.length === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [tasks.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (tasks.length === 0) return null;

  const now = Date.now();

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-gray-800/60 bg-gray-950/80 overflow-x-auto">
      {tasks.map((task) => {
        void tick;
        const elapsed = Math.floor((now - (task.startedAt ?? now)) / 1000);
        const handleClick = () => scrollToCard(task.cardId);
        return (
          <button
            key={task.cardId}
            onClick={handleClick}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] transition-all duration-150 hover:brightness-125 active:scale-[0.97] ${PILL_COLORS[task.type] || "border-gray-600/40 bg-gray-800/60"}`}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${DOT_COLORS[task.type] || "bg-gray-400"}`} />
              <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${DOT_COLORS[task.type] || "bg-gray-400"}`} />
            </span>
            <span className="text-gray-300 font-medium truncate max-w-[140px]">{task.label}</span>
            {typeof task.percent === "number" && task.percent > 0 && (
              <span className="text-gray-400 tabular-nums">{Math.round(task.percent)}%</span>
            )}
            <span className="text-gray-500 tabular-nums">{formatElapsed(elapsed)}</span>
          </button>
        );
      })}
    </div>
  );
}
