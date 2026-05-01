#!/usr/bin/env node
/**
 * guardian.ts — Process supervisor for the Enso standalone server.
 *
 * Production entry point.  Forks standalone.ts as a child process and
 * monitors it via IPC heartbeats and HTTP health checks.  Restarts
 * automatically on crash with exponential backoff.
 *
 * Usage:
 *   npx tsx server/guardian.ts           # production
 *   npx tsx server/standalone.ts         # development (no guardian)
 */

import { fork, spawnSync, type ChildProcess } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { get as httpGet } from "node:http";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Exit code protocol ──
const EXIT_CLEAN = 0;
const EXIT_RESTART_REQUESTED = 78;

// ── Timing constants ──
const BACKOFF_INITIAL_MS = 1_000;
const BACKOFF_MAX_MS = 60_000;
const BACKOFF_RESET_AFTER_MS = 2 * 60_000;
const MAX_CONSECUTIVE_CRASHES = 10;
const HEALTH_POLL_MS = 30_000;
const HEALTH_FAIL_THRESHOLD = 3;
const HEALTH_TIMEOUT_MS = 5_000;
const STARTUP_GRACE_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 45_000;
const SHUTDOWN_KILL_TIMEOUT_MS = 10_000;
const MAX_CRASH_REPORTS = 50;
const MAX_LOG_LINES = 1_000;

// ── Paths ──
const ensoDir = resolve(homedir(), ".enso");
const crashDir = resolve(ensoDir, "crashes");
const guardianPidFile = resolve(ensoDir, "guardian.pid");
const serverPidFile = resolve(ensoDir, "server.pid");
const logFile = resolve(ensoDir, "guardian.log");

// ── State ──
let child: ChildProcess | null = null;
let childStartedAt = 0;
let lastHeartbeat = 0;
let consecutiveCrashes = 0;
let currentBackoff = BACKOFF_INITIAL_MS;
let healthFailures = 0;
let shuttingDown = false;
let serverPort = 3001;
let lastHeartbeatData: Record<string, unknown> | null = null;

// ── Bootstrap directories ──
mkdirSync(crashDir, { recursive: true });

// ── Logging ──

function log(msg: string) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  try {
    appendFileSync(logFile, line + "\n");
  } catch {
    /* disk full or permissions — nothing we can do */
  }
}

function trimLog() {
  try {
    if (!existsSync(logFile)) return;
    const lines = readFileSync(logFile, "utf-8").split("\n");
    if (lines.length > MAX_LOG_LINES) {
      writeFileSync(logFile, lines.slice(-MAX_LOG_LINES).join("\n"));
    }
  } catch {
    /* best-effort */
  }
}

// ── PID files ──

function writePid(file: string, pid: number) {
  try {
    writeFileSync(file, String(pid));
  } catch {
    /* best-effort */
  }
}

function removePid(file: string) {
  try {
    if (existsSync(file)) unlinkSync(file);
  } catch {
    /* best-effort */
  }
}

// ── Crash forensics ──

function writeCrashReport(
  exitCode: number | null,
  signal: string | null,
  reason: string,
) {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const report = {
      timestamp: new Date().toISOString(),
      exitCode,
      signal,
      reason,
      uptimeMs: Date.now() - childStartedAt,
      consecutiveCrashes,
      lastHeartbeat: lastHeartbeat
        ? new Date(lastHeartbeat).toISOString()
        : null,
      memoryAtLastHeartbeat: lastHeartbeatData?.memory ?? null,
    };
    writeFileSync(
      resolve(crashDir, `${ts}-crash.json`),
      JSON.stringify(report, null, 2),
    );
    pruneCrashReports();
  } catch (err) {
    log(`[guardian] Failed to write crash report: ${err}`);
  }
}

function pruneCrashReports() {
  try {
    const files = readdirSync(crashDir)
      .filter((f) => f.endsWith("-crash.json"))
      .sort();
    while (files.length > MAX_CRASH_REPORTS) {
      unlinkSync(resolve(crashDir, files.shift()!));
    }
  } catch {
    /* best-effort */
  }
}

