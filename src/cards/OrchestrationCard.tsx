import React, { useState, useEffect, useRef } from "react";
import { useChatStore } from "../store/chat";
import { useElapsedTime, formatElapsed } from "../lib/useElapsedTime";
import TerminalContent from "../components/TerminalContent";
import TaskSummaryPanel, { verdictColor, ratingColor, IMPACT_DOT, PRIORITY_STYLE } from "../components/TaskSummaryPanel";
import { useT } from "../lib/i18n";
import type { CardRendererProps } from "./types";
import {
  isOrchestrationCardData,
} from "@shared/types";
import type {
  OrchestrationPlan,
  OrchestrationProgress,
  OrchestrationTask,
  AgentRole,
} from "@shared/types";
import ReactToTL from "../components/ReactToTL";

type Phase = "input" | "planning" | "review" | "executing" | "complete" | "error";

const ROLE_EMOJI: Record<AgentRole, string> = {
  researcher: "\uD83D\uDD0D",
  architect: "\uD83D\uDCD0",
  builder: "\uD83D\uDD28",
  coder: "\uD83D\uDCBB",
  reviewer: "\u2705",
};

const ROLE_LABEL_KEYS: Record<AgentRole, string> = {
  researcher: "orchestration.role.researcher",
  architect: "orchestration.role.architect",
  builder: "orchestration.role.builder",
  coder: "orchestration.role.coder",
  reviewer: "orchestration.role.reviewer",
};

function OrchestrationCardInner({ card }: CardRendererProps) {
  const orchData = isOrchestrationCardData(card.data) ? card.data : undefined;
  const plan = orchData?.orchestrationPlan;
  const progress = orchData?.orchestrationProgress;
  const phase = derivedPhase(progress, plan);
  const currentPlan = progress?.plan || plan;
  const taskTerminals = card.taskTerminals;

  return (
    <div className="px-4 py-3">
      {phase === "input" && <InputPhase cardId={card.id} />}
      {phase === "planning" && <PlanningPhase goal={currentPlan?.goal} />}
      {phase === "review" && currentPlan && <ReviewPhase plan={currentPlan} />}
      {phase === "executing" && currentPlan && <ExecutingPhase plan={currentPlan} taskTerminals={taskTerminals} progress={progress} />}
      {phase === "complete" && currentPlan && <CompletePhase plan={currentPlan} taskTerminals={taskTerminals} />}
      {phase === "error" && <ErrorPhase error={progress?.error} plan={currentPlan} />}
    </div>
  );
}

function derivedPhase(progress?: OrchestrationProgress, plan?: OrchestrationPlan): Phase {
  if (!progress && !plan) return "input";

  const currentPlan = progress?.plan || plan;
  if (!currentPlan) return "input";

  switch (currentPlan.status) {
    case "planning": return "planning";
    case "reviewing": return "executing"; // Auto-execute: skip review phase
    case "executing": return "executing";
    case "paused":
      return "executing";
    case "completed": return "complete";
    case "failed": return "error";
    default: return "input";
  }
}

// ── Phase: Input ──

function InputPhase({ cardId }: { cardId: string }) {
  const orchGoal = useChatStore((s) => {
    const card = s.cards[cardId];
    const d = card?.data as Record<string, unknown> | undefined;
    return (d?.orchestrationGoal as string) || "";
  });
  const [text, setText] = useState(orchGoal);
  const startOrchestration = useChatStore((s) => s.startOrchestration);
  const { t } = useT();

  function handleSubmit() {
    if (!text.trim()) return;
    startOrchestration(cardId, text.trim());
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{"\u26A1"}</span>
        <h3 className="text-sm font-semibold text-gray-200">{t("orchestration.title")}</h3>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        {t("orchestration.description")}
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("orchestration.placeholder")}
        rows={4}
        className="w-full bg-gray-800/60 border border-gray-700/60 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500 resize-none focus:outline-none focus:border-blue-500/50"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
        }}
      />
      <div className="flex justify-between items-center mt-2">
        <span className="text-[10px] text-gray-600">{t("orchestration.submitHint")}</span>
        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="px-4 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-400 active:scale-[0.97] text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
        >
          {t("orchestration.orchestrate")}
        </button>
      </div>
    </div>
  );
}

// ── Phase: Planning ──

function PlanningPhase({ goal }: { goal?: string }) {
  const { t } = useT();
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{"\u26A1"}</span>
        <h3 className="text-sm font-semibold text-gray-200">{t("orchestration.title")}</h3>
      </div>
      {goal && (
        <div className="mb-3 p-2 rounded-lg bg-gray-800/30 border border-gray-700/30">
          <p className="text-xs text-gray-300 line-clamp-2">{goal}</p>
        </div>
      )}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Spinner />
        {t("orchestration.planning")}
      </div>
      <p className="text-[11px] text-gray-500 mt-2">
        {t("orchestration.planningDetail")}
        <br />
        {t("orchestration.planningHint")}
      </p>
    </div>
  );
}

// ── Phase: Review ──

