/**
 * Live end-to-end test of the Author Interview pipeline.
 *
 *   npx tsx scripts/test-author-interview.ts [entityId]
 *
 * Defaults to "kindle:book:thinking-fast-and-slow" (Daniel Kahneman — plenty
 * of public interviews/talks for the author-voice research phase).
 *
 * Exercises the full pipeline:
 *   1. Web research on the book (shared with discussion variant)
 *   2. Author voice research (new)
 *   3. Interview question design (new)
 *   4. Dialogue script (new)
 *   5. Audio rendering via shared global TTS semaphore
 *   6. Cache persistence under the -interview slug
 */
import { generateDeepContent, getProcessedContent } from "../server/src/deep-content.js";

const entityId = process.argv[2] ?? "kindle:book:thinking-fast-and-slow";

console.log(`[test] Starting interview for ${entityId}`);
const start = Date.now();
let lastPct = -1;

generateDeepContent({
  entityId,
  variant: "interview",
  onProgress: (p) => {
    const pct = p.percentComplete ?? 0;
    if (pct !== lastPct || p.detail) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`[${elapsed}s] ${p.phase} ${pct}% — ${p.detail ?? ""}`);
      lastPct = pct;
    }
  },
})
  .then((result) => {
    const mins = ((Date.now() - start) / 60000).toFixed(1);
    console.log(`\n[test] Complete in ${mins} min`);
    console.log(`[test] Variant: ${result.variant}`);
    console.log(`[test] Audio: ${result.audioUrl}`);
    console.log(`[test] Duration: ${result.durationMinutes} min`);
    console.log(`[test] Script: ${result.script.length} chars`);
    console.log(`[test] Questions: ${result.interviewQuestions?.length ?? 0}`);
    if (result.interviewQuestions?.length) {
      console.log(`\n[test] Question list:`);
      for (const q of result.interviewQuestions) {
        console.log(`  [${q.probes}] ${q.question}`);
      }
    }
    console.log(`\n[test] Script preview:\n${result.script.slice(0, 1200)}...`);

    // Confirm cache
    const cached = getProcessedContent(entityId, "interview");
    console.log(`\n[test] Cache hit: ${cached ? "OK" : "MISSING"}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`[test] FAILED:`, err);
    process.exit(1);
  });
