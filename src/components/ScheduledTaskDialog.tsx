/**
 * ScheduledTaskDialog — modal for creating/editing scheduled tasks.
 *
 * Features:
 * - Name, description fields
 * - Schedule type toggle: Recurring (cron) / One-time (fireAt)
 * - Cron preset buttons + custom input
 * - Action type: Chat Prompt / Run Tool
 * - Model picker, notification toggle
 */

import { useState, useEffect, type FC } from "react";
import { X, Clock, Zap, MessageSquare, Wrench } from "lucide-react";
import type { ScheduledTaskDef, ScheduledTaskAction } from "@shared/types";

interface ScheduledTaskDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (def: Partial<ScheduledTaskDef>) => void;
  editTask?: ScheduledTaskDef | null;
}

const CRON_PRESETS = [
  { label: "Every 5 min", cron: "*/5 * * * *" },
  { label: "Every 30 min", cron: "*/30 * * * *" },
  { label: "Every hour", cron: "0 * * * *" },
  { label: "Daily 9am", cron: "0 9 * * *" },
  { label: "Weekdays 9am", cron: "0 9 * * 1-5" },
  { label: "Weekly Mon", cron: "0 9 * * 1" },
];

export const ScheduledTaskDialog: FC<ScheduledTaskDialogProps> = ({ open, onClose, onSave, editTask }) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scheduleType, setScheduleType] = useState<"recurring" | "once">("recurring");
  const [cron, setCron] = useState("0 * * * *");
  const [fireAt, setFireAt] = useState("");
  const [actionType, setActionType] = useState<"prompt" | "tool">("prompt");
  const [prompt, setPrompt] = useState("");
  const [toolId, setToolId] = useState("");
  const [notifyOnComplete, setNotifyOnComplete] = useState(true);

  useEffect(() => {
    if (editTask) {
      setName(editTask.name);
      setDescription(editTask.description);
      setScheduleType(editTask.recurring ? "recurring" : "once");
      setCron(editTask.cron || "0 * * * *");
      setFireAt(editTask.fireAt || "");
      setActionType(editTask.action.type);
      setPrompt(editTask.action.prompt || "");
      setToolId(editTask.action.toolId || "");
      setNotifyOnComplete(editTask.notifyOnComplete);
    } else {
      setName("");
      setDescription("");
      setScheduleType("recurring");
      setCron("0 * * * *");
      setFireAt("");
      setActionType("prompt");
      setPrompt("");
      setToolId("");
      setNotifyOnComplete(true);
    }
  }, [editTask, open]);

  if (!open) return null;

  const handleSave = () => {
    const action: ScheduledTaskAction = actionType === "prompt"
      ? { type: "prompt", prompt }
      : { type: "tool", toolId };

    onSave({
      ...(editTask ? { taskId: editTask.taskId } : {}),
      name,
      description,
      cron: scheduleType === "recurring" ? cron : undefined,
      fireAt: scheduleType === "once" ? fireAt : undefined,
      action,
      recurring: scheduleType === "recurring",
      notifyOnComplete,
      enabled: true,
    });
    onClose();
  };

  const isValid = name.trim() && (scheduleType === "recurring" ? cron.trim() : fireAt.trim()) && (actionType === "prompt" ? prompt.trim() : toolId.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">{editTask ? "Edit Task" : "New Scheduled Task"}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Daily Report"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this task do?"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
            />
          </div>

          {/* Schedule Type */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Schedule</label>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setScheduleType("recurring")}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${scheduleType === "recurring" ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"}`}
              >
                Recurring
              </button>
              <button
                onClick={() => setScheduleType("once")}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${scheduleType === "once" ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"}`}
              >
                One-time
              </button>
            </div>

            {scheduleType === "recurring" ? (
              <div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {CRON_PRESETS.map((p) => (
                    <button
                      key={p.cron}
                      onClick={() => setCron(p.cron)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${cron === p.cron ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700"}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={cron}
                  onChange={(e) => setCron(e.target.value)}
                  placeholder="*/5 * * * * (cron expression)"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white font-mono text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                />
              </div>
            ) : (
              <input
                type="datetime-local"
                value={fireAt ? fireAt.slice(0, 16) : ""}
                onChange={(e) => setFireAt(e.target.value ? new Date(e.target.value).toISOString() : "")}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
              />
            )}
          </div>

          {/* Action Type */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Action</label>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setActionType("prompt")}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${actionType === "prompt" ? "bg-purple-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"}`}
              >
                <MessageSquare className="w-3.5 h-3.5" /> Chat Prompt
              </button>
              <button
                onClick={() => setActionType("tool")}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${actionType === "tool" ? "bg-purple-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"}`}
              >
                <Wrench className="w-3.5 h-3.5" /> Run Tool
              </button>
            </div>

            {actionType === "prompt" ? (
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="What should the AI do when this fires?"
                rows={3}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
              />
            ) : (
              <input
                type="text"
                value={toolId}
                onChange={(e) => setToolId(e.target.value)}
                placeholder="Tool ID (e.g. enso_researcher_search)"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
              />
            )}
          </div>

          {/* Options */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyOnComplete}
                onChange={(e) => setNotifyOnComplete(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500/50"
              />
              <span className="text-sm text-zinc-300">Notify on completion</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Zap className="w-3.5 h-3.5" />
            {editTask ? "Save Changes" : "Create Task"}
          </button>
        </div>
      </div>
    </div>
  );
};
