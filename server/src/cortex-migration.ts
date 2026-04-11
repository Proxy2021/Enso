/**
 * Cortex V2 Migration
 *
 * Simplifies the wiki directory structure from 5 directories to 2:
 *   - entities/   (external world: books, games, movies, people, places)
 *   - synthesis/  (system-created: ideas, apps, projects, articles, reports, profile)
 *
 * Removed directories: concepts/, sources/, ideas/
 * Type renames: "concept" → "idea", "source" → "synthesis"
 * Moved prefixes: entities/project-* → synthesis/project-*, entities/article-* → synthesis/article-*
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  statSync,
} from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import { logAction } from "./action-log.js";

const CORTEX_DIR = join(homedir(), ".enso", "wiki");
const DATA_DIR = join(homedir(), ".enso", "data");
const VERSION_FILE = join(DATA_DIR, "cortex-version.json");
const TARGET_VERSION = 2;

function log(msg: string): void {
  console.log(`[enso:migration] ${msg}`);
}

/**
 * Resolve a destination path, appending a counter before .md if the file already exists.
 */
function resolveCollision(destPath: string): string {
  if (!existsSync(destPath)) return destPath;
  const dir = join(destPath, "..");
  const name = basename(destPath, ".md");
  let counter = 1;
  let candidate: string;
  do {
    candidate = join(dir, `${name}-${counter}.md`);
    counter++;
  } while (existsSync(candidate));
  return candidate;
}

/**
 * Move all .md files from srcDir into destDir, handling collisions.
 * Returns the number of files moved.
 */
function moveMarkdownFiles(srcDir: string, destDir: string): number {
  if (!existsSync(srcDir)) return 0;
  mkdirSync(destDir, { recursive: true });

  const files = readdirSync(srcDir).filter((f) => f.endsWith(".md"));
  let moved = 0;
  for (const file of files) {
    const src = join(srcDir, file);
    // Only move files, not directories
    if (!statSync(src).isFile()) continue;
    const dest = resolveCollision(join(destDir, file));
    renameSync(src, dest);
    moved++;
  }
  return moved;
}

/**
 * Move matching files from entities/ to synthesis/ by prefix pattern.
 * Returns the number of files moved.
 */
function moveMatchingEntities(prefix: string): number {
  const entitiesDir = join(CORTEX_DIR, "entities");
  const synthesisDir = join(CORTEX_DIR, "synthesis");
  if (!existsSync(entitiesDir)) return 0;
  mkdirSync(synthesisDir, { recursive: true });

  const files = readdirSync(entitiesDir).filter(
    (f) => f.startsWith(prefix) && f.endsWith(".md")
  );
  let moved = 0;
  for (const file of files) {
    const src = join(entitiesDir, file);
    if (!statSync(src).isFile()) continue;
    const dest = resolveCollision(join(synthesisDir, file));
    renameSync(src, dest);
    moved++;
  }
  return moved;
}

/**
 * Rewrite a path string according to V2 rules.
 */
function rewritePath(p: string): string {
  // Order matters: more specific patterns first
  if (p.startsWith("entities/project-")) return p.replace("entities/", "synthesis/");
  if (p.startsWith("entities/article-")) return p.replace("entities/", "synthesis/");
  if (p.startsWith("concepts/")) return p.replace("concepts/", "synthesis/");
  if (p.startsWith("sources/")) return p.replace("sources/", "synthesis/");
  if (p.startsWith("ideas/")) return p.replace("ideas/", "synthesis/");
  return p;
}

/**
 * Rewrite an entityId string according to V2 rules.
 */
function rewriteEntityId(id: string): string {
  return id.replace(/:concept:/g, ":idea:").replace(/:source:/g, ":synthesis:");
}

/**
 * Remove a directory only if it exists and is empty.
 */
function removeIfEmpty(dir: string): boolean {
  if (!existsSync(dir)) return false;
  try {
    const entries = readdirSync(dir);
    if (entries.length === 0) {
      rmdirSync(dir);
      return true;
    }
  } catch {
    // Ignore errors (permission, etc.)
  }
  return false;
}

/**
 * Rewrite wiki-link references in markdown content.
 * Returns the rewritten content, or null if no changes were made.
 */
