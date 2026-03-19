/**
 * Evolution Sprint Archive — persists evolution sprint artifacts to disk.
 *
 * Storage: ~/.openclaw/enso-evolution/<sprintId>/
 *   meta.json           — sprint metadata + file inventory
 *   personas/            — persona test reports (.md)
 *   synthesis.md         — synthesized findings
 *   discussion.md        — product team discussion
 *   design.md            — technical design
 *   implementation.md    — implementation log
 *   review.md            — code review results
 *   validation/           — re-test reports
 *   dashboard-ui.jsx     — bespoke interactive dashboard
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync, statSync } from "fs";
import { join, basename } from "path";
import { logAction, logError } from "./action-log.js";

const HOME = process.env.HOME || process.env.USERPROFILE || "";
const EVOLUTION_DIR = join(HOME, ".openclaw", "enso-evolution");

// ── Types ──

export interface EvolutionSprintMeta {
  sprintId: string;
  goal: string;
  createdAt: number;
  completedAt: number;
  status: "completed" | "failed" | "partial";
  phases: {
    personas: { count: number; files: string[] };
    synthesis: boolean;
    discussion: boolean;
    design: boolean;
    implementation: boolean;
    review: boolean;
    validation: { count: number; files: string[] };
    dashboard: boolean;
  };
  files: string[];  // all file paths relative to sprint dir
}

// ── Archive ──

/**
 * Archive an evolution sprint — copies all `.evolution-*` and `.orchestration-ui.jsx`
 * from the project root into a persistent sprint directory.
 */
export function archiveEvolutionSprint(
  sprintId: string,
  goal: string,
  projectRoot: string,
): EvolutionSprintMeta | null {
  try {
    // Ensure base dir exists
    mkdirSync(EVOLUTION_DIR, { recursive: true });

    const sprintDir = join(EVOLUTION_DIR, sprintId);
    mkdirSync(sprintDir, { recursive: true });
    mkdirSync(join(sprintDir, "personas"), { recursive: true });
    mkdirSync(join(sprintDir, "validation"), { recursive: true });

    const allFiles: string[] = [];
    const personaFiles: string[] = [];
    const validationFiles: string[] = [];
    let hasSynthesis = false;
    let hasDiscussion = false;
    let hasDesign = false;
    let hasImplementation = false;
    let hasReview = false;
    let hasDashboard = false;

    // Scan project root for evolution artifacts
    const rootFiles = readdirSync(projectRoot).filter(f =>
      f.startsWith(".evolution-") ||
      f === ".orchestration-ui.jsx" ||
      f.startsWith("retest-persona-") ||
      f.startsWith(".orchestration-output-")
    );

    for (const file of rootFiles) {
      const srcPath = join(projectRoot, file);
      if (!existsSync(srcPath)) continue;

      // Skip directories and non-files
      try {
        if (!statSync(srcPath).isFile()) continue;
      } catch { continue; }

      // Determine destination
      let destName: string;
      let destDir = sprintDir;

      if (file.startsWith(".evolution-persona-")) {
        // Persona reports → personas/
        destName = file.replace(".evolution-", "");
        destDir = join(sprintDir, "personas");
        personaFiles.push(`personas/${destName}`);
      } else if (file.startsWith(".evolution-retest-")) {
        // Re-test reports → validation/
        destName = file.replace(".evolution-", "");
        destDir = join(sprintDir, "validation");
        validationFiles.push(`validation/${destName}`);
      } else if (file === ".evolution-synthesis.md") {
        destName = "synthesis.md";
        hasSynthesis = true;
      } else if (file === ".evolution-discussion.md") {
        destName = "discussion.md";
        hasDiscussion = true;
      } else if (file === ".evolution-design.md") {
        destName = "design.md";
        hasDesign = true;
      } else if (file === ".evolution-implementation.md") {
        destName = "implementation.md";
        hasImplementation = true;
      } else if (file === ".evolution-review.md") {
        destName = "review.md";
        hasReview = true;
      } else if (file === ".orchestration-ui.jsx") {
        destName = "dashboard-ui.jsx";
        hasDashboard = true;
      } else if (file.startsWith(".orchestration-output-")) {
        // Task output files
        destName = file.replace(".orchestration-output-", "output-");
        personaFiles.push(destName);
      } else {
        // Generic evolution files
        destName = file.replace(".evolution-", "");
      }

      const destPath = join(destDir, destName);
      try {
        copyFileSync(srcPath, destPath);
        const relPath = destDir === sprintDir ? destName : `${basename(destDir)}/${destName}`;
        if (!allFiles.includes(relPath)) allFiles.push(relPath);
      } catch (err) {
        logError("evolution-archive", `Failed to copy ${file}`, err);
      }
    }

    // Also check for retest scripts output (retest-persona-*.md in root)
    const retestFiles = readdirSync(projectRoot).filter(f =>
      f.startsWith("retest-persona-") && f.endsWith(".md")
    );
    for (const file of retestFiles) {
      const srcPath = join(projectRoot, file);
      const destName = file;
      const destPath = join(sprintDir, "validation", destName);
      try {
        copyFileSync(srcPath, destPath);
        validationFiles.push(`validation/${destName}`);
        allFiles.push(`validation/${destName}`);
      } catch { /* skip */ }
    }

    // Build meta
    const meta: EvolutionSprintMeta = {
      sprintId,
      goal,
      createdAt: Date.now(), // approximate — could be improved
      completedAt: Date.now(),
      status: allFiles.length > 0 ? "completed" : "partial",
      phases: {
        personas: { count: personaFiles.length, files: personaFiles },
        synthesis: hasSynthesis,
        discussion: hasDiscussion,
        design: hasDesign,
        implementation: hasImplementation,
        review: hasReview,
        validation: { count: validationFiles.length, files: validationFiles },
        dashboard: hasDashboard,
      },
      files: allFiles,
    };

    // Write meta.json
    writeFileSync(join(sprintDir, "meta.json"), JSON.stringify(meta, null, 2));

    logAction({
      ts: Date.now(),
      type: "action",
      category: "evolution-archive",
      message: `Archived evolution sprint ${sprintId}: ${allFiles.length} files (${personaFiles.length} personas, dashboard: ${hasDashboard})`,
    });

    return meta;
  } catch (err) {
    logError("evolution-archive", "Failed to archive evolution sprint", err);
    return null;
  }
}

