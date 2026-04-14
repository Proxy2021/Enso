/**
 * Agent Artifact System — Work products from TL and expert agents.
 *
 * Instead of posting to chat conversations, agents create artifacts
 * (action items, deliverables, insights, recommendations) that live
 * on Focus/Tasks views with direct action buttons.
 *
 * Artifacts are the primary way agents communicate their work to the user.
 * Chat is optional for deeper conversation.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { logAction } from "./action-log.js";

// ── Types ──

export type ArtifactType = "action" | "deliverable" | "insight" | "report" | "recommendation" | "alert";
export type ArtifactStatus = "pending" | "in-progress" | "done" | "dismissed";

export interface ArtifactAction {
  id: string;
  label: string;
  /** What happens when user clicks this button */
  type: "approve" | "reject" | "execute" | "navigate" | "dismiss";
  /** Action-specific data — e.g., focusId to navigate to, tool to execute */
  payload?: Record<string, unknown>;
}

export interface AgentArtifact {
  id: string;
  /** What kind of work product this is */
  type: ArtifactType;
  /** Who created this — "tl" or "expert:<focusId>:<expertId>" */
  agentId: string;
  /** Display name — "Team Leader" or expert's name */
  agentName: string;
  /** Which focus area this relates to (optional for platform-wide artifacts) */
  focusId?: string;
  /** Short title */
  title: string;
  /** Markdown body — details, reasoning, content */
  body: string;
  /** Current state */
  status: ArtifactStatus;
  /** Direct action buttons shown on the artifact */
  actions?: ArtifactAction[];
  /** Extra data for specific artifact types */
  metadata?: Record<string, unknown>;
  /** When created */
  createdAt: string;
  /** When resolved/dismissed */
  resolvedAt?: string;
  /** How it was resolved */
  resolution?: string;
}

// ── Storage ──

const ARTIFACTS_PATH = join(homedir(), ".enso", "data", "agent-artifacts.json");

function loadArtifacts(): AgentArtifact[] {
  try {
    if (existsSync(ARTIFACTS_PATH)) {
      return JSON.parse(readFileSync(ARTIFACTS_PATH, "utf-8"));
    }
  } catch { /* corrupted file */ }
  return [];
}

