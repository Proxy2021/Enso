#!/usr/bin/env node
/**
 * Enso CLI — Command-line interface to the Enso server.
 *
 * Connects to a running Enso server via HTTP and consumes SSE streams.
 * No external dependencies — uses only node:http/https built-ins.
 *
 * Usage:
 *   enso status
 *   enso chat "What is quantum computing?"
 *   enso research "AI market analysis" [--deep]
 *   enso orchestrate "Build a stock screener app"
 *   enso evolve [--project <id>] [--goal "focus area"]
 *   enso discover ["AI developer tools"]
 *   enso code "Fix the bug in server.ts" [--cwd ./server]
 *   enso apps list
 *   enso apps run <family> [--params '{"key":"val"}']
 *   enso apps build "Build a habit tracker"
 *
 * Config (priority order):
 *   1. --server / --token flags
 *   2. ENSO_URL / ENSO_TOKEN env vars
 *   3. ~/.enso/cli.json
 *   4. http://localhost:3001
 */

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ── Config Resolution ───────────────────────────────────────────────────────

interface CLIConfig {
  server: string;
  token?: string;
}

function loadConfig(args: string[]): CLIConfig {
  let server = "http://localhost:3001";
  let token: string | undefined;

  // Flag overrides
  const serverIdx = args.indexOf("--server");
  if (serverIdx !== -1 && args[serverIdx + 1]) server = args[serverIdx + 1];

  const tokenIdx = args.indexOf("--token");
  if (tokenIdx !== -1 && args[tokenIdx + 1]) token = args[tokenIdx + 1];

  // Env vars (if no flags)
  if (serverIdx === -1 && process.env.ENSO_URL) server = process.env.ENSO_URL;
  if (tokenIdx === -1 && process.env.ENSO_TOKEN) token = process.env.ENSO_TOKEN;

  // Config file (if still defaults)
  if (serverIdx === -1 && !process.env.ENSO_URL) {
    const cfgPath = join(homedir(), ".enso", "cli.json");
    if (existsSync(cfgPath)) {
      try {
        const cfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
        if (cfg.server) server = cfg.server;
        if (cfg.token && !token) token = cfg.token;
      } catch { /* ignore malformed config */ }
    }
  }

  server = server.replace(/\/+$/, "");
  return { server, token };
}

// ── HTTP Helpers ────────────────────────────────────────────────────────────

function makeRequest(
  config: CLIConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, config.server);
    const isHttps = url.protocol === "https:";
    const fn = isHttps ? httpsRequest : httpRequest;

    const headers: Record<string, string> = {};
    if (config.token) headers["Authorization"] = `Bearer ${config.token}`;
    if (body) headers["Content-Type"] = "application/json";

    const req = fn(url, { method, headers }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode ?? 0,
          headers: res.headers as Record<string, string>,
          body: data,
        });
      });
    });

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function streamSSE(
  config: CLIConfig,
  method: string,
  path: string,
  body: unknown,
  opts: { json?: boolean; quiet?: boolean },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, config.server);
    const isHttps = url.protocol === "https:";
    const fn = isHttps ? httpsRequest : httpRequest;

    const headers: Record<string, string> = {
      "Accept": "text/event-stream",
    };
    if (config.token) headers["Authorization"] = `Bearer ${config.token}`;
    if (body) headers["Content-Type"] = "application/json";

    const req = fn(url, { method, headers }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          printError(`Server returned ${res.statusCode}: ${data}`);
          resolve();
        });
        return;
      }

      let buffer = "";
      let lastText = "";
      let gotFinal = false;

      res.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: done")) {
            resolve();
            return;
          }
          if (!line.startsWith("data: ")) continue;

          try {
            const msg = JSON.parse(line.slice(6));

            if (opts.json) {
              process.stdout.write(JSON.stringify(msg) + "\n");
              continue;
            }

            if (opts.quiet) {
              if (msg.state === "final" && msg.text) {
                lastText = msg.text;
                gotFinal = true;
              }
              continue;
            }

            // Formatted output
            if (msg.state === "error") {
              printError(msg.text ?? "Unknown error");
            } else if (msg.text) {
              if (msg.state === "final") {
                // For final, print the full text (replaces any deltas)
                if (lastText && msg.text.startsWith(lastText)) {
                  process.stdout.write(msg.text.slice(lastText.length));
                } else if (!lastText) {
                  process.stdout.write(msg.text);
                }
                lastText = msg.text;
                gotFinal = true;
              } else {
                // Delta — incremental streaming
                if (msg.text.startsWith(lastText) && msg.text.length > lastText.length) {
                  process.stdout.write(msg.text.slice(lastText.length));
                } else if (!lastText) {
                  process.stdout.write(msg.text);
                }
                lastText = msg.text;
              }
            }

            // Orchestration progress
            if (msg.orchestrationProgress) {
              const p = msg.orchestrationProgress;
              if (p.phase) {
                printInfo(`[${p.phase}] ${p.label ?? ""}`);
              }
              if (p.tasks) {
                const done = p.tasks.filter((t: any) => t.status === "completed").length;
                const total = p.tasks.length;
                printInfo(`  Progress: ${done}/${total} tasks`);
              }
            }

            // Operation status
            if (msg.operation) {
              const op = msg.operation;
              if (op.label) printInfo(`[${op.stage}] ${op.label}`);
            }

            // App data (for apps.run)
            if (msg.data && !msg.text && msg.state === "final") {
              process.stdout.write(JSON.stringify(msg.data, null, 2) + "\n");
              gotFinal = true;
            }

            // Build complete
            if (msg.buildComplete) {
              const bc = msg.buildComplete;
              if (bc.success) {
                printSuccess(`Build complete: ${bc.summary?.description ?? "App built successfully"}`);
              } else {
                printError(`Build failed: ${bc.error ?? "Unknown error"}`);
              }
            }
          } catch {
            // Non-JSON SSE line — ignore
          }
        }
      });

      res.on("end", () => {
        if (opts.quiet && gotFinal) {
          process.stdout.write(lastText + "\n");
        } else if (!gotFinal && !opts.json) {
          process.stdout.write("\n");
        }
        resolve();
      });

      res.on("error", reject);
    });

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Output Formatting ───────────────────────────────────────────────────────

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

