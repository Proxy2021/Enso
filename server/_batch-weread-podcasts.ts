#!/usr/bin/env npx tsx
/**
 * Batch generate deep podcasts for all unprocessed WeRead books.
 * Run: npx tsx server/_batch-weread-podcasts.ts
 */

import { loadApiKeys } from "./src/api-keys.js";
loadApiKeys();

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { processEntityBatch, isContentProcessed } from "./src/deep-content.js";

const ENTITY_INDEX = join(homedir(), ".enso", "data", "entity-index.json");

interface EntityEntry {
  entityId: string;
  title: string;
  type: string;
  source: string;
}

async function main() {
  // Load entity index
  if (!existsSync(ENTITY_INDEX)) {
    console.error("Entity index not found:", ENTITY_INDEX);
    process.exit(1);
  }

  const index: Record<string, EntityEntry> = JSON.parse(readFileSync(ENTITY_INDEX, "utf-8"));
  const wereadBooks = Object.values(index).filter(
    (e) => e.source === "weread" && e.type === "book"
  );

  console.log(`Total WeRead books: ${wereadBooks.length}`);

  // Filter out already processed
  const unprocessed = wereadBooks.filter((b) => !isContentProcessed(b.entityId));
  console.log(`Already processed: ${wereadBooks.length - unprocessed.length}`);
  console.log(`Remaining to process: ${unprocessed.length}`);

  // Skip known duplicates (subset of a larger collection already in the list)
  const skipSlugs = new Set([
    "weread:book:张居正-第四卷-火凤凰",        // subset of 张居正（全集）
    "weread:book:雪中悍刀行",                  // subset of 雪中悍刀行（全20册）
    "weread:book:万历十五年-精装版",            // duplicate of already-done 经典版
  ]);

  const toProcess = unprocessed.filter((b) => !skipSlugs.has(b.entityId));
  const skipped = unprocessed.length - toProcess.length;
  if (skipped > 0) console.log(`Skipping ${skipped} duplicates`);

  console.log(`\nWill process ${toProcess.length} books:\n`);
  toProcess.forEach((b, i) => console.log(`  ${i + 1}. ${b.title}`));
  console.log();

  const startTime = Date.now();

  const result = await processEntityBatch({
    entityIds: toProcess.map((b) => b.entityId),
    onBookProgress: (bookIdx, totalBooks, bookTitle, progress) => {
      const elapsed = ((Date.now() - startTime) / 60000).toFixed(1);
      console.log(
        `[${elapsed}m] Book ${bookIdx + 1}/${totalBooks}: "${bookTitle}" — ${progress.phase} ${progress.percentComplete ?? ""}% ${progress.detail || ""}`
      );
    },
  });

  const totalMinutes = ((Date.now() - startTime) / 60000).toFixed(1);
  console.log(`\n=== BATCH COMPLETE ===`);
  console.log(`Processed: ${result.processed}`);
  console.log(`Failed: ${result.failed}`);
  console.log(`Total time: ${totalMinutes} minutes`);

  if (result.failed > 0) {
    console.log(`\nFailed books:`);
    result.results
      .filter((r) => !r.success)
      .forEach((r) => console.log(`  - ${r.entityId}: ${r.error}`));
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