// ── Port detection ──

function readPort(): number {
  try {
    const envPath = resolve(__dirname, ".env");
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split(/\r?\n/)) {
      const t = line.trim();
      if (t.startsWith("ENSO_PORT=")) {
        return parseInt(t.split("=")[1], 10) || 3001;
      }
    }
  } catch {
    /* no .env — use default */
  }
  return parseInt(process.env.ENSO_PORT || "3001", 10) || 3001;
}

// ── Health polling ──

function pollHealth() {
  if (shuttingDown || !child) return;
  if (Date.now() - childStartedAt < STARTUP_GRACE_MS) return;

  const req = httpGet(
    `http://localhost:${serverPort}/health`,
    { timeout: HEALTH_TIMEOUT_MS },
    (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode === 200) {
          healthFailures = 0;
        } else {
          onHealthFailure();
        }
      });
    },
  );
  req.on("error", () => onHealthFailure());
  req.on("timeout", () => {
    req.destroy();
    onHealthFailure();
  });
}

function onHealthFailure() {
  healthFailures++;
  log(
    `[guardian] Health check failed (${healthFailures}/${HEALTH_FAIL_THRESHOLD})`,
  );
  if (healthFailures >= HEALTH_FAIL_THRESHOLD) {
    log(
      `[guardian] Server unresponsive after ${healthFailures} consecutive failures — killing`,
    );
    killChild("health check timeout");
  }
}

// ── Heartbeat monitoring ──

function checkHeartbeat() {
  if (shuttingDown || !child) return;
  if (Date.now() - childStartedAt < STARTUP_GRACE_MS) return;
  if (lastHeartbeat > 0 && Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
    const staleMs = Math.round((Date.now() - lastHeartbeat) / 1000);
    log(
      `[guardian] No heartbeat for ${staleMs}s — event loop likely frozen, killing`,
    );
    killChild("heartbeat timeout (frozen event loop)");
  }
}

// ── Kill child ──

function killChild(reason: string) {
  if (!child) return;
  log(`[guardian] Killing child PID ${child.pid} — ${reason}`);
  try {
    child.kill("SIGKILL");
  } catch {
    /* already dead */
  }
}

// ── Frontend build (run once on guardian start) ──