function ReviewPhase({ plan }: { plan: OrchestrationPlan }) {
  const approveOrchestration = useChatStore((s) => s.approveOrchestration);
  const cancelOrchestration = useChatStore((s) => s.cancelOrchestration);
  const { t } = useT();

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{"\u26A1"}</span>
        <h3 className="text-sm font-semibold text-gray-200">{t("orchestration.missionPlan")}</h3>
      </div>

      {/* Goal summary */}
      <div className="mb-3 p-2 rounded-lg bg-gray-800/30 border border-gray-700/30">
        <p className="text-xs text-gray-300 line-clamp-2">{plan.goal}</p>
      </div>

      <p className="text-xs text-gray-400 mb-3">
        {t("orchestration.reviewDescription").replace("{taskCount}", String(plan.tasks.length)).replace("{agentCount}", String(plan.agents.length))}
      </p>

      {/* Agent Team */}
      <div className="mb-3 p-2.5 rounded-lg bg-gray-800/40 border border-gray-700/40">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{t("orchestration.team")}</div>
        <div className="flex flex-wrap gap-2">
          {plan.agents.map((agent) => (
            <div key={agent.agentId} className="flex items-center gap-1.5 text-xs text-gray-300 px-2 py-1 rounded-md bg-gray-700/30">
              <span>{ROLE_EMOJI[agent.role]}</span>
              <span>{t(ROLE_LABEL_KEYS[agent.role])}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Task Graph */}
      <div className="space-y-2">
        {plan.tasks.map((task, i) => (
          <TaskRow key={task.taskId} task={task} index={i} showDescription />
        ))}
      </div>

      <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-700/40">
        <button
          onClick={() => cancelOrchestration(plan.orchestrationId)}
          className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 transition-all duration-150"
        >
          {t("orchestration.cancel")}
        </button>
        <button
          onClick={() => approveOrchestration(plan.orchestrationId)}
          className="px-4 py-1.5 text-xs font-medium rounded-lg bg-green-600 hover:bg-green-500 active:bg-green-400 active:scale-[0.97] text-white transition-all duration-150"
        >
          {t("orchestration.executePlan")}
        </button>
      </div>
    </div>
  );
}

// ── Phase: Executing ──

type ExecutingView = "tasks" | "terminals";

function ExecutingPhase({ plan, taskTerminals, progress }: { plan: OrchestrationPlan; taskTerminals?: Record<string, { text: string; status: string }>; progress?: OrchestrationProgress }) {
  const approveOrchestration = useChatStore((s) => s.approveOrchestration);
  const pauseOrchestration = useChatStore((s) => s.pauseOrchestration);
  const resumeOrchestration = useChatStore((s) => s.resumeOrchestration);
  const { t } = useT();

  const [view, setView] = useState<ExecutingView>("tasks");
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [lastCompletedTaskId, setLastCompletedTaskId] = useState<string | null>(null);

  // Track auto-expand for the most recently completed task
  useEffect(() => {
    if (progress?.eventType === "task_completed" && progress.taskId) {
      setLastCompletedTaskId(progress.taskId);
    }
  }, [progress?.eventType, progress?.taskId]);

  const completed = plan.tasks.filter((t) => t.status === "completed").length;
  const running = plan.tasks.filter((t) => t.status === "running").length;
  const failed = plan.tasks.filter((t) => t.status === "failed").length;
  const total = plan.tasks.length;
  const isPaused = plan.status === "paused";
  const awaitingApproval = plan.tasks.filter((t) => t.status === "awaiting_approval");
  const pct = total > 0 ? Math.round(((completed + running * 0.5) / total) * 100) : 0;
  const elapsed = useElapsedTime();

  // Collect tasks that have terminal data, sorted: running first, then by plan order
  const terminalTasks = plan.tasks.filter((t) => taskTerminals?.[t.taskId]?.text);
  const runningTerminals = terminalTasks.filter((t) => t.status === "running");
  const doneTerminals = terminalTasks.filter((t) => t.status !== "running");
  const orderedTerminals = [...runningTerminals, ...doneTerminals];

  // Auto-select the first running terminal, or the latest one
  useEffect(() => {
    if (view !== "terminals") return;
    if (runningTerminals.length > 0) {
      // If current selection isn't running, switch to a running one
      const currentIsRunning = runningTerminals.some((t) => t.taskId === activeTerminalId);
      if (!currentIsRunning) {
        setActiveTerminalId(runningTerminals[0].taskId);
      }
    } else if (!activeTerminalId && orderedTerminals.length > 0) {
      setActiveTerminalId(orderedTerminals[0].taskId);
    }
  }, [view, runningTerminals.length, orderedTerminals.length]);

  const activeTerminal = activeTerminalId ? taskTerminals?.[activeTerminalId] : null;
  const activeTask = activeTerminalId ? plan.tasks.find((t) => t.taskId === activeTerminalId) : null;

  return (
    <div>
      {/* Compact header with view toggle */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-sm">{"\u26A1"}</span>
        <h3 className="text-[11px] font-semibold text-gray-200 truncate">
          {isPaused ? t("orchestration.paused") : t("orchestration.mission")}
        </h3>
        <span className="text-[9px] text-gray-500 tabular-nums">{formatElapsed(elapsed)}</span>
        <span className="text-[9px] text-gray-500 ml-auto whitespace-nowrap">{completed}/{total}</span>

        {/* View toggle: Tasks | Terminals */}
        <div className="inline-flex rounded-full border border-gray-600/50 bg-gray-800/60 p-0.5 ml-1.5">
          <button
            onClick={() => setView("tasks")}
            className={`text-[10px] sm:text-[9px] px-2.5 sm:px-2 py-1 sm:py-0.5 rounded-full transition-all duration-150 active:scale-[0.95] ${
              view === "tasks" ? "bg-gray-600/60 text-gray-200" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {t("orchestration.tasks")}
          </button>
          <button
            onClick={() => setView("terminals")}
            className={`text-[10px] sm:text-[9px] px-2.5 sm:px-2 py-1 sm:py-0.5 rounded-full transition-all duration-150 active:scale-[0.95] flex items-center gap-1 ${
              view === "terminals" ? "bg-violet-500/30 text-violet-200" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {t("orchestration.terminals")}
            {runningTerminals.length > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            )}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-2.5">
        <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              running > 0 ? "bg-blue-500 animate-pulse" : "bg-blue-500"
            }`}
            style={{ width: `${Math.max(pct, running > 0 ? 3 : 0)}%` }}
          />
        </div>
      </div>

      {/* Approval gate (compact) */}
      {awaitingApproval.length > 0 && (
        <div className="mb-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <p className="text-[10px] font-medium text-amber-200 mb-1">{"\u26A0\uFE0F"} {t("orchestration.approvalNeeded")}</p>
          {awaitingApproval.map((t) => (
            <p key={t.taskId} className="text-[9px] text-amber-300/70 truncate">{t.title}</p>
          ))}
          <button
            onClick={() => approveOrchestration(plan.orchestrationId, awaitingApproval.map((t) => t.taskId))}
            className="text-[9px] px-2 py-0.5 mt-1 rounded bg-amber-600 hover:bg-amber-500 active:bg-amber-400 active:scale-[0.97] text-white transition-all duration-150"
          >
            {t("orchestration.approve")}
          </button>
        </div>
      )}

      {/* Tasks View: compact pipeline with expandable terminals + phase groups */}
      {view === "tasks" && (
        <div className="space-y-0.5">
          {groupTasksByPhase(plan.tasks).map((group) => (
            <div key={group.phase || "ungrouped"}>
              {group.phase && (
                <div className="flex items-center gap-2 mt-2.5 mb-1 first:mt-0">
                  <div className="h-px flex-1 bg-gray-700/40" />
                  <span className="text-[9px] text-gray-500 uppercase tracking-wider font-medium whitespace-nowrap">
                    {group.phase}
                  </span>
                  <div className="h-px flex-1 bg-gray-700/40" />
                </div>
              )}
              {group.tasks.map((task, i) => (
                <CompactTaskRow
                  key={task.taskId}
                  task={task}
                  index={i}
                  terminalData={taskTerminals?.[task.taskId]}
                  autoExpand={task.taskId === lastCompletedTaskId}
                  onOpenTerminal={(taskId) => {
                    setActiveTerminalId(taskId);
                    setView("terminals");
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Terminals View: tabbed terminal sessions */}
      {view === "terminals" && (
        <div>
          {orderedTerminals.length === 0 ? (
            <div className="text-center py-6 text-xs text-gray-500">
              {t("orchestration.noSessions")}
            </div>
          ) : (
            <>
              {/* Terminal tab bar — scrollable with touch-friendly targets */}
              <div className="flex gap-0.5 overflow-x-auto pb-1 mb-1 scrollbar-none -mx-1 px-1">
                {orderedTerminals.map((task) => {
                  const isActive = task.taskId === activeTerminalId;
                  const isTaskRunning = task.status === "running";
                  return (
                    <button
                      key={task.taskId}
                      onClick={() => setActiveTerminalId(task.taskId)}
                      className={`flex items-center gap-1 whitespace-nowrap px-2.5 sm:px-2 py-1.5 sm:py-1 rounded-t-lg text-[10px] sm:text-[9px] transition-all duration-150 flex-shrink-0 active:scale-[0.97] ${
                        isActive
                          ? "bg-[#0d1117] text-gray-200 border border-b-0 border-gray-700/60"
                          : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/40 active:bg-gray-800/60"
                      }`}
                    >
                      {isTaskRunning && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />}
                      {!isTaskRunning && task.status === "completed" && <span className="text-green-400 flex-shrink-0">{"\u2713"}</span>}
                      {!isTaskRunning && task.status === "failed" && <span className="text-red-400 flex-shrink-0">{"\u2717"}</span>}
                      <span>{ROLE_EMOJI[task.agentRole]}</span>
                      <span className="max-w-[100px] sm:max-w-[120px] truncate">{shortTitle(task.title)}</span>
                    </button>
                  );
                })}
              </div>

              {/* Active terminal content */}
              {activeTerminal && activeTask && (
                <div className="rounded-lg border border-gray-700/50 overflow-hidden bg-[#0d1117]">
                  <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-700/40 bg-gray-800/30">
                    <span className="text-[10px]">{ROLE_EMOJI[activeTask.agentRole]}</span>
                    <span className="text-[10px] text-gray-300 truncate flex-1">{activeTask.title}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                      activeTask.status === "running"
                        ? "bg-blue-500/20 text-blue-300"
                        : activeTask.status === "completed"
                          ? "bg-green-500/15 text-green-400"
                          : "bg-red-500/15 text-red-400"
                    }`}>
                      {activeTask.status === "running" ? t("orchestration.live") : activeTask.status}
                    </span>
                  </div>
                  <TerminalContent
                    text={activeTerminal.text}
                    status={activeTerminal.status === "streaming" ? "streaming" : "complete"}
                    accentColor="violet"
                    maxHeightClass="max-h-[400px]"
                    showHeader={false}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Compact control */}
      <div className="mt-2 pt-1.5 border-t border-gray-700/30">
        {isPaused ? (
          <button
            onClick={() => resumeOrchestration(plan.orchestrationId)}
            className="w-full text-[10px] sm:text-[9px] py-2 sm:py-1 rounded bg-blue-600/80 hover:bg-blue-500 active:bg-blue-400 active:scale-[0.97] text-white transition-all duration-150"
          >
            {t("orchestration.resume")}
          </button>
        ) : (
          <button
            onClick={() => pauseOrchestration(plan.orchestrationId)}
            className="w-full text-[10px] sm:text-[9px] py-2 sm:py-1 rounded bg-gray-700/60 hover:bg-gray-600 active:bg-gray-500 active:scale-[0.97] text-gray-400 transition-all duration-150"
          >
            {t("orchestration.pause")}
          </button>
        )}
      </div>
    </div>
  );
}

