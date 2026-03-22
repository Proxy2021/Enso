#!/usr/bin/env node
/**
 * standalone.ts — Run Enso without OpenClaw.
 *
 * Usage:
 *   npx tsx server/standalone.ts         # direct (development)
 *   npx tsx server/guardian.ts           # supervised (production)
 *
 * Starts the Enso Express+WS server directly, registers all tools in the
 * local registry, and uses the configured LLM for the chat agent pipeline.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Load .env ──

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFile(): void {
  try {
    const envPath = resolve(__dirname, ".env");
    const content = readFileSync(envPath, "utf-8");
    let loaded = 0;
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
        loaded++;
      }
    }
    if (loaded > 0) console.log(`[enso:standalone] Loaded ${loaded} env var(s)`);
  } catch {
    // .env not found — rely on system env
  }
}

loadEnvFile();

// ── Imports (after env load so API keys are available) ──

import { resolveEnsoAccount } from "./src/accounts.js";
import { startEnsoServer } from "./src/server.js";
import type { CoreConfig } from "./src/types.js";
import { registerLocalTool, localToolCount } from "./src/tool-registry-local.js";
import { createFilesystemTools } from "./src/filesystem-tools.js";
import { createMediaTools } from "./src/media-tools.js";
import { createScreenTools } from "./src/screen-tools.js";
import { createBrowserTools } from "./src/browser-tools.js";
import { createResearcherTools } from "./src/researcher-tools.js";
import { createClawHubTools } from "./src/clawhub-tools.js";
import { createMemoryTools } from "./src/memory-tools.js";
import { startSelfHealing } from "./src/self-heal.js";

// ── Exit codes ──
const EXIT_RESTART_REQUESTED = 78;

// ── Register all tools in the local registry ──

function registerAllTools(): void {
  const allToolSets = [
    createFilesystemTools(),
    createMediaTools(),
    createScreenTools(),
    createBrowserTools(),
    createResearcherTools(),
    createClawHubTools(),
    createMemoryTools(),
  ];
  for (const tools of allToolSets) {
    for (const tool of tools) {
      registerLocalTool(tool);
    }
  }
  console.log(`[enso:standalone] Registered ${localToolCount()} tools in local registry`);
}

// ── Start server ──

async function main(): Promise<void> {
  registerAllTools();

  const config: CoreConfig = {};
  const account = resolveEnsoAccount({ cfg: config });

  if (!account.geminiApiKey) {
    console.warn("[enso:standalone] WARNING: No GEMINI_API_KEY set. Chat will not work without it.");
    console.warn("[enso:standalone] Set GEMINI_API_KEY in .env or as an environment variable.");
  }

  const runtime = {
    log: (...args: unknown[]) => console.log("[enso]", ...args),
    error: (...args: unknown[]) => console.error("[enso:error]", ...args),
  };

  // ── Self-healing monitors ──
  let stopping = false;
  let serverStop: (() => Promise<void>) | undefined;

  const selfHeal = startSelfHealing({
    onRestartNeeded: (reason) => {
      console.error(`[enso:self-heal] Restart needed: ${reason}`);
      gracefulExit(EXIT_RESTART_REQUESTED);
    },
  });

  async function gracefulExit(code: number) {
    if (stopping) return;
    stopping = true;
    console.log(`[enso:standalone] Graceful exit (code=${code})...`);
    try {
      if (serverStop) await serverStop();
    } catch (err) {
      console.error("[enso:standalone] Error during stop:", err);
    }
    selfHeal.stop();
    process.exit(code);
  }

  // ── Process-level error handlers ──

  process.on("uncaughtException", (err, origin) => {
    console.error(`[enso:fatal] Uncaught exception (${origin}):`, err);
    selfHeal.recordError(err);
    gracefulExit(1);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[enso] Unhandled rejection:", reason);
    selfHeal.recordError(reason);
  });

  // ── Start server ──

  console.log(`[enso:standalone] Starting Enso server on :${account.port}`);
  console.log(`[enso:standalone] Mode: standalone (no OpenClaw)`);

  if (process.env.ENSO_GUARDIAN_MANAGED === "1") {
    console.log("[enso:standalone] Running under guardian supervision");
  }

  const { stop } = await startEnsoServer({
    account,
    config,
    runtime,
    selfHealMetrics: () => selfHeal.metrics(),
    onRestartRequested: () => gracefulExit(EXIT_RESTART_REQUESTED),
    statusSink: (patch) => {
      if (patch.lastInboundAt) console.log(`[enso:standalone] Inbound at ${new Date(patch.lastInboundAt).toISOString()}`);
    },
  });
  serverStop = stop;

  // Tell guardian what port we're on (if running under guardian)
  if (process.send) {
    try {
      process.send({ type: "port", port: account.port });
    } catch { /* guardian may not be listening yet */ }
  }

  // ── Graceful shutdown on signals ──
  process.on("SIGINT", () => gracefulExit(0));
  process.on("SIGTERM", () => gracefulExit(0));

  console.log(`[enso:standalone] Server running. Open http://localhost:${account.port}`);
  console.log(`[enso:standalone] Access token: ${account.accessToken}`);
}

main().catch((err) => {
  console.error("[enso:standalone] Fatal startup error:", err);
  process.exit(1);
});
