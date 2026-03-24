/**
 * Orchestration Workspace — managed directory for all orchestration artifacts.
 *
 * Every orchestration (regular, evolution, discovery) gets a workspace at
 * `~/.enso/orchestrations/<orchestrationId>/` where all temp files live
 * during execution. No files should land in the project root.
 *
 * On completion:  evolution → archive to sprints dir, then cleanup workspace
 *                 regular  → cleanup workspace directly
 * On interruption: workspace persists for inspection/resume
 */

import { join } from "node:path";
import { mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { getEnsoPath } from "./utils/home.js";

// ── Types ──

export interface OrchestrationWorkspace {
  orchestrationId: string;
  rootDir: string;
  outputsDir: string;
  personasDir: string;
  screenshotsDir: string;
  planPath: string;
  dashboardPath: string;
  metaPath: string;

  // Path resolvers
  taskOutputPath(taskId: string): string;
  taskResearchPath(taskId: string): string;
  personaReportPath(personaId: string): string;
  personaScriptPath(personaId: string): string;
  retestReportPath(personaId: string): string;
  retestScriptPath(personaId: string): string;
  teamReportPath(agentId: string): string;
  evolutionFilePath(name: string): string;

  // Lifecycle
  ensure(): void;
  cleanup(): void;
  exists(): boolean;
}

// ── In-memory registry ──

const workspaces = new Map<string, OrchestrationWorkspace>();

// ── Constants ──

const ORCHESTRATIONS_DIR = "orchestrations";

// ── Factory ──

function buildWorkspace(orchestrationId: string): OrchestrationWorkspace {
  const rootDir = getEnsoPath(ORCHESTRATIONS_DIR, orchestrationId);
  const outputsDir = join(rootDir, "outputs");
  const personasDir = join(rootDir, "personas");
  const screenshotsDir = join(personasDir, "screenshots");

  return {
    orchestrationId,
    rootDir,
    outputsDir,
    personasDir,
    screenshotsDir,
    planPath: join(rootDir, "plan.json"),
    dashboardPath: join(rootDir, "dashboard-ui.jsx"),
    metaPath: join(rootDir, "meta.json"),

    taskOutputPath: (taskId: string) => join(outputsDir, `${taskId}.md`),
    taskResearchPath: (taskId: string) => join(outputsDir, `research-${taskId}.md`),
    personaReportPath: (personaId: string) => join(personasDir, `${personaId}.md`),
    personaScriptPath: (personaId: string) => join(personasDir, `test-${personaId}.mjs`),
    retestReportPath: (personaId: string) => join(personasDir, `retest-${personaId}.md`),
    retestScriptPath: (personaId: string) => join(personasDir, `retest-${personaId}.mjs`),
    teamReportPath: (agentId: string) => join(outputsDir, `team-${agentId}.md`),
    evolutionFilePath: (name: string) => join(outputsDir, `${name}.md`),

    ensure() {
      mkdirSync(rootDir, { recursive: true });
      mkdirSync(outputsDir, { recursive: true });
      mkdirSync(personasDir, { recursive: true });
      mkdirSync(screenshotsDir, { recursive: true });
    },

    cleanup() {
      try {
        rmSync(rootDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors — workspace may already be gone
      }
      workspaces.delete(orchestrationId);
    },

    exists() {
      return existsSync(rootDir);
    },
  };
}

// ── Public API ──

/** Create a new workspace and register it. Creates all subdirectories. */
export function createWorkspace(orchestrationId: string): OrchestrationWorkspace {
  const ws = buildWorkspace(orchestrationId);
  ws.ensure();
  workspaces.set(orchestrationId, ws);
  return ws;
}

/** Get an existing workspace by ID. Checks in-memory first, then disk. */
export function getWorkspace(orchestrationId: string): OrchestrationWorkspace | undefined {
  const cached = workspaces.get(orchestrationId);
  if (cached) return cached;

  // Check if workspace exists on disk (e.g. from a previous server session)
  const ws = buildWorkspace(orchestrationId);
  if (ws.exists()) {
    workspaces.set(orchestrationId, ws);
    return ws;
  }
  return undefined;
}

/** List all workspace directories on disk. Returns workspace objects. */
export function listWorkspaces(): OrchestrationWorkspace[] {
  const baseDir = getEnsoPath(ORCHESTRATIONS_DIR);
  if (!existsSync(baseDir)) return [];

  try {
    return readdirSync(baseDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const ws = buildWorkspace(d.name);
        workspaces.set(d.name, ws);
        return ws;
      });
  } catch {
    return [];
  }
}

/** Remove a workspace from the in-memory registry (without deleting files). */
export function forgetWorkspace(orchestrationId: string): void {
  workspaces.delete(orchestrationId);
}