function printError(msg: string): void {
  process.stderr.write(`${RED}error${RESET}: ${msg}\n`);
}

function printSuccess(msg: string): void {
  process.stderr.write(`${GREEN}ok${RESET}: ${msg}\n`);
}

function printInfo(msg: string): void {
  process.stderr.write(`${DIM}${msg}${RESET}\n`);
}

// ── Commands ────────────────────────────────────────────────────────────────

async function cmdStatus(config: CLIConfig): Promise<void> {
  try {
    const res = await makeRequest(config, "GET", "/health");
    if (res.statusCode !== 200) {
      printError(`Server returned ${res.statusCode}`);
      process.exit(1);
    }
    const health = JSON.parse(res.body);
    console.log(`${BOLD}Enso Server${RESET}`);
    console.log(`  Status:   ${GREEN}${health.status}${RESET}`);
    console.log(`  Version:  ${health.versionName} (build ${health.versionCode})`);
    console.log(`  Clients:  ${health.clients}`);
    if (health.machine) {
      console.log(`  Machine:  ${health.machine.name} (${health.machine.platform}/${health.machine.arch}, ${health.machine.memoryGB}GB)`);
    }
    console.log(`  Auth:     ${health.authRequired ? YELLOW + "required" + RESET : DIM + "disabled" + RESET}`);
    console.log(`  Server:   ${DIM}${config.server}${RESET}`);
  } catch (err: any) {
    printError(`Cannot connect to ${config.server}: ${err.message}`);
    printInfo("Is the Enso server running? Start with: npm run dev:server");
    process.exit(1);
  }
}

async function cmdChat(config: CLIConfig, text: string, flags: ParsedFlags): Promise<void> {
  await streamSSE(config, "POST", "/api/actions/chat", {
    text,
    model: flags.model,
    thinking: flags.thinking,
  }, { json: flags.json, quiet: flags.quiet });
  process.stdout.write("\n");
}

async function cmdResearch(config: CLIConfig, query: string, flags: ParsedFlags): Promise<void> {
  const depth = flags.deep ? "deep" : flags.quick ? "quick" : "standard";
  await streamSSE(config, "POST", "/api/actions/research", { query, depth }, { json: flags.json, quiet: flags.quiet });
  process.stdout.write("\n");
}

async function cmdOrchestrate(config: CLIConfig, goal: string, flags: ParsedFlags): Promise<void> {
  printInfo("Starting orchestration... (this may take several minutes)");
  await streamSSE(config, "POST", "/api/actions/orchestrate", { goal }, { json: flags.json, quiet: flags.quiet });
}

