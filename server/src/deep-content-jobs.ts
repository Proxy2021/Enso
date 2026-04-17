/**
 * deep-content-jobs.ts — Global registry for in-flight deep-content (podcast)
 * generation jobs. Keyed by entityId, so concurrent work on different books /
 * movies / etc. stays isolated and a single entity can't be double-processed.
 *
 * Also provides a global TTS semaphore — the Gemini TTS endpoint gets
 * hammered when multiple books render audio in parallel, so every
 * renderPodcastAudio call goes through a single shared pool.
 */
import { logAction } from "./action-log.js";
import type { DeepContentProgress, DeepContentVariant, ProcessedContent } from "./deep-content.js";
import type { EntityId } from "./entity-model.js";

export type DeepContentJobPhase = DeepContentProgress["phase"];

export interface DeepContentJob {
  entityId: EntityId;
  /** Variant distinguishes discussion-podcast jobs from interview-podcast jobs. */
  variant: DeepContentVariant;
  title: string;
  entityType?: string;
  startedAt: number;
  phase: DeepContentJobPhase;
  percent: number;
  detail: string;
  status: "running" | "complete" | "error";
  error?: string;
  /** Card that originally kicked off this job — used for pill scroll-to. */
  sourceCardId?: string;
}

/** Compound key — different variants for the same entity are separate jobs. */
function jobKey(entityId: EntityId, variant: DeepContentVariant = "discussion"): string {
  return `${entityId}::${variant}`;
}

type Listener = (progress: DeepContentProgress) => void;

interface InternalJob extends DeepContentJob {
  listeners: Set<Listener>;
  promise: Promise<ProcessedContent>;
  finishedAt?: number;
}

const jobs = new Map<string, InternalJob>();
const globalListeners = new Set<() => void>();

function emitGlobal() {
  for (const fn of globalListeners) {
    try { fn(); } catch { /* swallow */ }
  }
}

/** Public snapshot — safe to serialize and ship to clients. */
function snapshot(j: InternalJob): DeepContentJob {
  return {
    entityId: j.entityId,
    variant: j.variant,
    title: j.title,
    entityType: j.entityType,
    startedAt: j.startedAt,
    phase: j.phase,
    percent: j.percent,
    detail: j.detail,
    status: j.status,
    error: j.error,
    sourceCardId: j.sourceCardId,
  };
}

export function listJobs(): DeepContentJob[] {
  return Array.from(jobs.values()).map(snapshot);
}

export function getJob(entityId: EntityId, variant: DeepContentVariant = "discussion"): DeepContentJob | undefined {
  const j = jobs.get(jobKey(entityId, variant));
  return j ? snapshot(j) : undefined;
}

/**
 * Subscribe to progress ticks for a specific entity+variant. Returns an
 * unsubscribe function. If no job is running, returns a no-op.
 */
export function subscribe(entityId: EntityId, fn: Listener, variant: DeepContentVariant = "discussion"): () => void {
  const j = jobs.get(jobKey(entityId, variant));
  if (!j) return () => {};
  j.listeners.add(fn);
  return () => { j.listeners.delete(fn); };
}

/** Subscribe to any change in the global jobs list (start/progress/complete). */
export function onJobsChange(fn: () => void): () => void {
  globalListeners.add(fn);
  return () => { globalListeners.delete(fn); };
}

/**
 * Start a job (or return the already-running one for the same entity).
 *
 * The `run` callback receives a shared `onProgress` function and should return
 * the pipeline promise. All progress ticks are fanned out to subscribers.
 */
export function startJob(params: {
  entityId: EntityId;
  variant?: DeepContentVariant;
  title: string;
  entityType?: string;
  sourceCardId?: string;
  run: (onProgress: (p: DeepContentProgress) => void) => Promise<ProcessedContent>;
}): DeepContentJob {
  const variant: DeepContentVariant = params.variant ?? "discussion";
  const key = jobKey(params.entityId, variant);
  const existing = jobs.get(key);
  if (existing) {
    // Dedup: same entity+variant already processing → return existing snapshot
    return snapshot(existing);
  }

  const fanout = (p: DeepContentProgress) => {
    const cur = jobs.get(key);
    if (!cur) return;
    cur.phase = p.phase;
    cur.percent = typeof p.percentComplete === "number" ? p.percentComplete : cur.percent;
    cur.detail = p.detail ?? cur.detail;
    for (const l of cur.listeners) {
      try { l(p); } catch { /* swallow */ }
    }
    emitGlobal();
  };

  let promiseResolve!: (p: Promise<ProcessedContent>) => void;
  const wrappedPromise = new Promise<ProcessedContent>((resolve, reject) => {
    promiseResolve = (inner) => {
      inner.then(resolve).catch(reject);
    };
  });

  const job: InternalJob = {
    entityId: params.entityId,
    variant,
    title: params.title,
    entityType: params.entityType,
    sourceCardId: params.sourceCardId,
    startedAt: Date.now(),
    phase: "researching",
    percent: 0,
    detail: "Starting...",
    status: "running",
    listeners: new Set(),
    promise: wrappedPromise,
  };
  jobs.set(key, job);
  logAction({ ts: Date.now(), type: "action", category: "deep-jobs", message: `Start job ${key}` });
  emitGlobal();

  // Kick off the pipeline — fan outcomes back through the registry.
  const inner = params.run(fanout);
  promiseResolve(inner);

  inner
    .then(() => {
      const cur = jobs.get(key);
      if (cur) {
        cur.status = "complete";
        cur.phase = "complete";
        cur.percent = 100;
        cur.detail = "Ready";
        cur.finishedAt = Date.now();
      }
      emitGlobal();
      // Linger briefly so the UI can show a "done" pill, then evict.
      setTimeout(() => { jobs.delete(key); emitGlobal(); }, 30_000);
    })
    .catch((err) => {
      const cur = jobs.get(key);
      const msg = err instanceof Error ? err.message : String(err);
      if (cur) {
        cur.status = "error";
        cur.phase = "error";
        cur.detail = msg;
        cur.error = msg;
        cur.finishedAt = Date.now();
      }
      emitGlobal();
      setTimeout(() => { jobs.delete(key); emitGlobal(); }, 30_000);
    });

  return snapshot(job);
}

/** Awaits the underlying pipeline promise for a running job. */
export function awaitJob(entityId: EntityId, variant: DeepContentVariant = "discussion"): Promise<ProcessedContent> | undefined {
  return jobs.get(jobKey(entityId, variant))?.promise;
}

// ─── Global TTS semaphore ────────────────────────────────────────────────────
//
// Shared across every deep-content pipeline. Caps concurrent Gemini TTS
// segment renders across ALL running jobs so two books don't multiply the
// rate-limit exposure.

const TTS_MAX_CONCURRENT = 5;
let ttsInFlight = 0;
const ttsWaiters: Array<() => void> = [];

export async function withTtsSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (ttsInFlight >= TTS_MAX_CONCURRENT) {
    await new Promise<void>((resolve) => { ttsWaiters.push(resolve); });
  }
  ttsInFlight++;
  try {
    return await fn();
  } finally {
    ttsInFlight--;
    const next = ttsWaiters.shift();
    if (next) next();
  }
}