function rewriteWikiLinks(content: string): string | null {
  let changed = false;
  let result = content;

  const replacements: [string, string][] = [
    ["[[concepts/", "[[synthesis/"],
    ["[[sources/", "[[synthesis/"],
    ["[[ideas/", "[[synthesis/"],
  ];

  for (const [from, to] of replacements) {
    if (result.includes(from)) {
      result = result.split(from).join(to);
      changed = true;
    }
  }

  return changed ? result : null;
}

/**
 * Rewrite wiki links in all .md files within a directory.
 * Returns the number of files modified.
 */
function rewriteWikiLinksInDir(dir: string): number {
  if (!existsSync(dir)) return 0;

  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  let modified = 0;

  for (const file of files) {
    const filePath = join(dir, file);
    if (!statSync(filePath).isFile()) continue;

    const content = readFileSync(filePath, "utf-8");
    const rewritten = rewriteWikiLinks(content);
    if (rewritten !== null) {
      writeFileSync(filePath, rewritten, "utf-8");
      modified++;
    }
  }

  return modified;
}

// ── Main migration ──

export function migrateCortexV2(): void {
  // Step 1: Version gate
  if (existsSync(VERSION_FILE)) {
    try {
      const version = JSON.parse(readFileSync(VERSION_FILE, "utf-8"));
      if (version.cortexSchemaVersion >= TARGET_VERSION) {
        log("Already at Cortex V2 — skipping migration.");
        return;
      }
    } catch {
      // Corrupt version file — proceed with migration
    }
  }

  log("Starting Cortex V2 migration...");
  const stats = {
    filesMoved: 0,
    indexRewritten: false,
    entityIndexRewritten: false,
    focusAreasRewritten: false,
    wikiLinksRewritten: 0,
    dirsRemoved: [] as string[],
  };

  // Step 2: Backup
  const indexMd = join(CORTEX_DIR, "_index.md");
  if (existsSync(indexMd)) {
    copyFileSync(indexMd, join(CORTEX_DIR, "_index.md.v1.bak"));
    log("Backed up _index.md → _index.md.v1.bak");
  }

  const entityIndex = join(DATA_DIR, "entity-index.json");
  if (existsSync(entityIndex)) {
    copyFileSync(entityIndex, join(DATA_DIR, "entity-index.v1.bak"));
    log("Backed up entity-index.json → entity-index.v1.bak");
  }

  // Step 3: Move wiki pages
  const synthesisDir = join(CORTEX_DIR, "synthesis");
  mkdirSync(synthesisDir, { recursive: true });

  let moved = 0;
  moved += moveMarkdownFiles(join(CORTEX_DIR, "concepts"), synthesisDir);
  moved += moveMarkdownFiles(join(CORTEX_DIR, "sources"), synthesisDir);
  moved += moveMarkdownFiles(join(CORTEX_DIR, "ideas"), synthesisDir);
  moved += moveMatchingEntities("project-");
  moved += moveMatchingEntities("article-");
  stats.filesMoved = moved;
  log(`Moved ${moved} wiki pages to synthesis/`);

  // Step 4: Rewrite _index.md
  if (existsSync(indexMd)) {
    try {
      const content = readFileSync(indexMd, "utf-8");
      const lines = content.split("\n");
      let changed = false;

      const rewritten = lines.map((line) => {
        // Match ## headers that are wiki paths
        if (line.startsWith("## ")) {
          const path = line.slice(3).trim();
          const newPath = rewritePath(path);
          if (newPath !== path) {
            changed = true;
            return `## ${newPath}`;
          }
        }
        // Also rewrite path references within content lines
        const newLine = line
          .replace(/\bconcepts\//g, "synthesis/")
          .replace(/\bsources\//g, "synthesis/")
          .replace(/\bideas\//g, "synthesis/");

        // Rewrite entities/project- and entities/article- references
        const newLine2 = newLine
          .replace(/\bentities\/(project-)/g, "synthesis/$1")
          .replace(/\bentities\/(article-)/g, "synthesis/$1");

        if (newLine2 !== line) changed = true;
        return newLine2;
      });

      if (changed) {
        writeFileSync(indexMd, rewritten.join("\n"), "utf-8");
        stats.indexRewritten = true;
        log("Rewrote _index.md paths");
      }
    } catch (err) {
      log(`Warning: Failed to rewrite _index.md: ${err}`);
    }
  }

  // Step 5: Rewrite entity-index.json
  if (existsSync(entityIndex)) {
    try {
      const data = JSON.parse(readFileSync(entityIndex, "utf-8")) as Record<string, any>;
      const newData: Record<string, any> = {};
      let changed = false;

      for (const [key, entry] of Object.entries(data)) {
        let newEntry = { ...entry };

        // Rewrite type
        if (newEntry.type === "concept") {
          newEntry.type = "idea";
          changed = true;
        } else if (newEntry.type === "source") {
          newEntry.type = "synthesis";
          changed = true;
        }

        // Rewrite cortexPath
        if (newEntry.cortexPath) {
          const newPath = rewritePath(newEntry.cortexPath);
          if (newPath !== newEntry.cortexPath) {
            newEntry.cortexPath = newPath;
            changed = true;
          }
        }

        // Rewrite crossReferences entityIds
        if (Array.isArray(newEntry.crossReferences)) {
          newEntry.crossReferences = newEntry.crossReferences.map((ref: any) => {
            if (ref && typeof ref === "object" && typeof ref.entityId === "string") {
              const newId = rewriteEntityId(ref.entityId);
              if (newId !== ref.entityId) {
                changed = true;
                return { ...ref, entityId: newId };
              }
            }
            return ref;
          });
        }

        // Re-key if the entityId key itself needs rewriting
        const newKey = rewriteEntityId(key);
        if (newKey !== key) changed = true;

        newData[newKey] = newEntry;
      }

      if (changed) {
        writeFileSync(entityIndex, JSON.stringify(newData, null, 2), "utf-8");
        stats.entityIndexRewritten = true;
        log("Rewrote entity-index.json");
      }
    } catch (err) {
      log(`Warning: Failed to rewrite entity-index.json: ${err}`);
    }
  } else {
    log("entity-index.json not found — skipping");
  }

  // Step 6: Rewrite focus-areas.json
  const focusAreas = join(DATA_DIR, "focus-areas.json");
  if (existsSync(focusAreas)) {
    try {
      const data = JSON.parse(readFileSync(focusAreas, "utf-8"));
      let changed = false;

      if (Array.isArray(data)) {
        for (const area of data) {
          if (Array.isArray(area.relatedEntityIds)) {
            area.relatedEntityIds = area.relatedEntityIds.map((id: string) => {
              const newId = rewriteEntityId(id);
              if (newId !== id) changed = true;
              return newId;
            });
          }
        }
      }

      if (changed) {
        writeFileSync(focusAreas, JSON.stringify(data, null, 2), "utf-8");
        stats.focusAreasRewritten = true;
        log("Rewrote focus-areas.json");
      }
    } catch (err) {
      log(`Warning: Failed to rewrite focus-areas.json: ${err}`);
    }
  } else {
    log("focus-areas.json not found — skipping");
  }

  // Step 7: Rewrite wiki links in all .md files
  let linksRewritten = 0;
  linksRewritten += rewriteWikiLinksInDir(join(CORTEX_DIR, "entities"));
  linksRewritten += rewriteWikiLinksInDir(join(CORTEX_DIR, "synthesis"));
  linksRewritten += rewriteWikiLinksInDir(join(CORTEX_DIR, "focuses"));
  stats.wikiLinksRewritten = linksRewritten;
  if (linksRewritten > 0) {
    log(`Rewrote wiki links in ${linksRewritten} files`);
  }

  // Step 8: Cleanup empty directories
  for (const dir of ["concepts", "sources", "ideas"]) {
    const fullPath = join(CORTEX_DIR, dir);
    if (removeIfEmpty(fullPath)) {
      stats.dirsRemoved.push(dir);
      log(`Removed empty directory: ${dir}/`);
    }
  }

  // Step 9: Write version gate
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(
    VERSION_FILE,
    JSON.stringify(
      { cortexSchemaVersion: TARGET_VERSION, migratedAt: new Date().toISOString() },
      null,
      2
    ),
    "utf-8"
  );
  log("Wrote cortex-version.json (schema version 2)");

  // Step 10: Log to action log
  logAction({
    ts: Date.now(),
    type: "system",
    category: "migration",
    message: `Cortex V2 migration complete: ${stats.filesMoved} files moved, ${stats.wikiLinksRewritten} wiki links rewritten`,
    metadata: stats,
  });

  log("Cortex V2 migration complete.");
}
