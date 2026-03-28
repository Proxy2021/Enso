/**
 * system-tools.ts — System monitoring tools for CPU, memory, disk, and process info.
 */

import os from "node:os";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { EnsoAgentTool } from "./local-types.js";
import { getActiveClientId } from "./runtime.js";
import { logError } from "./action-log.js";

type AgentToolResult = { content: Array<{ type: string; text?: string }> };

function jsonResult(data: unknown): AgentToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(msg: string): AgentToolResult {
  return { content: [{ type: "text", text: `[ERROR] ${msg}` }] };
}

function getCpuUsage(): number {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    totalIdle += cpu.times.idle;
    totalTick += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }
  return Math.round((1 - totalIdle / totalTick) * 100);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

export function createSystemTools(): EnsoAgentTool[] {
  return [
    {
      name: "enso_system_info",
      label: "System Info",
      description: "Get system overview: CPU usage, memory, uptime, platform, hostname, and Node.js version.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
        required: [],
      },
      isPrimary: true,
      execute: async (_callId, _params) => {
        try {
          const totalMem = os.totalmem();
          const freeMem = os.freemem();
          const usedMem = totalMem - freeMem;
          const cpus = os.cpus();

          return jsonResult({
            tool: "enso_system_info",
            hostname: os.hostname(),
            platform: `${os.type()} ${os.release()}`,
            arch: os.arch(),
            cpuModel: cpus[0]?.model ?? "unknown",
            cpuCores: cpus.length,
            cpuUsage: getCpuUsage(),
            memory: {
              total: formatBytes(totalMem),
              used: formatBytes(usedMem),
              free: formatBytes(freeMem),
              usagePercent: Math.round((usedMem / totalMem) * 100),
            },
            uptime: formatUptime(os.uptime()),
            uptimeSeconds: Math.floor(os.uptime()),
            nodeVersion: process.version,
            pid: process.pid,
            loadAverage: os.loadavg().map((l) => Math.round(l * 100) / 100),
          });
        } catch (err) {
          return errorResult(`Failed to get system info: ${(err as Error).message}`);
        }
      },
    },
    {
      name: "enso_system_processes",
      label: "System Processes",
      description: "List top processes by CPU or memory usage.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          sort_by: {
            type: "string",
            enum: ["cpu", "memory"],
            description: "Sort processes by CPU or memory usage.",
          },
          limit: {
            type: "number",
            description: "Maximum number of processes to return (default 15, max 50).",
          },
        },
        required: [],
      },
      execute: async (_callId, params) => {
        const sortBy = String(params.sort_by ?? "cpu");
        const limit = Math.min(Math.max(Number(params.limit ?? 15), 1), 50);

        try {
          let processes: Array<{ pid: number; name: string; cpu: string; memory: string }> = [];

          if (process.platform === "win32") {
            const raw = execSync(
              'powershell -NoProfile -Command "Get-Process | Sort-Object -Property ' +
                (sortBy === "memory" ? "WorkingSet64" : "CPU") +
                ' -Descending | Select-Object -First ' + limit +
                ' -Property Id,ProcessName,CPU,@{N=\\"MemMB\\";E={[math]::Round($_.WorkingSet64/1MB,1)}} | ConvertTo-Json"',
              { encoding: "utf-8", timeout: 10_000 },
            );
            const parsed = JSON.parse(raw);
            const items = Array.isArray(parsed) ? parsed : [parsed];
            processes = items.map((p: { Id: number; ProcessName: string; CPU: number; MemMB: number }) => ({
              pid: p.Id,
              name: p.ProcessName,
              cpu: `${Math.round((p.CPU ?? 0) * 10) / 10}s`,
              memory: `${p.MemMB ?? 0} MB`,
            }));
          } else {
            // macOS ps doesn't support --sort; use -r (CPU) or -m (memory) flags instead.
            // Linux ps supports --sort=-%cpu / --sort=-%mem.
            const isMac = process.platform === "darwin";
            const psCmd = isMac
              ? `ps aux ${sortBy === "memory" ? "-m" : "-r"} | head -n ${limit + 1}`
              : `ps aux --sort=${sortBy === "memory" ? "-%mem" : "-%cpu"} | head -n ${limit + 1}`;
            const raw = execSync(
              psCmd,
              { encoding: "utf-8", timeout: 10_000 },
            );
            const lines = raw.trim().split("\n").slice(1);
            processes = lines.map((line) => {
              const parts = line.trim().split(/\s+/);
              return {
                pid: parseInt(parts[1], 10),
                name: parts.slice(10).join(" "),
                cpu: `${parts[2]}%`,
                memory: `${parts[3]}%`,
              };
            });
          }

          return jsonResult({
            tool: "enso_system_processes",
            sortBy,
            count: processes.length,
            processes,
          });
        } catch (err) {
          return errorResult(`Failed to list processes: ${(err as Error).message}`);
        }
      },
    },
    {
      name: "enso_system_disk",
      label: "Disk Usage",
      description: "Get disk partition usage statistics.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
        required: [],
      },
      execute: async (_callId, _params) => {
        try {
          let disks: Array<{ mount: string; filesystem: string; total: string; used: string; free: string; usagePercent: number }> = [];

          if (process.platform === "win32") {
            const raw = execSync(
              'powershell -NoProfile -Command "Get-PSDrive -PSProvider FileSystem | Select-Object Name,Used,Free | ConvertTo-Json"',
              { encoding: "utf-8", timeout: 10_000 },
            );
            const parsed = JSON.parse(raw);
            const items = Array.isArray(parsed) ? parsed : [parsed];
            disks = items
              .filter((d: { Used: number; Free: number }) => d.Used != null || d.Free != null)
              .map((d: { Name: string; Used: number; Free: number }) => {
                const used = d.Used ?? 0;
                const free = d.Free ?? 0;
                const total = used + free;
                return {
                  mount: `${d.Name}:\\`,
                  filesystem: "NTFS",
                  total: formatBytes(total),
                  used: formatBytes(used),
                  free: formatBytes(free),
                  usagePercent: total > 0 ? Math.round((used / total) * 100) : 0,
                };
              });
          } else {
            const raw = execSync("df -h --output=target,fstype,size,used,avail,pcent 2>/dev/null || df -h", {
              encoding: "utf-8",
              timeout: 10_000,
            });
            const lines = raw.trim().split("\n").slice(1);
            disks = lines
              .filter((l) => !l.includes("tmpfs") && !l.includes("devtmpfs"))
              .map((line) => {
                const parts = line.trim().split(/\s+/);
                return {
                  mount: parts[0],
                  filesystem: parts[1],
                  total: parts[2],
                  used: parts[3],
                  free: parts[4],
                  usagePercent: parseInt(parts[5], 10) || 0,
                };
              });
          }

          return jsonResult({
            tool: "enso_system_disk",
            count: disks.length,
            disks,
          });
        } catch (err) {
          return errorResult(`Failed to get disk info: ${(err as Error).message}`);
        }
      },
    },

    // ── Claude Code session launcher ──
    // Enables the agent to escalate tasks that require code writing, file operations,
    // web research, or multi-step execution to a Claude Code session.
    {
      name: "enso_launch_task_session",
      label: "Launch Task Session",
      description: "Launch a Claude Code session for tasks that require writing code, fixing bugs, building apps, file operations, web research with live data, data analysis, deployments, or any multi-step execution. Use this when you cannot fulfill the request with your available tools — when the task needs actual code to be written, files to be modified, commands to be run, or live web data to be fetched.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          task: {
            type: "string",
            description: "The full task description to pass to the Claude Code session. Include all relevant context from the user's request.",
          },
        },
        required: ["task"],
      },
      execute: async (_callId, params) => {
        const task = (params as { task: string }).task;
        if (!task?.trim()) {
          return errorResult("Task description is required");
        }

        const clientId = getActiveClientId();
        if (!clientId) {
          return errorResult("No active client — cannot launch session");
        }

        // Dynamically import to avoid circular dependencies
        const { getConnectedClient } = await import("./server.js");
        const { runClaudeCode } = await import("./claude-code.js");

        const client = getConnectedClient(clientId);
        if (!client) {
          return errorResult("Client disconnected");
        }

        const runId = randomUUID();
        const targetCardId = randomUUID();

        // Fire-and-forget: the session streams results back via WebSocket
        runClaudeCode({
          prompt: task,
          client,
          runId,
          targetCardId,
        }).catch((err) => {
          logError("enso_launch_task_session", "Claude Code session failed", err);
        });

        return jsonResult({
          tool: "enso_launch_task_session",
          status: "session_started",
          message: `Claude Code session launched for: ${task.slice(0, 100)}`,
        });
      },
    },
  ];
}
