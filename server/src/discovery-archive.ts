/**
 * Discovery Archive — persists AI VC discovery sprint artifacts to disk.
 *
 * Storage: ~/.enso/discoveries/<discoveryId>/
 *   ├── meta.json
 *   ├── dashboard-ui.jsx          (interactive investment dashboard)
 *   ├── investment-memo.md        (PPT-style investment memo)
 *   ├── sourcing/                 (Phase 1: deal sourcing reports)
 *   │   ├── demand-signals.md
 *   │   ├── tech-timing.md
 *   │   └── competitive-gaps.md
 *   ├── pitches/                  (Phase 2: partner pitch documents)
 *   │   ├── pitch-<partner>.md
 *   │   └── ...
 *   ├── committee/                (Phase 3: IC challenge + recommendation)
 *   │   ├── challenge.md
 *   │   └── recommendation.md
 *   └── outputs/                  (raw task outputs)
 *       └── output-*.md
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync, statSync } from "fs";
import { join, basename, resolve } from "path";
import { logAction, logError } from "./action-log.js";

const HOME = process.env.HOME || process.env.USERPROFILE || "";
const DISCOVERIES_DIR = join(HOME, ".enso", "discoveries");

// ── Types ──

export interface DiscoveryMeta {
  discoveryId: string;
  focus: string;
  createdAt: number;
  completedAt: number;
  status: "completed" | "failed" | "partial";
  phases: {
    sourcing: { count: number; files: string[] };
    pitches: { count: number; files: string[] };
    committee: { count: number; files: string[] };
    deliverables: { dashboard: boolean; memo: boolean };
  };
  files: string[];   // all file paths relative to discovery dir
}

// ── Archive ──

/**
 * Archive a discovery sprint — collects all discovery artifacts from the project
 * root and organizes them into a persistent directory.
 */
export function archiveDiscoveryResults(
  discoveryId: string,
  focus: string,
  projectRoot: string,
): DiscoveryMeta | null {
  try {
    mkdirSync(DISCOVERIES_DIR, { recursive: true });
    const discDir = join(DISCOVERIES_DIR, discoveryId);
    mkdirSync(discDir, { recursive: true });
    mkdirSync(join(discDir, "sourcing"), { recursive: true });
    mkdirSync(join(discDir, "pitches"), { recursive: true });
    mkdirSync(join(discDir, "committee"), { recursive: true });
    mkdirSync(join(discDir, "outputs"), { recursive: true });

    const allFiles: string[] = [];
    const sourcingFiles: string[] = [];
    const pitchFiles: string[] = [];
    const committeeFiles: string[] = [];
    let hasDashboard = false;
    let hasMemo = false;

    // Scan project root and common subdirectories for discovery artifacts
    const dirsToScan = [projectRoot];
    for (const sub of ["server", "src"]) {
      const subPath = join(projectRoot, sub);
      if (existsSync(subPath)) dirsToScan.push(subPath);
    }

    // Collect all candidate files across directories
    const candidates: { file: string; srcDir: string }[] = [];
    for (const dir of dirsToScan) {
      try {
        for (const f of readdirSync(dir)) {
          candidates.push({ file: f, srcDir: dir });
        }
      } catch { /* dir not readable */ }
    }

    for (const { file, srcDir } of candidates) {
      const srcPath = join(srcDir, file);
      try { if (!statSync(srcPath).isFile()) continue; } catch { continue; }

      let destName: string | null = null;
      let destSubdir = "";

      // Phase 1: Sourcing reports (match actual orchestrator output names)
      if (file.startsWith(".orchestration-output-") && file.includes("sourcing")) {
        destName = file.replace(".orchestration-output-", "");
        destSubdir = "sourcing";
      }
      // Phase 2: Partner pitches
      else if (file.startsWith("investment-pitch-")) {
        destName = file;
        destSubdir = "pitches";
      }
      // Phase 3: Committee challenge & recommendation (single or multi-critic)
      else if (file === "investment-recommendation.md") {
        destName = file;
        destSubdir = "committee";
      }
      else if (file.startsWith(".orchestration-output-committee-")) {
        destName = file.replace(".orchestration-output-", "");
        destSubdir = "committee";
      }
      // Phase 4: Deliverables
      else if (file === ".orchestration-ui.jsx") {
        destName = "dashboard-ui.jsx";
        hasDashboard = true;
      }
      else if (file === "investment-memo.md") {
        destName = file;
        hasMemo = true;
      }
      // Raw task outputs
      else if (file.startsWith(".orchestration-output-")) {
        destName = file.replace(".orchestration-output-", "output-");
        destSubdir = "outputs";
      }
      else {
        continue; // Not a discovery artifact
      }

      const destDir = destSubdir ? join(discDir, destSubdir) : discDir;
      const destPath = join(destDir, destName);
      try {
        copyFileSync(srcPath, destPath);
        const relPath = destSubdir ? `${destSubdir}/${destName}` : destName;
        if (!allFiles.includes(relPath)) {
          allFiles.push(relPath);
          if (destSubdir === "sourcing") sourcingFiles.push(relPath);
          else if (destSubdir === "pitches") pitchFiles.push(relPath);
          else if (destSubdir === "committee") committeeFiles.push(relPath);
        }
      } catch (err) {
        logError("discovery-archive", `Failed to copy ${file}`, err);
      }
    }

    // Determine status
    const status: DiscoveryMeta["status"] =
      allFiles.length === 0 ? "failed"
        : (sourcingFiles.length > 0 && pitchFiles.length > 0 && committeeFiles.length > 0) ? "completed"
          : "partial";

    const meta: DiscoveryMeta = {
      discoveryId,
      focus,
      createdAt: Date.now(),
      completedAt: Date.now(),
      status,
      phases: {
        sourcing: { count: sourcingFiles.length, files: sourcingFiles },
        pitches: { count: pitchFiles.length, files: pitchFiles },
        committee: { count: committeeFiles.length, files: committeeFiles },
        deliverables: { dashboard: hasDashboard, memo: hasMemo },
      },
      files: allFiles,
    };

    writeFileSync(join(discDir, "meta.json"), JSON.stringify(meta, null, 2));

    logAction({
      ts: Date.now(),
      type: "action",
      category: "discovery-archive",
      message: `Archived discovery ${discoveryId}: ${allFiles.length} files (${sourcingFiles.length} sourcing, ${pitchFiles.length} pitches, dashboard: ${hasDashboard})`,
    });

    return meta;
  } catch (err) {
    logError("discovery-archive", "Failed to archive discovery results", err);
    return null;
  }
}