function saveArtifacts(artifacts: AgentArtifact[]): void {
  const dir = dirname(ARTIFACTS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(ARTIFACTS_PATH, JSON.stringify(artifacts, null, 2), "utf-8");
}

// ── CRUD ──

/** Create a new artifact. Returns the created artifact. */
export function createArtifact(params: {
  type: ArtifactType;
  agentId: string;
  agentName: string;
  focusId?: string;
  title: string;
  body: string;
  status?: ArtifactStatus;
  actions?: ArtifactAction[];
  metadata?: Record<string, unknown>;
}): AgentArtifact {
  const artifact: AgentArtifact = {
    id: randomUUID(),
    type: params.type,
    agentId: params.agentId,
    agentName: params.agentName,
    focusId: params.focusId,
    title: params.title,
    body: params.body,
    status: params.status || "pending",
    actions: params.actions,
    metadata: params.metadata,
    createdAt: new Date().toISOString(),
  };

  const artifacts = loadArtifacts();
  artifacts.push(artifact);

  // Auto-cleanup: remove resolved artifacts older than 7 days
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const cleaned = artifacts.filter(a =>
    !a.resolvedAt || new Date(a.resolvedAt).getTime() > cutoff
  );

  saveArtifacts(cleaned);

  logAction({ ts: Date.now(), type: "action", category: "artifacts",
    message: `${params.agentName} created ${params.type}: "${params.title}"${params.focusId ? ` (focus: ${params.focusId})` : ""}` });

  // Notify connected clients via WebSocket
  notifyClients(artifact);

  return artifact;
}

/** Update an artifact's status or fields */
export function updateArtifact(artifactId: string, update: Partial<Pick<AgentArtifact, "status" | "body" | "resolution" | "resolvedAt" | "metadata">>): AgentArtifact | null {
  const artifacts = loadArtifacts();
  const idx = artifacts.findIndex(a => a.id === artifactId);
  if (idx < 0) return null;

  Object.assign(artifacts[idx], update);
  if (update.status === "done" || update.status === "dismissed") {
    artifacts[idx].resolvedAt = artifacts[idx].resolvedAt || new Date().toISOString();
  }
  saveArtifacts(artifacts);
  return artifacts[idx];
}

/** Resolve an artifact (mark done or dismissed) */
export function resolveArtifact(artifactId: string, resolution: string, status: "done" | "dismissed" = "done"): AgentArtifact | null {
  return updateArtifact(artifactId, { status, resolution, resolvedAt: new Date().toISOString() });
}

/** Get artifacts with optional filters */
export function getArtifacts(filter?: {
  focusId?: string;
  agentId?: string;
  status?: ArtifactStatus | ArtifactStatus[];
  type?: ArtifactType | ArtifactType[];
  limit?: number;
}): AgentArtifact[] {
  let results = loadArtifacts();

  if (filter?.focusId) results = results.filter(a => a.focusId === filter.focusId);
  if (filter?.agentId) results = results.filter(a => a.agentId === filter.agentId);
  if (filter?.status) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    results = results.filter(a => statuses.includes(a.status));
  }
  if (filter?.type) {
    const types = Array.isArray(filter.type) ? filter.type : [filter.type];
    results = results.filter(a => types.includes(a.type));
  }

  // Sort: pending/in-progress first, then by date descending
  results.sort((a, b) => {
    const aActive = a.status === "pending" || a.status === "in-progress" ? 0 : 1;
    const bActive = b.status === "pending" || b.status === "in-progress" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  if (filter?.limit) results = results.slice(0, filter.limit);
  return results;
}

/** Get all active (pending/in-progress) artifacts */
export function getActiveArtifacts(): AgentArtifact[] {
  return getArtifacts({ status: ["pending", "in-progress"] });
}

/** Get count of active artifacts per focus area */
export function getArtifactCounts(): Record<string, number> {
  const active = getActiveArtifacts();
  const counts: Record<string, number> = { _total: active.length };
  for (const a of active) {
    if (a.focusId) counts[a.focusId] = (counts[a.focusId] || 0) + 1;
  }
  return counts;
}

// ── WebSocket Notification ──

/** Push new artifact to connected clients */
async function notifyClients(artifact: AgentArtifact): Promise<void> {
  try {
    const { getAllClients } = await import("./server.js");
    const clients = getAllClients();
    for (const client of clients) {
      client.send({
        id: artifact.id,
        runId: artifact.id,
        sessionKey: client.sessionKey,
        seq: 0,
        state: "final" as const,
        artifactUpdate: artifact,
        timestamp: Date.now(),
      } as any);
    }
  } catch { /* best effort */ }
}

// ── Action Execution ──

/**
 * Execute an action button on an artifact.
 * Called when user clicks approve/reject/execute/dismiss on the UI.
 */
export async function executeArtifactAction(artifactId: string, actionId: string): Promise<{ success: boolean; message: string }> {
  const artifacts = loadArtifacts();
  const artifact = artifacts.find(a => a.id === artifactId);
  if (!artifact) return { success: false, message: "Artifact not found" };

  const action = artifact.actions?.find(a => a.id === actionId);
  if (!action) return { success: false, message: "Action not found" };

  logAction({ ts: Date.now(), type: "action", category: "artifacts",
    message: `User clicked "${action.label}" on artifact "${artifact.title}"` });

  switch (action.type) {
    case "approve": {
      resolveArtifact(artifactId, `Approved by user: ${action.label}`);
      // If the action has an execute payload, run it
      if (action.payload?.executeType === "focus-sprint") {
        const { processEvent, createEvent } = await import("./team-leader.js");
        processEvent(createEvent("focus.evaluation.done", { agent: "tl" }, { focusId: action.payload.focusId }, "user"));
      }
      return { success: true, message: `Approved: ${action.label}` };
    }

    case "reject":
    case "dismiss": {
      resolveArtifact(artifactId, `${action.type === "reject" ? "Rejected" : "Dismissed"} by user`, "dismissed");
      return { success: true, message: `${action.type === "reject" ? "Rejected" : "Dismissed"}: ${action.label}` };
    }

    case "execute": {
      updateArtifact(artifactId, { status: "in-progress" });
      // Fire event based on payload
      if (action.payload?.eventType) {
        const { processEvent, createEvent } = await import("./team-leader.js");
        const target = (action.payload.target as any) || { agent: "tl" };
        processEvent(createEvent(action.payload.eventType as string, target, action.payload, "user"));
      }
      return { success: true, message: `Executing: ${action.label}` };
    }

    case "navigate": {
      // Navigation is handled client-side — just mark as acknowledged
      return { success: true, message: `Navigate to: ${action.payload?.url || action.payload?.focusId || ""}` };
    }

    default:
      return { success: false, message: `Unknown action type: ${action.type}` };
  }
}
