/**
 * system-tools.ts — System monitoring tools for CPU, memory, disk, and process info.
 */

import os from "node:os";
import { execSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { EnsoAgentTool } from "./local-types.js";
import { getActiveClientId } from "./runtime.js";
import { logAction, logError } from "./action-log.js";

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

    // ── Shell Execute ──
    {
      name: "enso_shell_execute",
      label: "Execute Command",
      description: "Execute a system command and return its output. Uses array-based arguments for safety — no shell interpretation. Returns stdout, stderr, exit code, and execution duration.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          command: { type: "string", description: "Command to execute (e.g., 'node', 'git', 'npm')." },
          args: {
            type: "array",
            items: { type: "string" },
            description: "Command arguments as separate strings (e.g., ['--version'] or ['status', '--short']).",
          },
          cwd: { type: "string", description: "Working directory (default: D:\\Github\\Enso)." },
          timeout: { type: "number", description: "Timeout in seconds (default 30, max 120)." },
        },
        required: ["command"],
      },
      execute: async (_callId, params) => {
        const command = String((params as Record<string, unknown>).command ?? "").trim();
        if (!command) return errorResult("command is required");

        const rawArgs = (params as Record<string, unknown>).args;
        const args = Array.isArray(rawArgs) ? rawArgs.map(String) : [];
        const timeoutSec = Math.min(Math.max(Number((params as Record<string, unknown>).timeout ?? 30), 1), 120);
        const cwd = String((params as Record<string, unknown>).cwd ?? "D:\\Github\\Enso");

        if (!existsSync(cwd)) return errorResult(`working directory does not exist: ${cwd}`);

        const MAX_OUTPUT = 100 * 1024; // 100KB per stream
        const startTime = Date.now();

        try {
          const result = await new Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }>((resolve) => {
            const proc = spawn(command, args, {
              cwd,
              shell: false,
              timeout: timeoutSec * 1000,
              windowsHide: true,
              env: { ...process.env },
            });

            let stdout = "";
            let stderr = "";
            let stdoutBytes = 0;
            let stderrBytes = 0;
            let timedOut = false;

            proc.stdout?.on("data", (chunk: Buffer) => {
              stdoutBytes += chunk.length;
              if (stdout.length < MAX_OUTPUT) {
                stdout += chunk.toString("utf-8");
              }
            });

            proc.stderr?.on("data", (chunk: Buffer) => {
              stderrBytes += chunk.length;
              if (stderr.length < MAX_OUTPUT) {
                stderr += chunk.toString("utf-8");
              }
            });

            proc.on("error", (err) => {
              resolve({ stdout, stderr: err.message, exitCode: -1, timedOut: false });
            });

            proc.on("close", (code) => {
              if (stdoutBytes > MAX_OUTPUT) {
                stdout = stdout.slice(0, MAX_OUTPUT) + `\n[TRUNCATED — ${stdoutBytes} bytes total]`;
              }
              if (stderrBytes > MAX_OUTPUT) {
                stderr = stderr.slice(0, MAX_OUTPUT) + `\n[TRUNCATED — ${stderrBytes} bytes total]`;
              }
              resolve({ stdout, stderr, exitCode: code, timedOut });
            });

            // Backup timeout
            setTimeout(() => {
              timedOut = true;
              try { proc.kill("SIGTERM"); } catch { /* ignore */ }
            }, timeoutSec * 1000 + 500);
          });

          const duration = Date.now() - startTime;

          logAction({
            ts: Date.now(),
            type: "action",
            category: "shell",
            message: `shell_execute: ${command} ${args.join(" ")} (cwd: ${cwd}, exit: ${result.exitCode}, ${duration}ms)`,
          });

          return jsonResult({
            tool: "enso_shell_execute",
            command,
            args,
            cwd,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            duration,
            timedOut: result.timedOut,
            success: result.exitCode === 0,
          });
        } catch (err) {
          return errorResult(`Command execution failed: ${err instanceof Error ? err.message : String(err)}`);
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
      execute: async (_callId, params, context) => {
        const task = (params as { task: string }).task;
        if (!task?.trim()) {
          return errorResult("Task description is required");
        }

        // Dynamically import to avoid circular dependencies
        const { getConnectedClient } = await import("./server.js");
        const { runClaudeCode } = await import("./claude-code.js");

        // Prefer context-injected client (from standalone-agent), fall back to global singleton
        type ClientGetter = () => { id: string; sessionKey: string; ws: unknown; send: (msg: unknown) => void; [k: string]: unknown };
        let client: ReturnType<typeof getConnectedClient> | undefined;
        if (context?.getClient) {
          client = (context.getClient as ClientGetter)() as ReturnType<typeof getConnectedClient>;
        }
        if (!client) {
          const clientId = (context?.clientId as string | undefined) ?? getActiveClientId();
          if (!clientId) {
            return errorResult("No active client — cannot launch session");
          }
          client = getConnectedClient(clientId);
        }
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