/**
 * Clean up discovery temp files from project root after archiving.
 */
export function cleanDiscoveryTempFiles(projectRoot: string): void {
  const patterns = [
    /^investment-pitch-.*\.md$/,
    /^investment-recommendation\.md$/,
    /^investment-memo\.md$/,
    /^\.orchestration-ui\.jsx$/,
    /^\.orchestration-output-/,
    /^committee-.*\.md$/,
  ];
  const dirsToClean = [projectRoot];
  for (const sub of ["server", "src"]) {
    const subPath = join(projectRoot, sub);
    if (existsSync(subPath)) dirsToClean.push(subPath);
  }
  for (const dir of dirsToClean) {
    try {
      for (const file of readdirSync(dir)) {
        if (patterns.some(p => p.test(file))) {
          try { unlinkSync(join(dir, file)); } catch (err) {
            logError("discovery-archive", "Failed to delete " + file, err);
          }
        }
      }
    } catch { /* dir not readable */ }
  }
}

// ── Query ──

/**
 * List all archived discovery results, newest first.
 */
export function listDiscoveryResults(): DiscoveryMeta[] {
  const results: DiscoveryMeta[] = [];
  if (!existsSync(DISCOVERIES_DIR)) return results;
  try {
    for (const dir of readdirSync(DISCOVERIES_DIR)) {
      const metaPath = join(DISCOVERIES_DIR, dir, "meta.json");
      if (existsSync(metaPath)) {
        try {
          results.push(JSON.parse(readFileSync(metaPath, "utf-8")));
        } catch (err) {
          logError("discovery-archive", "Failed to parse discovery meta: " + metaPath, err);
        }
      }
    }
  } catch (err) {
    logError("discovery-archive", "Failed to read discoveries dir", err);
  }
  results.sort((a, b) => b.completedAt - a.completedAt);
  return results;
}

/**
 * Load a single discovery result's metadata.
 */
export function loadDiscoveryResult(discoveryId: string): DiscoveryMeta | null {
  const metaPath = join(DISCOVERIES_DIR, discoveryId, "meta.json");
  if (!existsSync(metaPath)) return null;
  try { return JSON.parse(readFileSync(metaPath, "utf-8")); }
  catch (err) { logError("discovery-archive", "Failed to parse discovery meta", err); return null; }
}

/**
 * Read a specific file from an archived discovery.
 */
export function getDiscoveryFile(discoveryId: string, filename: string): string | null {
  const safeId = discoveryId.replace(/[^a-zA-Z0-9_-]/g, "");
  const resolved = resolve(DISCOVERIES_DIR, safeId, filename);
  const discoveryRoot = resolve(DISCOVERIES_DIR, safeId);
  if (!resolved.startsWith(discoveryRoot)) return null;
  if (!existsSync(resolved)) return null;
  try { return readFileSync(resolved, "utf-8"); }
  catch (err) { logError("discovery-archive", "Failed to read discovery file: " + resolved, err); return null; }
}