async function cmdEvolve(config: CLIConfig, flags: ParsedFlags): Promise<void> {
  printInfo("Starting evolution sprint... (this may take 30-60 minutes)");
  await streamSSE(config, "POST", "/api/actions/evolve", {
    projectId: flags.project,
    goal: flags.goal,
  }, { json: flags.json, quiet: flags.quiet });
}

async function cmdDiscover(config: CLIConfig, focus: string | undefined, flags: ParsedFlags): Promise<void> {
  printInfo("Starting discovery... (this may take 30+ minutes)");
  await streamSSE(config, "POST", "/api/actions/discover", { focus }, { json: flags.json, quiet: flags.quiet });
}

async function cmdCode(config: CLIConfig, prompt: string, flags: ParsedFlags): Promise<void> {
  await streamSSE(config, "POST", "/api/actions/code", {
    prompt,
    cwd: flags.cwd,
    model: flags.model,
    thinking: flags.thinking,
  }, { json: flags.json, quiet: flags.quiet });
}

async function cmdAppsList(config: CLIConfig, flags: ParsedFlags): Promise<void> {
  const res = await makeRequest(config, "GET", "/api/actions/apps");
  if (res.statusCode !== 200) {
    printError(`Failed to list apps: ${res.body}`);
    process.exit(1);
  }

  const { apps } = JSON.parse(res.body);

  if (flags.json) {
    console.log(JSON.stringify(apps, null, 2));
    return;
  }

  if (!apps.length) {
    console.log(`${DIM}No apps installed${RESET}`);
    return;
  }

  console.log(`${BOLD}Installed Apps${RESET} (${apps.length})\n`);
  const maxId = Math.max(...apps.map((a: any) => a.appId.length), 12);
  console.log(`  ${BOLD}${"APP".padEnd(maxId)}  ${"TOOLS".padStart(5)}  TYPE        DESCRIPTION${RESET}`);
  console.log(`  ${"─".repeat(maxId)}  ${"─".repeat(5)}  ${"─".repeat(10)}  ${"─".repeat(30)}`);

  for (const app of apps) {
    const kind = app.system ? `${CYAN}system${RESET}    ` : app.shipped ? `${GREEN}shipped${RESET}   ` : `${YELLOW}user${RESET}      `;
    console.log(`  ${app.appId.padEnd(maxId)}  ${String(app.toolCount).padStart(5)}  ${kind}  ${DIM}${(app.description ?? "").slice(0, 50)}${RESET}`);
  }
}

async function cmdAppsRun(config: CLIConfig, toolFamily: string, flags: ParsedFlags): Promise<void> {
  let params: Record<string, unknown> | undefined;
  if (flags.params) {
    try {
      params = JSON.parse(flags.params);
    } catch {
      printError("Invalid --params JSON");
      process.exit(1);
    }
  }

  await streamSSE(config, "POST", "/api/actions/apps/run", { toolFamily, params }, { json: flags.json, quiet: flags.quiet });
}

async function cmdAppsBuild(config: CLIConfig, instruction: string, flags: ParsedFlags): Promise<void> {
  printInfo("Building app via Claude Code...");
  await streamSSE(config, "POST", "/api/actions/apps/build", { instruction }, { json: flags.json, quiet: flags.quiet });
}

// ── Argument Parsing ────────────────────────────────────────────────────────

interface ParsedFlags {
  json: boolean;
  quiet: boolean;
  deep: boolean;
  quick: boolean;
  model?: string;
  thinking?: string;
  cwd?: string;
  project?: string;
  goal?: string;
  params?: string;
}

function parseFlags(args: string[]): { positional: string[]; flags: ParsedFlags } {
  const positional: string[] = [];
  const flags: ParsedFlags = { json: false, quiet: false, deep: false, quick: false };

  const skipFlags = new Set(["--server", "--token"]);
  let i = 0;

  while (i < args.length) {
    const arg = args[i];
    if (skipFlags.has(arg)) { i += 2; continue; }

    if (arg === "--json") { flags.json = true; i++; continue; }
    if (arg === "--quiet" || arg === "-q") { flags.quiet = true; i++; continue; }
    if (arg === "--deep") { flags.deep = true; i++; continue; }
    if (arg === "--quick") { flags.quick = true; i++; continue; }
    if (arg === "--model" && args[i + 1]) { flags.model = args[i + 1]; i += 2; continue; }
    if (arg === "--thinking" && args[i + 1]) { flags.thinking = args[i + 1]; i += 2; continue; }
    if (arg === "--cwd" && args[i + 1]) { flags.cwd = args[i + 1]; i += 2; continue; }
    if (arg === "--project" && args[i + 1]) { flags.project = args[i + 1]; i += 2; continue; }
    if (arg === "--goal" && args[i + 1]) { flags.goal = args[i + 1]; i += 2; continue; }
    if (arg === "--params" && args[i + 1]) { flags.params = args[i + 1]; i += 2; continue; }

    if (!arg.startsWith("-")) positional.push(arg);
    i++;
  }

  return { positional, flags };
}

