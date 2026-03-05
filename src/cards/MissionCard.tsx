import { useState } from "react";
import { useChatStore } from "../store/chat";
import type { CardRendererProps } from "./types";
import type { MissionAppProposal, MissionPlan, MissionProgress } from "@shared/types";

type Phase = "input" | "analyzing" | "proposal" | "building" | "complete" | "error";

export default function MissionCard({ card }: CardRendererProps) {
  const missionPlan = (card.data as any)?.missionPlan as MissionPlan | undefined;
  const missionProgress = (card.data as any)?.missionProgress as MissionProgress | undefined;
  const phase = derivedPhase(missionProgress, missionPlan);

  return (
    <div className="px-4 py-3">
      {phase === "input" && <InputPhase cardId={card.id} />}
      {phase === "analyzing" && <AnalyzingPhase />}
      {phase === "proposal" && missionPlan && (
        <ProposalPhase cardId={card.id} plan={missionPlan} />
      )}
      {phase === "building" && missionProgress && (
        <BuildingPhase progress={missionProgress} plan={missionPlan} />
      )}
      {phase === "complete" && missionProgress && (
        <CompletePhase progress={missionProgress} />
      )}
      {phase === "error" && missionProgress && (
        <ErrorPhase error={missionProgress.error} />
      )}
    </div>
  );
}

function derivedPhase(progress?: MissionProgress, plan?: MissionPlan): Phase {
  if (!progress && !plan) return "input";
  if (progress?.stage === "analyzing") return "analyzing";
  if (progress?.stage === "proposing" || (plan && !progress?.stage?.startsWith("build") && progress?.stage !== "complete" && progress?.stage !== "failed")) return "proposal";
  if (progress?.stage === "building" || progress?.stage === "built") return "building";
  if (progress?.stage === "complete") return "complete";
  if (progress?.stage === "failed") return "error";
  return "input";
}

// ── Phase: Input ──

function InputPhase({ cardId }: { cardId: string }) {
  const [text, setText] = useState("");
  const startMission = useChatStore((s) => s.startMission);

  function handleSubmit() {
    if (!text.trim()) return;
    startMission(cardId, text.trim());
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🎯</span>
        <h3 className="text-sm font-semibold text-gray-200">Mission Planner</h3>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Tell me about your interests, goals, or workflows. I'll design a set of custom apps tailored to your needs.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. I'm a freelance photographer who needs to manage clients, track invoices, organize photo shoots, and maintain a portfolio..."
        rows={4}
        className="w-full bg-gray-800/60 border border-gray-700/60 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500 resize-none focus:outline-none focus:border-blue-500/50"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
        }}
      />
      <div className="flex justify-between items-center mt-2">
        <span className="text-[10px] text-gray-600">Cmd+Enter to submit</span>
        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="px-4 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Analyze & Propose Apps
        </button>
      </div>
    </div>
  );
}

// ── Phase: Analyzing ──

function AnalyzingPhase() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🎯</span>
        <h3 className="text-sm font-semibold text-gray-200">Mission Planner</h3>
      </div>
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <svg className="h-4 w-4 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
        </svg>
        Analyzing your mission and designing apps...
      </div>
      <p className="text-[11px] text-gray-500 mt-2">
        Claude Code is studying your needs and existing apps to propose a custom set.
      </p>
    </div>
  );
}

// ── Phase: Proposal ──

