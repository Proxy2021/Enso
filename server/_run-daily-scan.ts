#!/usr/bin/env npx tsx
/**
 * Temporary script: Daily Data Source Update
 * Bootstraps the tool registry, runs all scanners, rebuilds profile, and triggers ingest.
 */

// Load API keys first (must happen before any tool imports)
import { loadApiKeys } from "./src/api-keys.js";
loadApiKeys();

import { registerLocalTool, localToolCount } from "./src/tool-registry-local.js";
import { createUserContextTools } from "./src/user-context-tools.js";
import { createYouTubeTools } from "./src/youtube-tools.js";
import { createEmailTools } from "./src/email-tools.js";
import { createCortexTools } from "./src/cortex-tools.js";
import { createSystemTools } from "./src/system-tools.js";
import { createBrowserTools } from "./src/browser-tools.js";
import { createFilesystemTools } from "./src/filesystem-tools.js";
import { buildUserContextProfile } from "./src/user-context-builder.js";
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// Register tools needed for scanning
const toolSets = [
  createFilesystemTools(),
  createBrowserTools(),
  createSystemTools(),
  createUserContextTools(),
  createEmailTools(),
  createYouTubeTools(),
  createCortexTools(),
];
for (const tools of toolSets) {
  for (const tool of tools) {
    registerLocalTool(tool);
  }
}
console.log(`[daily-scan] Registered ${localToolCount()} tools`);

// Read consent
const consentPath = join(homedir(), ".enso", "data", "user-context", "consent.json");
const consent = JSON.parse(readFileSync(consentPath, "utf-8"));

// Read pre-scan cache hashes for change detection
const cachePath = join(homedir(), ".enso", "data", "user-context", "cache");
const hashesPath = join(cachePath, "_hashes.json");
let preHashes: Record<string, string> = {};
try {
  const raw = JSON.parse(readFileSync(hashesPath, "utf-8"));
  for (const [k, v] of Object.entries(raw)) {
    preHashes[k] = (v as { hash: string }).hash;
  }
} catch { /* no pre-existing hashes */ }

console.log(`[daily-scan] Starting full scan — all consented sources...`);
console.log(`[daily-scan] Consent: ${Object.entries(consent).filter(([k,v]) => v === true).map(([k]) => k).join(", ")}`);

const startTime = Date.now();

try {
  // buildUserContextProfile runs all scanners, rebuilds profile, AND triggers post-scan pipeline
  // (cortex ingest + direct ingest + enrichment)
  const result = await buildUserContextProfile(consent);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n[daily-scan] === RESULTS ===`);
  console.log(`[daily-scan] Duration: ${elapsed}s`);
  console.log(`[daily-scan] Sources scanned: ${result.sourcesScanned.join(", ") || "none"}`);
  console.log(`[daily-scan] Interests found: ${result.interestCount}`);
  console.log(`[daily-scan] Projects found: ${result.projectCount}`);

  // Check what changed
  let postHashes: Record<string, string> = {};
  try {
    const raw = JSON.parse(readFileSync(hashesPath, "utf-8"));
    for (const [k, v] of Object.entries(raw)) {
      postHashes[k] = (v as { hash: string }).hash;
    }
  } catch { /* ignore */ }

  const changed: string[] = [];
  for (const [k, v] of Object.entries(postHashes)) {
    if (preHashes[k] !== v) changed.push(k);
  }
  const newKeys = Object.keys(postHashes).filter(k => !(k in preHashes));

  if (changed.length > 0) {
    console.log(`[daily-scan] Changed caches: ${changed.join(", ")}`);
  } else {
    console.log(`[daily-scan] No data changes detected`);
  }
  if (newKeys.length > 0) {
    console.log(`[daily-scan] New caches: ${newKeys.join(", ")}`);
  }

  console.log(`[daily-scan] Done.`);
} catch (err) {
  console.error(`[daily-scan] FAILED:`, err);
  process.exit(1);
}