/**
 * Clean up evolution temp files from project root after archiving.
 */
export function cleanEvolutionTempFiles(projectRoot: string): void {
  try {
    const patterns = [
      /^\.evolution-/,
      /^\.orchestration-ui\.jsx$/,
      /^\.orchestration-output-/,
      /^test-persona-.*\.mjs$/,
      /^retest-persona-.*\.mjs$/,
      /^retest-persona-.*\.md$/,
    ];
    const files = readdirSync(projectRoot);
    for (const file of files) {
      if (patterns.some(p => p.test(file))) {
        try { unlinkSync(join(projectRoot, file)); } catch { /* skip */ }
      }
    }
    // Clean evolution-screenshots dir
    const screenshotsDir = join(projectRoot, "evolution-screenshots");
    if (existsSync(screenshotsDir)) {
      const shots = readdirSync(screenshotsDir);
      for (const f of shots) {
        try { unlinkSync(join(screenshotsDir, f)); } catch { /* skip */ }
      }
      try { require("fs").rmdirSync(screenshotsDir); } catch { /* skip */ }
    }
  } catch { /* best effort */ }
}

// ── Query ──

/**
 * List all archived evolution sprints, newest first.
 */
export function listEvolutionSprints(): EvolutionSprintMeta[] {
  try {
    if (!existsSync(EVOLUTION_DIR)) return [];
    const dirs = readdirSync(EVOLUTION_DIR).filter(d => {
      const metaPath = join(EVOLUTION_DIR, d, "meta.json");
      return existsSync(metaPath);
    });
    const sprints: EvolutionSprintMeta[] = [];
    for (const dir of dirs) {
      try {
        const raw = readFileSync(join(EVOLUTION_DIR, dir, "meta.json"), "utf-8");
        sprints.push(JSON.parse(raw));
      } catch { /* skip corrupt entries */ }
    }
    // Sort newest first
    sprints.sort((a, b) => b.completedAt - a.completedAt);
    return sprints;
  } catch {
    return [];
  }
}

/**
 * Load a single evolution sprint's metadata.
 */
export function loadEvolutionSprint(sprintId: string): EvolutionSprintMeta | null {
  try {
    const metaPath = join(EVOLUTION_DIR, sprintId, "meta.json");
    if (!existsSync(metaPath)) return null;
    return JSON.parse(readFileSync(metaPath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Read a specific file from an archived sprint.
 */
export function getEvolutionFile(sprintId: string, filename: string): string | null {
  try {
    // Sanitize path to prevent directory traversal
    const safe = filename.replace(/\.\./g, "").replace(/\\/g, "/");
    const filePath = join(EVOLUTION_DIR, sprintId, safe);
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}
