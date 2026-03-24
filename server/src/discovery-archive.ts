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

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync, statSync, rmSync } from "fs";
import { join, basename, resolve } from "path";
import { logAction, logError } from "./action-log.js";
import { getEnsoPath } from "./utils/home.js";

const DISCOVERIES_DIR = getEnsoPath("discoveries");

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
 * Archive a discovery sprint — collects all discovery artifacts into a persistent directory.
 * When `workspaceDir` is provided, scans the orchestration workspace structure.
 * Otherwise falls back to scanning the project root for legacy artifact files.
 */
export function archiveDiscoveryResults(
  discoveryId: string,
  focus: string,
  projectRoot: string,
  workspaceDir?: string,
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

    if (workspaceDir && existsSync(workspaceDir)) {
      // ── Workspace-based archival ──
      // Workspace structure:
      //   outputs/<taskId>.md — task output files (sourcing, pitches, committee, etc.)
      //   outputs/investment-memo.md
      //   dashboard-ui.jsx

      // 1. Scan outputs/ dir for task outputs
      const wsOutputsDir = join(workspaceDir, "outputs");
      if (existsSync(wsOutputsDir)) {
        try {
          for (const file of readdirSync(wsOutputsDir)) {
            const srcPath = join(wsOutputsDir, file);
            try { if (!statSync(srcPath).isFile()) continue; } catch { continue; }

            let destSubdir = "";
            let destName = file;

            if (file.includes("sourcing") && file.endsWith(".md")) {
              destSubdir = "sourcing";
            } else if (file.startsWith("investment-pitch-") || (file.startsWith("pitch-") && file.endsWith(".md"))) {
              destSubdir = "pitches";
            } else if (file === "investment-recommendation.md" || file.startsWith("committee-")) {
              destSubdir = "committee";
            } else if (file === "investment-memo.md") {
              hasMemo = true;
              destSubdir = "";
            } else if (file.endsWith(".md")) {
              destSubdir = "outputs";
              destName = `output-${file}`;
            } else {
              continue;
            }

            const destDir = destSubdir ? join(discDir, destSubdir) : discDir;
            try {
              copyFileSync(srcPath, join(destDir, destName));
              const relPath = destSubdir ? `${destSubdir}/${destName}` : destName;
              if (!allFiles.includes(relPath)) {
                allFiles.push(relPath);
                if (destSubdir === "sourcing") sourcingFiles.push(relPath);
                else if (destSubdir === "pitches") pitchFiles.push(relPath);
                else if (destSubdir === "committee") committeeFiles.push(relPath);
              }
            } catch (err) { logError("discovery-archive", `Failed to copy ${file}`, err); }
          }
        } catch (err) { logError("discovery-archive", "Failed to scan workspace outputs dir", err); }
      }

      // 2. Dashboard from workspace root
      const wsDashboard = join(workspaceDir, "dashboard-ui.jsx");
      if (existsSync(wsDashboard)) {
        try {
          copyFileSync(wsDashboard, join(discDir, "dashboard-ui.jsx"));
          hasDashboard = true;
          allFiles.push("dashboard-ui.jsx");
        } catch (err) { logError("discovery-archive", "Failed to copy dashboard", err); }
      }

    } else {
      // ── Legacy fallback: scan project root for discovery artifacts ──
      const dirsToScan = [projectRoot];
      for (const sub of ["server", "src"]) {
        const subPath = join(projectRoot, sub);
        if (existsSync(subPath)) dirsToScan.push(subPath);
      }

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

        if (file.startsWith(".orchestration-output-") && file.includes("sourcing")) {
          destName = file.replace(".orchestration-output-", "");
          destSubdir = "sourcing";
        }
        else if (file.startsWith("investment-pitch-")) {
          destName = file;
          destSubdir = "pitches";
        }
        else if (file === "investment-recommendation.md") {
          destName = file;
          destSubdir = "committee";
        }
        else if (file.startsWith(".orchestration-output-committee-")) {
          destName = file.replace(".orchestration-output-", "");
          destSubdir = "committee";
        }
        else if (file === ".orchestration-ui.jsx") {
          destName = "dashboard-ui.jsx";
          hasDashboard = true;
        }
        else if (file === "investment-memo.md") {
          destName = file;
          hasMemo = true;
        }
        else if (file.startsWith(".orchestration-output-")) {
          destName = file.replace(".orchestration-output-", "output-");
          destSubdir = "outputs";
        }
        else {
          continue;
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
 * Clean up discovery temp files after archiving.
 * When `workspaceDir` is provided, simply removes the entire workspace directory.
 * Otherwise falls back to pattern-matching cleanup in the project root.
 */
export function cleanDiscoveryTempFiles(projectRoot: string, workspaceDir?: string): void {
  // If workspace dir is provided, just remove it entirely
  if (workspaceDir && existsSync(workspaceDir)) {
    try {
      rmSync(workspaceDir, { recursive: true, force: true });
      return;
    } catch {
      // Fall through to legacy cleanup
    }
  }

  // Legacy fallback: pattern-matching cleanup in project root
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
