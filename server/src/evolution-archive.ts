/**
 * Evolution Sprint Archive — persists evolution sprint artifacts to disk.
 *
 * Project-scoped storage: ~/.enso/projects/<projectId>/sprints/<sprintId>/
 * Legacy fallback: ~/.openclaw/enso-evolution/<sprintId>/
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync, statSync, rmSync } from "fs";
import { join, basename } from "path";
import { logAction, logError } from "./action-log.js";
import { getEnsoPath, HOME_DIR } from "./utils/home.js";

const PROJECTS_DIR = getEnsoPath("projects");
const LEGACY_EVOLUTION_DIR = join(HOME_DIR, ".openclaw", "enso-evolution");

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
  projectId: string;
  files: string[];  // all file paths relative to sprint dir
}

function getSprintsDir(projectId: string): string {
  return join(PROJECTS_DIR, projectId, "sprints");
}

// ── Archive ──

function determineSprintStatus(
  allFiles: string[],
  hasSynthesis: boolean,
  hasImplementation: boolean,
  hasReview: boolean,
): "completed" | "failed" | "partial" {
  if (allFiles.length === 0) return "failed";
  // Core engineering phases must all complete for "completed" status
  if (hasSynthesis && hasImplementation && hasReview) return "completed";
  // Some files exist but key phases missing
  return "partial";
}

/**
 * Archive an evolution sprint — copies all evolution artifacts into a persistent sprint directory.
 * When `workspaceDir` is provided, scans the orchestration workspace structure.
 * Otherwise falls back to scanning the project root for legacy `.evolution-*` files.
 */