/** Compact task row with expandable terminal/summary content for parallel tasks */
function CompactTaskRow({ task, index, terminalData, onOpenTerminal, autoExpand }: {
  task: OrchestrationTask;
  index: number;
  terminalData?: { text: string; status: string };
  onOpenTerminal?: (taskId: string) => void;
  autoExpand?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const userToggled = useRef(false);
  const { t } = useT();
  const hasTerminal = !!terminalData?.text;
  const hasSummary = task.status === "completed" && !!(task.structuredResult || task.resultSummary);
  const canExpand = hasTerminal || hasSummary;
  const [highlight, setHighlight] = useState(false);

  // Auto-expand on task completion
  useEffect(() => {
    if (autoExpand && !userToggled.current) {
      setExpanded(true);
      setHighlight(true);
      const timer = setTimeout(() => {
        if (!userToggled.current) setExpanded(false);
        setHighlight(false);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [autoExpand]);

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 py-2 sm:py-1 px-2 sm:px-1.5 rounded text-[11px] sm:text-[10px] transition-all duration-500 ${
          canExpand ? "cursor-pointer hover:bg-gray-700/30 active:bg-gray-700/50" : ""
        } ${
          highlight ? "bg-green-500/10" :
          task.status === "running" ? "bg-blue-500/10 text-gray-200" :
          task.status === "completed" ? "text-gray-400" :
          task.status === "failed" ? "text-red-400/80" :
          task.status === "blocked" ? "opacity-30 text-gray-500" :
          "text-gray-500"
        }`}
        onClick={() => {
          if (canExpand) {
            userToggled.current = true;
            setExpanded(!expanded);
          }
        }}
      >
        <span className="flex-shrink-0 w-4 sm:w-3.5 text-center">
          {task.status === "completed" ? (
            <span className="text-green-400">{"\u2713"}</span>
          ) : task.status === "failed" ? (
            <span className="text-red-400">{"\u2717"}</span>
          ) : task.status === "running" ? (
            <Spinner size="sm" />
          ) : task.status === "blocked" ? (
            <span>{"\u2298"}</span>
          ) : (
            <span>{index + 1}</span>
          )}
        </span>
        <span className="flex-shrink-0">{ROLE_EMOJI[task.agentRole]}</span>
        <span className="truncate flex-1">{task.title}</span>
        {/* Collapsed teaser for completed tasks with structured results */}
        {!expanded && hasSummary && task.structuredResult?.verdict && (
          <span className={`px-1 py-0.5 rounded-full text-[8px] font-medium border flex-shrink-0 ${verdictColor(task.structuredResult.verdict)}`}>
            {task.structuredResult.verdict}
          </span>
        )}
        {canExpand && (
          <span className="flex-shrink-0 flex items-center gap-1">
            {hasTerminal && onOpenTerminal && (
              <button
                onClick={(e) => { e.stopPropagation(); onOpenTerminal(task.taskId); }}
                className="text-[9px] sm:text-[8px] text-gray-500 hover:text-violet-300 active:text-violet-200 p-1 rounded transition-colors"
                title={t("orchestrationCard.openTerminal")}
              >
                {"\u2197"}
              </button>
            )}
            <span className="text-[9px] sm:text-[8px] text-gray-500">
              {expanded ? "\u25BC" : "\u25B6"}
            </span>
          </span>
        )}
      </div>
      {/* Expandable content: summary panel or terminal */}
      {expanded && hasSummary && (
        <div className="ml-5 mt-0.5 mb-1">
          <TaskSummaryPanel
            structuredResult={task.structuredResult}
            resultSummary={task.resultSummary}
            expanded={true}
          />
        </div>
      )}
      {expanded && hasTerminal && (
        <div className="ml-5 mt-0.5 mb-1 rounded-lg border border-gray-700/50 overflow-hidden">
          <TerminalContent
            text={terminalData.text}
            status={terminalData.status === "streaming" ? "streaming" : "complete"}
            accentColor="violet"
            maxHeightClass="max-h-[300px]"
            showHeader={false}
          />
        </div>
      )}
    </div>
  );
}

// ── Phase: Complete ──

type CompleteTab = "summary" | "tasks" | "logs";

function CompletePhase({ plan, taskTerminals }: { plan: OrchestrationPlan; taskTerminals?: Record<string, { text: string; status: string }> }) {
  const { t } = useT();
  const [tab, setTab] = useState<CompleteTab>("summary");
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [showReactToTL, setShowReactToTL] = useState(false);

  const completed = plan.tasks.filter((t) => t.status === "completed").length;
  const failed = plan.tasks.filter((t) => t.status === "failed").length;
  const appTasks = plan.tasks.filter((t) => t.outputType === "app" && t.status === "completed");
  const terminalTasks = plan.tasks.filter((t) => taskTerminals?.[t.taskId]?.text);
  const hasStructured = plan.tasks.some((t) => t.structuredResult);
  const { allFindings, avgRatings, allRecs, issues } = aggregateResults(plan.tasks);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{"\u2705"}</span>
        <h3 className="text-sm font-semibold text-green-300">{t("orchestration.missionComplete")}</h3>
        <button
          onClick={() => setShowReactToTL(!showReactToTL)}
          className="ml-auto text-[10px] px-2 py-1 rounded bg-violet-500/15 text-violet-300 border border-violet-500/20 hover:bg-violet-500/25 transition-colors"
        >
          Send to Agent
        </button>
      </div>
      {showReactToTL && (
        <div className="mb-3">
          <ReactToTL
            context={{
              type: "sprint",
              summary: `Sprint complete: ${plan.goal?.slice(0, 80)}`,
              detail: `${completed} completed, ${failed} failed. ${allFindings.length} findings, ${allRecs.length} recommendations.`,
            }}
            onClose={() => setShowReactToTL(false)}
            mode="inline"
          />
        </div>
      )}

      {/* Goal */}
      <div className="mb-2 p-2 rounded-lg bg-green-500/5 border border-green-500/20">
        <p className="text-xs text-gray-300 line-clamp-2">{plan.goal}</p>
      </div>

      {/* Tab bar */}
      <div className="inline-flex rounded-full border border-gray-600/50 bg-gray-800/60 p-0.5 mb-3">
        {(["summary", "tasks", "logs"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              if (t === "logs" && !activeTerminalId && terminalTasks.length > 0) {
                setActiveTerminalId(terminalTasks[0].taskId);
              }
            }}
            className={`text-[10px] sm:text-[9px] px-3 sm:px-2.5 py-1 sm:py-0.5 rounded-full transition-all duration-150 capitalize ${
              tab === t ? "bg-gray-600/60 text-gray-200" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {t === "summary" ? "Summary" : t === "tasks" ? `Tasks (${plan.tasks.length})` : `Logs (${terminalTasks.length})`}
          </button>
        ))}
      </div>

      {/* ─── Summary Tab ─── */}
      {tab === "summary" && (
        <div className="space-y-3">
          {/* Stats bar */}
          <div className="flex flex-wrap gap-3 text-[10px]">
            <div className="flex items-center gap-1">
              <span className="text-green-400">{"\u2713"}</span>
              <span className="text-gray-400">{completed} completed</span>
            </div>
            {failed > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-red-400">{"\u2717"}</span>
                <span className="text-gray-400">{failed} failed</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <span className="text-blue-400">{"\uD83E\uDD16"}</span>
              <span className="text-gray-400">{plan.agents.length} agents</span>
            </div>
          </div>

          {/* Apps built */}
          {appTasks.length > 0 && (
            <div className="p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <div className="text-[9px] font-semibold text-blue-400 uppercase tracking-wider mb-1.5">
                {t("orchestration.appsBuilt")}
              </div>
              <div className="space-y-1">
                {appTasks.map((t) => (
                  <div key={t.taskId} className="flex items-center gap-2 text-xs text-gray-300">
                    <span>{"\uD83D\uDD28"}</span>
                    <span>{t.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Issues found */}
          {issues.length > 0 && (
            <div className="p-2.5 rounded-lg bg-red-500/5 border border-red-500/20">
              <div className="text-[9px] font-semibold text-red-400 uppercase tracking-wider mb-1.5">{t("orchestrationCard.issuesFound")}</div>
              <div className="space-y-1">
                {issues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[10px]">
                    <span className="text-red-400 flex-shrink-0">{"\u26A0"}</span>
                    <span className="text-gray-300">{issue.taskTitle}</span>
                    <span className={`px-1 py-0.5 rounded-full text-[8px] font-medium border ml-auto flex-shrink-0 ${verdictColor(issue.verdict)}`}>
                      {issue.verdict}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Aggregated Ratings */}
          {avgRatings.length > 0 && (
            <div className="p-2.5 rounded-lg bg-gray-800/30 border border-gray-700/40">
              <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-2">{t("orchestrationCard.scorecard")}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {avgRatings.map(({ key, value }) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 w-28 truncate capitalize">
                      {key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim()}
                    </span>
                    <div className="flex-1 h-2 bg-gray-700/50 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${ratingColor(value)}`}
                        style={{ width: `${Math.min(value / 10 * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-300 w-8 text-right tabular-nums font-medium">{value}/10</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key Decisions & Outcomes */}
          {allFindings.length > 0 && (
            <SummaryFindingsSection findings={allFindings} />
          )}

          {/* Top Recommendations */}
          {allRecs.length > 0 && (
            <SummaryRecsSection recs={allRecs} />
          )}

          {/* Fallback when no structured data */}
          {!hasStructured && allFindings.length === 0 && (
            <div className="p-2.5 rounded-lg bg-gray-800/30 border border-gray-700/40">
              <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{t("orchestrationCard.taskResults")}</div>
              <div className="space-y-1.5">
                {plan.tasks.filter((t) => t.status === "completed" && t.resultSummary).map((task) => (
                  <div key={task.taskId} className="flex items-start gap-1.5 text-[10px]">
                    <span className="flex-shrink-0">{ROLE_EMOJI[task.agentRole]}</span>
                    <div>
                      <span className="text-gray-300 font-medium">{shortTitle(task.title)}: </span>
                      <span className="text-gray-400">{task.resultSummary!.slice(0, 150)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Tasks Tab ─── */}
      {tab === "tasks" && (
        <div className="space-y-1.5">
          {groupTasksByPhase(plan.tasks).map((group) => (
            <div key={group.phase || "ungrouped"}>
              {group.phase && (
                <div className="flex items-center gap-2 mt-2.5 mb-1 first:mt-0">
                  <div className="h-px flex-1 bg-gray-700/40" />
                  <span className="text-[9px] text-gray-500 uppercase tracking-wider font-medium whitespace-nowrap">
                    {group.phase}
                  </span>
                  <div className="h-px flex-1 bg-gray-700/40" />
                </div>
              )}
              {group.tasks.map((task, i) => (
                <TaskRow key={task.taskId} task={task} index={i} />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ─── Logs Tab ─── */}
      {tab === "logs" && (
        <div>
          {terminalTasks.length === 0 ? (
            <div className="text-center py-6 text-xs text-gray-500">{t("orchestrationCard.noSessionLogs")}</div>
          ) : (
            <>
              <div className="flex gap-0.5 overflow-x-auto pb-1 mb-1 scrollbar-none">
                {terminalTasks.map((task) => (
                  <button
                    key={task.taskId}
                    onClick={() => setActiveTerminalId(task.taskId)}
                    className={`flex items-center gap-1 whitespace-nowrap px-2 py-1 rounded-t-lg text-[9px] transition-all duration-150 flex-shrink-0 ${
                      task.taskId === activeTerminalId
                        ? "bg-[#0d1117] text-gray-200 border border-b-0 border-gray-700/60"
                        : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/40"
                    }`}
                  >
                    <span className="text-green-400">{"\u2713"}</span>
                    <span>{ROLE_EMOJI[task.agentRole]}</span>
                    <span className="max-w-[120px] truncate">{shortTitle(task.title)}</span>
                  </button>
                ))}
              </div>
              {activeTerminalId && taskTerminals?.[activeTerminalId] && (
                <div className="rounded-lg border border-gray-700/50 overflow-hidden bg-[#0d1117]">
                  <TerminalContent
                    text={taskTerminals[activeTerminalId].text}
                    status="complete"
                    accentColor="violet"
                    maxHeightClass="max-h-[400px]"
                    showHeader={false}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Aggregated findings section for the summary tab */
function SummaryFindingsSection({ findings }: { findings: Array<{ title: string; impact?: "high" | "medium" | "low"; role: AgentRole }> }) {
  const [showAll, setShowAll] = useState(false);
  const { t } = useT();
  const visible = showAll ? findings : findings.slice(0, 8);

  return (
    <div className="p-2.5 rounded-lg bg-gray-800/30 border border-gray-700/40">
      <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{t("orchestrationCard.keyDecisions")}</div>
      <div className="space-y-1">
        {visible.map((f, i) => (
          <div key={i} className="flex items-start gap-1.5 text-[10px]">
            <span className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${IMPACT_DOT[f.impact || "low"]}`} />
            <span className="text-gray-300 flex-1">{f.title}</span>
            <span className="text-[8px] flex-shrink-0">{ROLE_EMOJI[f.role]}</span>
          </div>
        ))}
      </div>
      {findings.length > 8 && (
        <button onClick={() => setShowAll(!showAll)} className="text-[9px] text-blue-400 hover:text-blue-300 mt-1">
          {showAll ? "Show less" : `Show ${findings.length - 8} more`}
        </button>
      )}
    </div>
  );
}

/** Aggregated recommendations section for the summary tab */
function SummaryRecsSection({ recs }: { recs: Array<{ title: string; priority?: string; effort?: string; role: AgentRole }> }) {
  const [showAll, setShowAll] = useState(false);
  const { t } = useT();
  const visible = showAll ? recs : recs.slice(0, 6);

  return (
    <div className="p-2.5 rounded-lg bg-gray-800/30 border border-gray-700/40">
      <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{t("orchestrationCard.topRecommendations")}</div>
      <div className="space-y-1">
        {visible.map((r, i) => (
          <div key={i} className="flex items-start gap-1.5 text-[10px]">
            {r.priority && (
              <span className={`px-1 py-0.5 rounded text-[8px] font-medium flex-shrink-0 ${PRIORITY_STYLE[r.priority] || "text-gray-400 bg-gray-500/15"}`}>
                {r.priority}
              </span>
            )}
            <span className="text-gray-300 flex-1">{r.title}</span>
            <span className="text-[8px] flex-shrink-0">{ROLE_EMOJI[r.role]}</span>
            {r.effort && (
              <span className="text-[8px] text-gray-500 flex-shrink-0">{r.effort}</span>
            )}
          </div>
        ))}
      </div>
      {recs.length > 6 && (
        <button onClick={() => setShowAll(!showAll)} className="text-[9px] text-blue-400 hover:text-blue-300 mt-1">
          {showAll ? "Show less" : `Show ${recs.length - 6} more`}
        </button>
      )}
    </div>
  );
}

// ── Phase: Error ──

function ErrorPhase({ error, plan }: { error?: string; plan?: OrchestrationPlan }) {
  const { t } = useT();
  const failedTasks = plan?.tasks.filter((t) => t.status === "failed") || [];

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{"\u26A1"}</span>
        <h3 className="text-sm font-semibold text-red-300">{t("orchestration.failed")}</h3>
      </div>
      {plan?.goal && (
        <div className="mb-2 p-2 rounded-lg bg-red-500/5 border border-red-500/20">
          <p className="text-xs text-gray-400 line-clamp-2">{plan.goal}</p>
        </div>
      )}
      <p className="text-xs text-red-400/80 mb-2">{error || t("orchestration.unexpectedError")}</p>
      {failedTasks.length > 0 && (
        <div className="space-y-1.5">
          {failedTasks.map((task, i) => (
            <TaskRow key={task.taskId} task={task} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Shared: Task Row ──

function TaskRow({ task, index, showDescription }: { task: OrchestrationTask; index: number; showDescription?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useT();

  const hasSummary = !!(task.structuredResult || task.resultSummary);

  return (
    <div
      className={`text-xs p-2 rounded-lg cursor-pointer transition-all duration-150 ${
        task.status === "running" ? "bg-blue-500/5 border border-blue-500/20" :
        task.status === "completed" ? "bg-green-500/5" :
        task.status === "failed" ? "bg-red-500/5" :
        task.status === "awaiting_approval" ? "bg-amber-500/5 border border-amber-500/20" :
        task.status === "blocked" ? "opacity-40" :
        "hover:bg-gray-800/30"
      }`}
      onClick={() => setExpanded((e) => !e)}
    >
      <div className="flex items-start gap-2">
        <div className="w-5 pt-0.5 flex-shrink-0">
          {task.status === "completed" ? (
            <span className="text-green-400">{"\u2713"}</span>
          ) : task.status === "failed" ? (
            <span className="text-red-400">{"\u2717"}</span>
          ) : task.status === "running" ? (
            <Spinner size="sm" />
          ) : task.status === "awaiting_approval" ? (
            <span className="text-amber-400">{"\u26A0"}</span>
          ) : task.status === "blocked" ? (
            <span className="text-gray-600">{"\u2298"}</span>
          ) : (
            <span className="text-gray-600">{index + 1}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`${
              task.status === "running" ? "text-gray-200" :
              task.status === "completed" ? "text-gray-300" :
              task.status === "failed" ? "text-red-300" :
              "text-gray-400"
            }`}>
              {task.title}
            </span>
            <span className="text-[10px]">{ROLE_EMOJI[task.agentRole]}</span>
            {task.requiresApproval && task.status === "pending" && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                {t("orchestration.approval")}
              </span>
            )}
            {hasSummary && task.status === "completed" && (
              <span className="text-[9px] text-gray-500 ml-auto">{expanded ? "\u25BC" : "\u25B6"}</span>
            )}
          </div>
          {task.dependsOn.length > 0 && (
            <div className="text-[10px] text-gray-600 mt-0.5">
              {t("orchestration.dependsOn")} {task.dependsOn.join(", ")}
            </div>
          )}
          {(showDescription || expanded) && task.description && (
            <div className="text-[10px] text-gray-500 mt-1 leading-relaxed">
              {task.description.length > 200 && !expanded
                ? task.description.slice(0, 200) + "..."
                : task.description}
            </div>
          )}
          {/* Summary: collapsed teaser or expanded panel */}
          {task.status === "completed" && (
            <TaskSummaryPanel
              structuredResult={task.structuredResult}
              resultSummary={task.resultSummary}
              expanded={expanded}
            />
          )}
          {task.error && (
            <div className="text-[10px] text-red-400/70 mt-0.5 truncate">
              {task.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──

/** Group tasks by Phase N: prefix for evolution sprints */
function groupTasksByPhase(tasks: OrchestrationTask[]): Array<{ phase: string | null; tasks: OrchestrationTask[] }> {
  const groups: Array<{ phase: string | null; tasks: OrchestrationTask[] }> = [];
  let currentPhase: string | null = null;

  for (const task of tasks) {
    const phaseMatch = task.title.match(/^Phase (\d+):/);
    const phase = phaseMatch ? `Phase ${phaseMatch[1]}` : null;

    if (phase !== currentPhase || groups.length === 0) {
      groups.push({ phase, tasks: [task] });
      currentPhase = phase;
    } else {
      groups[groups.length - 1].tasks.push(task);
    }
  }
  return groups;
}

/** Aggregate structured results across all completed tasks for the overview summary */
function aggregateResults(tasks: OrchestrationTask[]): {
  allFindings: Array<{ title: string; impact?: "high" | "medium" | "low"; role: AgentRole }>;
  avgRatings: Array<{ key: string; value: number; count: number }>;
  allRecs: Array<{ title: string; priority?: string; effort?: string; role: AgentRole }>;
  issues: Array<{ taskTitle: string; verdict: string; role: AgentRole }>;
} {
  const allFindings: Array<{ title: string; impact?: "high" | "medium" | "low"; role: AgentRole }> = [];
  const ratingsMap = new Map<string, { sum: number; count: number }>();
  const allRecs: Array<{ title: string; priority?: string; effort?: string; role: AgentRole }> = [];
  const issues: Array<{ taskTitle: string; verdict: string; role: AgentRole }> = [];

  for (const task of tasks) {
    if (task.status !== "completed") continue;
    const sr = task.structuredResult;
    if (!sr) continue;

    // Collect findings
    if (sr.keyFindings) {
      for (const f of sr.keyFindings) {
        allFindings.push({ title: f.title, impact: f.impact, role: task.agentRole });
      }
    }

    // Accumulate ratings
    if (sr.ratings) {
      for (const [k, v] of Object.entries(sr.ratings)) {
        const existing = ratingsMap.get(k);
        if (existing) {
          existing.sum += v;
          existing.count += 1;
        } else {
          ratingsMap.set(k, { sum: v, count: 1 });
        }
      }
    }

    // Collect recommendations
    if (sr.recommendations) {
      for (const r of sr.recommendations) {
        allRecs.push({ ...r, role: task.agentRole });
      }
    }

    // Track issues (FAIL verdicts or negative signals)
    if (sr.verdict) {
      const v = sr.verdict.toUpperCase();
      if (v === "FAIL" || v.includes("CRITICAL") || v.includes("POOR")) {
        issues.push({ taskTitle: task.title, verdict: sr.verdict, role: task.agentRole });
      }
    }
  }

  // Sort findings by impact (high first)
  const impactOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  allFindings.sort((a, b) => (impactOrder[a.impact || "low"] || 2) - (impactOrder[b.impact || "low"] || 2));

  // Sort recs by priority (P0 first)
  allRecs.sort((a, b) => (a.priority || "P9").localeCompare(b.priority || "P9"));

  // Average ratings
  const avgRatings = Array.from(ratingsMap.entries()).map(([key, { sum, count }]) => ({
    key,
    value: Math.round((sum / count) * 10) / 10,
    count,
  }));

  return { allFindings, avgRatings, allRecs, issues };
}

/** Shorten task titles for terminal tabs */
function shortTitle(title: string): string {
  // Strip "Phase N: " prefix
  const stripped = title.replace(/^Phase \d+:\s*/, "");
  // Strip long agent name prefixes like "James Rodriguez (Project Leader) — "
  const dashIdx = stripped.indexOf(" \u2014 ");
  if (dashIdx > 0 && dashIdx < 50) return stripped.slice(dashIdx + 3);
  // Shorten common prefixes
  return stripped
    .replace(/^(Elena Vasquez|David Park|Aisha Rahman|James Rodriguez|Jordan Kim|Alex Chen|Sarah Thompson|Maya Patel)\s*(\([^)]*\))?\s*[\u2014\-]\s*/i, "")
    .replace(/^(Re-Test|Retest)\s+/, "\u21BB ")
    .replace(/^Build Evolution Dashboard.*/, "Dashboard")
    .replace(/^Synthesis \+ Discussion.*/, "Synthesis")
    .replace(/^Implementation Track\s*/, "Impl ")
    .replace(/^Review & Validate.*/, "Review");
}

// ── Shared: Spinner ──

function Spinner({ size = "md" }: { size?: "sm" | "md" }) {
  const cls = size === "sm" ? "w-3.5 h-3.5" : "h-4 w-4";
  return (
    <svg className={`${cls} animate-spin text-blue-400`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  );
}

const OrchestrationCard = React.memo(OrchestrationCardInner);
export default OrchestrationCard;
