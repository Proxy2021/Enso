/**
 * BackgroundTaskBar — compact floating bar above the chat input showing
 * active long-running tasks. Lets the user keep chatting while tasks
 * run, with one-tap scroll-to-card navigation.
 *
 * Only shows for cards that are actively streaming with their own
 * visual progress (terminal, orchestration, deep research builds).
 * Normal agent responses use the typing indicator instead.
 */

import { useChatStore } from "../store/chat";
import { isOrchestrationCardData } from "@shared/types";
import { useElapsedTime, formatElapsed } from "../lib/useElapsedTime";
import { t as translate } from "../lib/i18n";

type BackgroundTask = {
  cardId: string;
  label: string;
  type: "claude_code" | "orchestration" | "build" | "deep_research" | "shell";
};

/** Derive active background tasks from card state. */
function useBackgroundTasks(): BackgroundTask[] {
  const cardOrder = useChatStore((s) => s.cardOrder);
  const cards = useChatStore((s) => s.cards);

  const tasks: BackgroundTask[] = [];
  for (const id of cardOrder) {
    const card = cards[id];
    if (!card || card.status !== "streaming") continue;

    // Terminal card (Claude Code session)
    if (card.type === "terminal" && card.toolMeta?.toolId === "claude-code") {
      tasks.push({
        cardId: id,
        label: card.operation?.label || translate("task.claudeCode"),
        type: "claude_code",
      });
      continue;
    }

    // Shell card
    if (card.type === "shell") {
      tasks.push({ cardId: id, label: translate("task.shell"), type: "shell" });
      continue;
    }

    // Orchestration card (executing/planning)
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
        });
      }
      continue;
    }

    // Deep research building
    if (card.deepResearchStatus === "building") {
      tasks.push({
        cardId: id,
        label: translate("task.deepResearch"),
        type: "deep_research",
      });
      continue;
    }
  }
  return tasks;
}

function scrollToCard(cardId: string) {
  const el = document.getElementById(`card-${cardId}`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
}

function TaskPill({ task }: { task: BackgroundTask }) {
  const elapsed = useElapsedTime();

  const colors: Record<string, string> = {
    claude_code: "border-violet-500/40 bg-violet-500/10",
    orchestration: "border-blue-500/40 bg-blue-500/10",
    build: "border-amber-500/40 bg-amber-500/10",
    deep_research: "border-cyan-500/40 bg-cyan-500/10",
    shell: "border-green-500/40 bg-green-500/10",
  };
  const dotColors: Record<string, string> = {
    claude_code: "bg-violet-400",
    orchestration: "bg-blue-400",
    build: "bg-amber-400",
    deep_research: "bg-cyan-400",
    shell: "bg-green-400",
  };

  return (
    <button
      onClick={() => scrollToCard(task.cardId)}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] transition-all duration-150 hover:brightness-125 active:scale-[0.97] ${colors[task.type] || "border-gray-600/40 bg-gray-800/60"}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${dotColors[task.type] || "bg-gray-400"}`} />
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${dotColors[task.type] || "bg-gray-400"}`} />
      </span>
      <span className="text-gray-300 font-medium truncate max-w-[120px]">{task.label}</span>
      <span className="text-gray-500 tabular-nums">{formatElapsed(elapsed)}</span>
    </button>
  );
}

export default function BackgroundTaskBar() {
  const tasks = useBackgroundTasks();
  if (tasks.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-gray-800/60 bg-gray-950/80 overflow-x-auto">
      {tasks.map((task) => (
        <TaskPill key={task.cardId} task={task} />
      ))}
    </div>
  );
}