function printUsage(): void {
  console.log(`
${BOLD}Enso CLI${RESET} — Command-line interface to the Enso AI platform

${BOLD}USAGE${RESET}
  enso <command> [arguments] [flags]

${BOLD}COMMANDS${RESET}
  ${CYAN}status${RESET}                              Check server health
  ${CYAN}chat${RESET} <message>                       Send a message (auto-routed)
  ${CYAN}research${RESET} <query> [--deep|--quick]    Research a topic
  ${CYAN}orchestrate${RESET} <goal>                   Multi-agent orchestration
  ${CYAN}evolve${RESET} [--project id] [--goal ...]   Run evolution sprint
  ${CYAN}discover${RESET} [focus]                     AI VC discovery sprint
  ${CYAN}code${RESET} <prompt> [--cwd path]           Claude Code session
  ${CYAN}apps list${RESET}                            List installed apps
  ${CYAN}apps run${RESET} <family> [--params json]    Run an app
  ${CYAN}apps build${RESET} <instruction>             Build a new app

${BOLD}FLAGS${RESET}
  --server <url>     Server URL (default: http://localhost:3001)
  --token <token>    Access token for authentication
  --json             Output raw NDJSON (for piping/scripting)
  --quiet, -q        Only print final result
  --model <model>    Claude model (claude-opus-4-6, claude-sonnet-4-6)
  --cwd <path>       Working directory for code sessions
  --project <id>     Project ID for evolution
  --goal <text>      Sprint goal for evolution

${BOLD}CONFIG${RESET}
  Environment:  ENSO_URL, ENSO_TOKEN
  Config file:  ~/.enso/cli.json  { "server": "...", "token": "..." }

${BOLD}EXAMPLES${RESET}
  enso status
  enso chat "What is Enso?"
  enso research "AI market analysis 2026"
  enso apps list --json
  enso code "Fix the auth bug" --cwd ./server
  curl -N -H "Authorization: Bearer TOKEN" \\
    -d '{"text":"Hello"}' http://localhost:3001/api/actions/chat
`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printUsage();
    process.exit(0);
  }

  const config = loadConfig(args);
  const { positional, flags } = parseFlags(args);
  const command = positional[0];

  switch (command) {
    case "status":
      await cmdStatus(config);
      break;

    case "chat":
      if (!positional[1]) { printError("Usage: enso chat <message>"); process.exit(1); }
      await cmdChat(config, positional.slice(1).join(" "), flags);
      break;

    case "research":
      if (!positional[1]) { printError("Usage: enso research <query>"); process.exit(1); }
      await cmdResearch(config, positional.slice(1).join(" "), flags);
      break;

    case "orchestrate":
      if (!positional[1]) { printError("Usage: enso orchestrate <goal>"); process.exit(1); }
      await cmdOrchestrate(config, positional.slice(1).join(" "), flags);
      break;

    case "evolve":
      await cmdEvolve(config, flags);
      break;

    case "discover":
      await cmdDiscover(config, positional.slice(1).join(" ") || undefined, flags);
      break;

    case "code":
      if (!positional[1]) { printError("Usage: enso code <prompt>"); process.exit(1); }
      await cmdCode(config, positional.slice(1).join(" "), flags);
      break;

    case "apps":
      switch (positional[1]) {
        case "list":
        case undefined:
          await cmdAppsList(config, flags);
          break;
        case "run":
          if (!positional[2]) { printError("Usage: enso apps run <family>"); process.exit(1); }
          await cmdAppsRun(config, positional[2], flags);
          break;
        case "build":
          if (!positional[2]) { printError("Usage: enso apps build <instruction>"); process.exit(1); }
          await cmdAppsBuild(config, positional.slice(2).join(" "), flags);
          break;
        default:
          printError(`Unknown apps subcommand: ${positional[1]}`);
          process.exit(1);
      }
      break;

    default:
      printError(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main().catch((err) => {
  printError(err.message ?? String(err));
  process.exit(1);
});