function buildFrontend() {
  if (process.env.ENSO_SKIP_BUILD === "1") {
    log("[guardian] ENSO_SKIP_BUILD=1 — skipping frontend build");
    return;
  }
  const repoRoot = resolve(__dirname, "..");
  if (!existsSync(resolve(repoRoot, "package.json"))) {
    log("[guardian] No package.json at repo root — skipping frontend build");
    return;
  }
  log("[guardian] Building frontend (npm run build)…");
  const start = Date.now();
  const result = spawnSync("npm", ["run", "build"], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  const elapsed = Math.round((Date.now() - start) / 1000);
  if (result.status === 0) {
    log(`[guardian] Frontend build complete (${elapsed}s)`);
  } else {
    log(
      `[guardian] ⚠️ Frontend build failed (status=${result.status}, signal=${result.signal}) — continuing with existing dist/`,
    );
  }
}

// ── Spawn server ──

function spawnServer() {
  if (shuttingDown) return;

  const script = resolve(__dirname, "standalone.ts");
  log(`[guardian] Spawning server (attempt ${consecutiveCrashes + 1})`);

  child = fork(script, [], {
    execArgv: process.execArgv,
    stdio: ["inherit", "inherit", "inherit", "ipc"],
    cwd: resolve(__dirname, ".."),
    env: { ...process.env, ENSO_GUARDIAN_MANAGED: "1" },
  });

  childStartedAt = Date.now();
  lastHeartbeat = 0;
  healthFailures = 0;
  lastHeartbeatData = null;

  if (child.pid) {
    writePid(serverPidFile, child.pid);
    log(`[guardian] Server started (PID ${child.pid})`);
  }

  // IPC from child
  child.on("message", (msg: unknown) => {
    const m = msg as Record<string, unknown>;
    if (m?.type === "heartbeat") {
      lastHeartbeat = Date.now();
      lastHeartbeatData = m;
    } else if (m?.type === "port") {
      serverPort = (m.port as number) ?? serverPort;
    }
  });

  child.on("exit", (code, signal) => {
    removePid(serverPidFile);
    child = null;

    if (shuttingDown) {
      log(
        `[guardian] Server exited during shutdown (code=${code}, signal=${signal})`,
      );
      return;
    }

    const wasStable = Date.now() - childStartedAt > BACKOFF_RESET_AFTER_MS;

    // Clean shutdown — guardian also exits
    if (code === EXIT_CLEAN) {
      log("[guardian] Server exited cleanly (code 0) — guardian shutting down");
      cleanup();
      process.exit(0);
      return;
    }

    // Self-heal requested restart — restart immediately
    if (code === EXIT_RESTART_REQUESTED) {
      log("[guardian] Server requested restart (code 78) — restarting now");
      writeCrashReport(code, signal, "restart requested by self-heal");
      if (wasStable) {
        consecutiveCrashes = 0;
        currentBackoff = BACKOFF_INITIAL_MS;
      }
      setImmediate(spawnServer);
      return;
    }

    // Crash
    consecutiveCrashes++;
    const reason = signal
      ? `killed by signal ${signal}`
      : `exit code ${code}`;
    log(
      `[guardian] Server crashed: ${reason} (consecutive: ${consecutiveCrashes})`,
    );
    writeCrashReport(code, signal, reason);

    if (consecutiveCrashes >= MAX_CONSECUTIVE_CRASHES) {
      log(
        `[guardian] HALTED — ${MAX_CONSECUTIVE_CRASHES} consecutive crashes. ` +
          `Manual intervention required. Check ${crashDir}`,
      );
      cleanup();
      process.exit(2);
      return;
    }

    if (wasStable) {
      consecutiveCrashes = 1;
      currentBackoff = BACKOFF_INITIAL_MS;
    }

    log(`[guardian] Restarting in ${currentBackoff}ms`);
    setTimeout(spawnServer, currentBackoff);
    currentBackoff = Math.min(currentBackoff * 2, BACKOFF_MAX_MS);
  });

  child.on("error", (err) => {
    log(`[guardian] Child process error: ${err.message}`);
  });
}

// ── Cleanup ──

function cleanup() {
  removePid(guardianPidFile);
  removePid(serverPidFile);
  clearInterval(healthTimer);
  clearInterval(heartbeatTimer);
}

// ── Graceful shutdown ──

function shutdown(sig: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`[guardian] Received ${sig} — shutting down`);

  if (child) {
    child.kill("SIGTERM");
    const forceTimer = setTimeout(() => {
      if (child) {
        log("[guardian] Child did not exit in time — force killing");
        child.kill("SIGKILL");
      }
    }, SHUTDOWN_KILL_TIMEOUT_MS);
    // Don't let the force timer keep the process alive if child exits
    forceTimer.unref();

    child.on("exit", () => {
      clearTimeout(forceTimer);
      cleanup();
      process.exit(0);
    });
  } else {
    cleanup();
    process.exit(0);
  }
}

// ── Main ──

trimLog();
serverPort = readPort();

log(`[guardian] Starting Enso guardian (PID ${process.pid})`);
log(`[guardian] Server port: ${serverPort}`);
writePid(guardianPidFile, process.pid);

const healthTimer = setInterval(pollHealth, HEALTH_POLL_MS);
const heartbeatTimer = setInterval(checkHeartbeat, 10_000);

buildFrontend();
spawnServer();

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (err) => {
  log(`[guardian] FATAL uncaught exception: ${err.message}\n${err.stack}`);
  cleanup();
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  log(`[guardian] Unhandled rejection: ${reason}`);
});
