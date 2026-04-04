/**
 * Session Registry — centralized tracking of all active Claude Code sessions
 * and orchestrations. Provides a single source of truth for the /sessions
 * dashboard and REST API.
 *
 * This is purely informational — it does NOT own the cancellation mechanism.
 * Cancellation still goes through cancelClaudeCodeRun() (AbortController)
 * and handleOrchestrationCancel() respectively.
 */

// ── Types ──

export type SessionType = "claude-code" | "orchestration-task" | "build" | "deep-research" | "scheduled-task";
export type SessionStatus = "running" | "completed" | "failed" | "cancelled";

export interface SessionInfo {
  sessionId: string;
  runId: string;
  type: SessionType;
  orchestrationId?: string;
  taskId?: string;
  agentRole?: string;
  description: string;
  startedAt: number;
  status: SessionStatus;
  model?: string;
}

export type OrchestrationType = "orchestration" | "evolution" | "discovery";

export interface OrchestrationInfo {
  orchestrationId: string;
  type: OrchestrationType;
  goal: string;
  status: string;
  startedAt: number;
  taskCount: number;
  completedCount: number;
  failedCount: number;
  runningCount: number;
  workspaceDir?: string;
  projectId?: string;
}

export interface SystemStatus {
  sessions: SessionInfo[];
  orchestrations: OrchestrationInfo[];
}

// ── In-memory stores ──

const sessions = new Map<string, SessionInfo>();
const orchestrations = new Map<string, OrchestrationInfo>();

// ── Session API ──

export function registerSession(info: SessionInfo): void {
  sessions.set(info.runId, info);
}

export function unregisterSession(runId: string): void {
  const session = sessions.get(runId);
  if (session) {
    // Keep completed/failed/cancelled sessions briefly for dashboard visibility,
    // then auto-expire after 60s
    if (session.status === "running") {
      session.status = "completed";
    }
    setTimeout(() => sessions.delete(runId), 60_000);
  }
}

export function updateSessionStatus(runId: string, status: SessionStatus): void {
  const session = sessions.get(runId);
  if (session) {
    session.status = status;
  }
}

export function updateSessionId(runId: string, sessionId: string): void {
  const session = sessions.get(runId);
  if (session) {
    session.sessionId = sessionId;
  }
}

export function getActiveSessions(): SessionInfo[] {
  return Array.from(sessions.values()).filter((s) => s.status === "running");
}

export function getAllSessions(): SessionInfo[] {
  return Array.from(sessions.values());
}

export function getSession(runId: string): SessionInfo | undefined {
  return sessions.get(runId);
}

// ── Orchestration API ──

export function registerOrchestration(info: OrchestrationInfo): void {
  orchestrations.set(info.orchestrationId, info);
}

export function unregisterOrchestration(orchestrationId: string): void {
  const orch = orchestrations.get(orchestrationId);
  if (orch) {
    // Keep briefly for dashboard
    setTimeout(() => orchestrations.delete(orchestrationId), 60_000);
  }
}

export function updateOrchestrationStatus(orchestrationId: string, status: string): void {
  const orch = orchestrations.get(orchestrationId);
  if (orch) {
    orch.status = status;
  }
}

export function updateOrchestrationCounts(
  orchestrationId: string,
  counts: { completed?: number; failed?: number; running?: number },
): void {
  const orch = orchestrations.get(orchestrationId);
  if (orch) {
    if (counts.completed !== undefined) orch.completedCount = counts.completed;
    if (counts.failed !== undefined) orch.failedCount = counts.failed;
    if (counts.running !== undefined) orch.runningCount = counts.running;
  }
}

export function getActiveOrchestrations(): OrchestrationInfo[] {
  return Array.from(orchestrations.values()).filter(
    (o) => o.status === "planning" || o.status === "reviewing" || o.status === "executing" || o.status === "paused",
  );
}

export function getAllOrchestrations(): OrchestrationInfo[] {
  return Array.from(orchestrations.values());
}

export function getOrchestration(orchestrationId: string): OrchestrationInfo | undefined {
  return orchestrations.get(orchestrationId);
}

// ── Aggregate ──

export function getSystemStatus(): SystemStatus {
  return {
    sessions: Array.from(sessions.values()),
    orchestrations: Array.from(orchestrations.values()),
  };
}