export function archiveEvolutionSprint(
  sprintId: string,
  goal: string,
  projectRoot: string,
  projectId: string = "enso",
  workspaceDir?: string,
): EvolutionSprintMeta | null {
  try {
    // Ensure project sprints dir exists
    const baseDir = getSprintsDir(projectId);
    mkdirSync(baseDir, { recursive: true });

    const sprintDir = join(baseDir, sprintId);
    mkdirSync(sprintDir, { recursive: true });
    mkdirSync(join(sprintDir, "personas"), { recursive: true });
    mkdirSync(join(sprintDir, "validation"), { recursive: true });
    mkdirSync(join(sprintDir, "team"), { recursive: true });

    const allFiles: string[] = [];
    const personaFiles: string[] = [];
    const validationFiles: string[] = [];
    const teamFiles: string[] = [];
    let hasSynthesis = false;
    let hasDiscussion = false;
    let hasDesign = false;
    let hasImplementation = false;
    let hasReview = false;
    let hasDashboard = false;

    if (workspaceDir && existsSync(workspaceDir)) {
      // ── Workspace-based archival ──
      // Workspace structure:
      //   personas/<persona-id>.md, personas/test-<persona-id>.mjs
      //   personas/retest-<persona-id>.md, personas/retest-<persona-id>.mjs
      //   personas/screenshots/
      //   outputs/team-<agent-id>.md, outputs/synthesis.md, outputs/design.md, etc.
      //   dashboard-ui.jsx

      // 1. Persona reports and retest reports from personas/ dir
      const wsPersonasDir = join(workspaceDir, "personas");
      if (existsSync(wsPersonasDir)) {
        try {
          for (const file of readdirSync(wsPersonasDir)) {
            const srcPath = join(wsPersonasDir, file);
            try { if (!statSync(srcPath).isFile()) continue; } catch { continue; }

            if (file.startsWith("retest-") && file.endsWith(".md")) {
              // Retest reports → validation/
              copyFileSync(srcPath, join(sprintDir, "validation", file));
              validationFiles.push(`validation/${file}`);
              allFiles.push(`validation/${file}`);
            } else if (file.endsWith(".md") && !file.startsWith("test-") && !file.startsWith("retest-")) {
              // Persona reports → personas/
              copyFileSync(srcPath, join(sprintDir, "personas", file));
              personaFiles.push(`personas/${file}`);
              allFiles.push(`personas/${file}`);
            }
            // Skip .mjs scripts — they are test artifacts, not reports
          }
        } catch (err) { logError("evolution-archive", "Failed to scan workspace personas dir", err); }
      }

      // 2. Team reports and evolution files from outputs/ dir
      const wsOutputsDir = join(workspaceDir, "outputs");
      if (existsSync(wsOutputsDir)) {
        try {
          for (const file of readdirSync(wsOutputsDir)) {
            const srcPath = join(wsOutputsDir, file);
            try { if (!statSync(srcPath).isFile()) continue; } catch { continue; }

            if (file.startsWith("team-") && file.endsWith(".md")) {
              // Team reports → team/
              copyFileSync(srcPath, join(sprintDir, "team", file));
              teamFiles.push(`team/${file}`);
              allFiles.push(`team/${file}`);
            } else if (file === "synthesis.md") {
              copyFileSync(srcPath, join(sprintDir, file));
              hasSynthesis = true;
              allFiles.push(file);
            } else if (file === "discussion.md") {
              copyFileSync(srcPath, join(sprintDir, file));
              hasDiscussion = true;
              allFiles.push(file);
            } else if (file === "design.md") {
              copyFileSync(srcPath, join(sprintDir, file));
              hasDesign = true;
              allFiles.push(file);
            } else if (file === "implementation.md" || file.startsWith("implementation-") || file.startsWith("implement-")) {
              copyFileSync(srcPath, join(sprintDir, file));
              hasImplementation = true;
              allFiles.push(file);
            } else if (file === "review.md") {
              copyFileSync(srcPath, join(sprintDir, file));
              hasReview = true;
              allFiles.push(file);
            } else if (file === "meta-review.md") {
              copyFileSync(srcPath, join(sprintDir, file));
              allFiles.push(file);
            } else if (file === "pl-triage.md") {
              copyFileSync(srcPath, join(sprintDir, file));
              allFiles.push(file);
            } else if (file.endsWith(".md")) {
              // Generic evolution files
              copyFileSync(srcPath, join(sprintDir, file));
              allFiles.push(file);
            }
          }
        } catch (err) { logError("evolution-archive", "Failed to scan workspace outputs dir", err); }
      }

      // 3. Dashboard from workspace root
      const wsDashboard = join(workspaceDir, "dashboard-ui.jsx");
      if (existsSync(wsDashboard)) {
        try {
          copyFileSync(wsDashboard, join(sprintDir, "dashboard-ui.jsx"));
          hasDashboard = true;
          allFiles.push("dashboard-ui.jsx");
        } catch (err) { logError("evolution-archive", "Failed to copy dashboard", err); }
      }

    } else {
      // ── Legacy fallback: scan project root for .evolution-* files ──
      const dirsToScan = [projectRoot];
      const subDirs = ["server", "src", "backend", "server"];
      for (const sub of subDirs) {
        const subPath = join(projectRoot, sub);
        if (existsSync(subPath)) dirsToScan.push(subPath);
      }

      const allRootFiles: { file: string; srcDir: string }[] = [];
      for (const dir of dirsToScan) {
        try {
          const files = readdirSync(dir).filter(f =>
            f.startsWith(".evolution-") ||
            f === ".orchestration-ui.jsx" ||
            f.startsWith("retest-persona-") ||
            f.startsWith(".orchestration-output-")
          );
          for (const f of files) allRootFiles.push({ file: f, srcDir: dir });
        } catch (err) { logError("evolution-archive", "Failed to scan directory " + dir, err); }
      }

      for (const { file, srcDir } of allRootFiles) {
        const srcPath = join(srcDir, file);
        if (!existsSync(srcPath)) continue;

        try {
          if (!statSync(srcPath).isFile()) continue;
        } catch (err) { logError("evolution-archive", "Failed to stat " + file, err); continue; }

        let destName: string;
        let destDir = sprintDir;

        if (file.startsWith(".evolution-persona-")) {
          destName = file.replace(".evolution-", "");
          destDir = join(sprintDir, "personas");
          personaFiles.push(`personas/${destName}`);
        } else if (file.startsWith(".evolution-retest-")) {
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
        } else if (file === ".evolution-implementation.md" || file.startsWith(".evolution-implementation-")) {
          destName = file.replace(".evolution-", "");
          hasImplementation = true;
        } else if (file === ".evolution-review.md") {
          destName = "review.md";
          hasReview = true;
        } else if (file === ".orchestration-ui.jsx") {
          destName = "dashboard-ui.jsx";
          hasDashboard = true;
        } else if (file.startsWith(".orchestration-output-")) {
          destName = file.replace(".orchestration-output-", "output-");
          personaFiles.push(destName);
        } else {
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
      try {
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
          } catch (err) { logError("evolution-archive", "Failed to copy retest file " + file, err); }
        }
      } catch { /* ignore */ }

      // Also check for team agent reports (.evolution-team-*.md)
      for (const { file, srcDir } of allRootFiles) {
        if (file.startsWith(".evolution-team-")) {
          const srcPath = join(srcDir, file);
          const destName = file.replace(".evolution-", "");
          try {
            copyFileSync(srcPath, join(sprintDir, "team", destName));
            teamFiles.push(`team/${destName}`);
            allFiles.push(`team/${destName}`);
          } catch (err) {
            logError("evolution-archive", `Failed to copy team report ${file}`, err);
          }
        }
      }
    }

    // Build meta
    const meta: EvolutionSprintMeta = {
      sprintId,
      projectId,
      goal,
      createdAt: Date.now(),
      completedAt: Date.now(),
      status: determineSprintStatus(allFiles, hasSynthesis, hasImplementation, hasReview),
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
 * Clean up evolution temp files after archiving.
 * When `workspaceDir` is provided, simply removes the entire workspace directory.
 * Otherwise falls back to pattern-matching cleanup in the project root.
 */
export function cleanEvolutionTempFiles(projectRoot: string, workspaceDir?: string): void {
  // If workspace dir is provided, just remove it entirely
  if (workspaceDir && existsSync(workspaceDir)) {
    try {
      rmSync(workspaceDir, { recursive: true, force: true });
      logAction({ ts: Date.now(), type: "action", category: "evolution-archive", message: `Cleaned workspace dir: ${workspaceDir}` });
      return;
    } catch (err) {
      logError("evolution-archive", "Failed to remove workspace dir: " + workspaceDir, err);
      // Fall through to legacy cleanup
    }
  }

  // Legacy fallback: pattern-matching cleanup in project root
  try {
    const patterns = [
      /^\.evolution-/,
      /^\.orchestration-ui\.jsx$/,
      /^\.orchestration-output-/,
      /^test-persona-.*\.mjs$/,
      /^retest-persona-.*\.mjs$/,
      /^retest-persona-.*\.md$/,
    ];
    const dirsToClean = [projectRoot];
    for (const sub of ["server", "src", "backend", "server"]) {
      const subPath = join(projectRoot, sub);
      if (existsSync(subPath)) dirsToClean.push(subPath);
    }
    for (const dir of dirsToClean) {
      try {
        const files = readdirSync(dir);
        for (const file of files) {
          if (patterns.some(p => p.test(file))) {
            try { unlinkSync(join(dir, file)); } catch (err) { logError("evolution-archive", "Failed to delete " + file, err); }
          }
        }
      } catch (err) { logError("evolution-archive", "Failed to scan dir for cleanup: " + dir, err); }
    }
    // Clean evolution-screenshots dir
    const screenshotsDir = join(projectRoot, "evolution-screenshots");
    if (existsSync(screenshotsDir)) {
      const shots = readdirSync(screenshotsDir);
      for (const f of shots) {
        try { unlinkSync(join(screenshotsDir, f)); } catch (err) { logError("evolution-archive", "Failed to delete screenshot " + f, err); }
      }
      try { rmSync(screenshotsDir, { recursive: true, force: true }); } catch (err) { logError("evolution-archive", "Failed to remove screenshots dir", err); }
    }
  } catch (err) { logError("evolution-archive", "Failed to clean evolution temp files", err); }
}

// ── Query ──

/**
 * List all archived evolution sprints for a project, newest first.
 * Also checks legacy location for backward compatibility.
 */
export function listEvolutionSprints(projectId: string = "enso"): EvolutionSprintMeta[] {
  const sprints: EvolutionSprintMeta[] = [];

  // Check project-scoped path
  const projectSprintsDir = getSprintsDir(projectId);
  if (existsSync(projectSprintsDir)) {
    try {
      for (const dir of readdirSync(projectSprintsDir)) {
        const metaPath = join(projectSprintsDir, dir, "meta.json");
        if (existsSync(metaPath)) {
          try {
            sprints.push(JSON.parse(readFileSync(metaPath, "utf-8")));
          } catch (err) { logError("evolution-archive", "Failed to parse sprint meta: " + metaPath, err); }
        }
      }
    } catch (err) { logError("evolution-archive", "Failed to read sprints dir", err); }
  }

  // Also check legacy location for the "enso" project
  if (projectId === "enso" && existsSync(LEGACY_EVOLUTION_DIR)) {
    try {
      for (const dir of readdirSync(LEGACY_EVOLUTION_DIR)) {
        const metaPath = join(LEGACY_EVOLUTION_DIR, dir, "meta.json");
        if (existsSync(metaPath)) {
          try {
            const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
            // Avoid duplicates
            if (!sprints.some(s => s.sprintId === meta.sprintId)) {
              sprints.push(meta);
            }
          } catch (err) { logError("evolution-archive", "Failed to parse sprint meta: " + metaPath, err); }
        }
      }
    } catch (err) { logError("evolution-archive", "Failed to read legacy sprints dir", err); }
  }

  sprints.sort((a, b) => b.completedAt - a.completedAt);
  return sprints;
}

/**
 * Load a single evolution sprint's metadata.
 */
export function loadEvolutionSprint(sprintId: string, projectId: string = "enso"): EvolutionSprintMeta | null {
  // Check project-scoped path first
  const projectPath = join(getSprintsDir(projectId), sprintId, "meta.json");
  if (existsSync(projectPath)) {
    try { return JSON.parse(readFileSync(projectPath, "utf-8")); } catch (err) { logError("evolution-archive", "Failed to parse sprint meta: " + projectPath, err); }
  }
  // Fallback to legacy
  const legacyPath = join(LEGACY_EVOLUTION_DIR, sprintId, "meta.json");
  if (existsSync(legacyPath)) {
    try { return JSON.parse(readFileSync(legacyPath, "utf-8")); } catch (err) { logError("evolution-archive", "Failed to parse sprint meta: " + legacyPath, err); }
  }
  return null;
}

/**
 * Read a specific file from an archived sprint.
 */
export function getEvolutionFile(sprintId: string, filename: string, projectId: string = "enso"): string | null {
  const safe = filename.replace(/\.\./g, "").replace(/\\/g, "/");
  // Check project-scoped path first
  const projectPath = join(getSprintsDir(projectId), sprintId, safe);
  if (existsSync(projectPath)) {
    try { return readFileSync(projectPath, "utf-8"); } catch (err) { logError("evolution-archive", "Failed to read evolution file: " + projectPath, err); }
  }
  // Fallback to legacy
  const legacyPath = join(LEGACY_EVOLUTION_DIR, sprintId, safe);
  if (existsSync(legacyPath)) {
    try { return readFileSync(legacyPath, "utf-8"); } catch (err) { logError("evolution-archive", "Failed to read evolution file: " + legacyPath, err); }
  }
  return null;
}