function ProposalPhase({ cardId, plan }: { cardId: string; plan: MissionPlan }) {
  const [apps, setApps] = useState<MissionAppProposal[]>(plan.apps);
  const [editing, setEditing] = useState<string | null>(null);
  const approveMission = useChatStore((s) => s.approveMission);

  function toggleApproval(id: string) {
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, approved: !a.approved } : a)));
  }

  function updateDescription(id: string, desc: string) {
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, description: desc } : a)));
    setEditing(null);
  }

  function handleBuildAll() {
    approveMission(cardId, plan.missionId, apps);
  }

  const approvedCount = apps.filter((a) => a.approved).length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">🎯</span>
        <h3 className="text-sm font-semibold text-gray-200">Mission Plan</h3>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        {plan.apps.length} apps proposed. Toggle to approve/skip, or click to edit descriptions.
      </p>

      <div className="space-y-2">
        {apps.map((app) => (
          <div
            key={app.id}
            className={`border rounded-lg p-3 transition-colors ${
              app.approved
                ? "border-blue-500/40 bg-blue-500/5"
                : "border-gray-700/50 bg-gray-800/30 opacity-60"
            }`}
          >
            <div className="flex items-start gap-2">
              <button
                onClick={() => toggleApproval(app.id)}
                className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                  app.approved
                    ? "bg-blue-600 border-blue-500"
                    : "bg-gray-800 border-gray-600"
                }`}
              >
                {app.approved && (
                  <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-200">{app.name}</span>
                  <span className="text-[10px] text-gray-500 font-mono">{app.family}</span>
                </div>
                {editing === app.id ? (
                  <EditableDescription
                    value={app.description}
                    onSave={(v) => updateDescription(app.id, v)}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <p
                    className="text-[11px] text-gray-400 mt-0.5 cursor-pointer hover:text-gray-300"
                    onClick={() => setEditing(app.id)}
                    title="Click to edit"
                  >
                    {app.description}
                  </p>
                )}
                {app.capabilities.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {app.capabilities.map((cap, i) => (
                      <span
                        key={i}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800/60 border border-gray-700/40 text-gray-400"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-700/40">
        <span className="text-[11px] text-gray-500">
          {approvedCount} of {apps.length} apps selected
        </span>
        <button
          onClick={handleBuildAll}
          disabled={approvedCount === 0}
          className="px-4 py-1.5 text-xs font-medium rounded-lg bg-green-600 hover:bg-green-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Build {approvedCount} App{approvedCount !== 1 ? "s" : ""}
        </button>
      </div>
    </div>
  );
}

function EditableDescription({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(value);

  return (
    <div className="mt-1">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        className="w-full bg-gray-800/60 border border-gray-600/60 rounded px-2 py-1 text-[11px] text-gray-200 resize-none focus:outline-none focus:border-blue-500/50"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSave(text);
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="flex gap-1 mt-1">
        <button onClick={() => onSave(text)} className="text-[10px] px-2 py-0.5 rounded bg-blue-600/80 text-white">Save</button>
        <button onClick={onCancel} className="text-[10px] px-2 py-0.5 rounded bg-gray-700/80 text-gray-300">Cancel</button>
      </div>
    </div>
  );
}

// ── Phase: Building ──

function BuildingPhase({ progress, plan }: { progress: MissionProgress; plan?: MissionPlan }) {
  const builtApps = progress.builtApps || [];

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🎯</span>
        <h3 className="text-sm font-semibold text-gray-200">Building Apps</h3>
      </div>

      {/* Overall progress */}
      <div className="mb-3">
        <div className="flex justify-between text-[11px] text-gray-400 mb-1">
          <span>Progress</span>
          <span>{progress.currentIndex} / {progress.totalApps}</span>
        </div>
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${(progress.currentIndex / progress.totalApps) * 100}%` }}
          />
        </div>
      </div>

      {/* Per-app status */}
      <div className="space-y-1.5">
        {plan?.apps.filter((a) => a.approved).map((app, i) => {
          const built = builtApps.find((b) => b.family === app.family);
          const isCurrent = i === progress.currentIndex && progress.stage === "building";

          return (
            <div key={app.id} className="flex items-center gap-2 text-xs">
              {built?.success ? (
                <span className="text-green-400 w-4 text-center">&#10003;</span>
              ) : built && !built.success ? (
                <span className="text-red-400 w-4 text-center">&#10007;</span>
              ) : isCurrent ? (
                <svg className="w-4 h-4 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                </svg>
              ) : (
                <span className="w-4 text-center text-gray-600">&#9679;</span>
              )}
              <span className={isCurrent ? "text-gray-200" : built ? "text-gray-400" : "text-gray-500"}>
                {app.name}
              </span>
              {built && !built.success && built.error && (
                <span className="text-[10px] text-red-400/70 truncate max-w-[200px]">{built.error}</span>
              )}
            </div>
          );
        })}
      </div>

      {progress.currentApp && progress.stage === "building" && (
        <p className="text-[11px] text-gray-500 mt-3">
          Currently building: {progress.currentApp}
        </p>
      )}
    </div>
  );
}

// ── Phase: Complete ──

function CompletePhase({ progress }: { progress: MissionProgress }) {
  const builtApps = progress.builtApps || [];
  const succeeded = builtApps.filter((a) => a.success).length;
  const failed = builtApps.filter((a) => !a.success).length;
  const runApp = useChatStore((s) => s.runApp);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🎯</span>
        <h3 className="text-sm font-semibold text-gray-200">Mission Complete</h3>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Built {succeeded} app{succeeded !== 1 ? "s" : ""} successfully
        {failed > 0 ? `, ${failed} failed` : ""}.
      </p>

      <div className="space-y-1.5">
        {builtApps.map((app) => (
          <div key={app.family} className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs">
              {app.success ? (
                <span className="text-green-400">&#10003;</span>
              ) : (
                <span className="text-red-400">&#10007;</span>
              )}
              <span className="text-gray-300">{app.family.replace(/_/g, " ")}</span>
            </div>
            {app.success && (
              <button
                onClick={() => runApp(app.family)}
                className="text-[10px] px-2 py-0.5 rounded bg-blue-600/60 hover:bg-blue-600/80 text-blue-200 transition-colors"
              >
                Launch
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Phase: Error ──

function ErrorPhase({ error }: { error?: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">🎯</span>
        <h3 className="text-sm font-semibold text-red-300">Mission Failed</h3>
      </div>
      <p className="text-xs text-red-400/80">{error || "An unexpected error occurred."}</p>
    </div>
  );
}
