/**
 * argument-graph.ts — Extracts a directed graph of claims + dependencies from
 * a book's research data, so a reader can see load-bearing claims, tensions,
 * and where the argument rests.
 *
 *   - Reuses research cached from the podcast pipelines when available.
 *   - Single LLM call produces structured JSON (nodes + edges).
 *   - Validator prunes dangling references and de-dupes parallel edges.
 *   - Cached at ~/.enso/data/deep-content/<slug>-argument.json.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { logAction, logError } from "./action-log.js";
import { llm } from "./llm.js";
import { resolveEntity, type EntityId } from "./entity-model.js";
import { getProcessedContent, type EntityResearchResult, type DeepContentProgress } from "./deep-content.js";
import type { ArgumentGraph, ArgumentGraphNode, ArgumentGraphEdge } from "@shared/types";

const CONTENT_DIR = join(homedir(), ".enso", "data", "deep-content");

function ensureDir(): void {
  if (!existsSync(CONTENT_DIR)) mkdirSync(CONTENT_DIR, { recursive: true });
}

function slugForEntity(entityId: string): string {
  return entityId.replace(/[^\p{L}\p{N}-]/gu, "_").slice(0, 120);
}

function cachePath(entityId: string): string {
  return join(CONTENT_DIR, `${slugForEntity(entityId)}-argument.json`);
}

export function getArgumentGraph(entityId: string): ArgumentGraph | null {
  ensureDir();
  const p = cachePath(entityId);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf-8")) as ArgumentGraph; } catch { return null; }
}

export function saveArgumentGraph(graph: ArgumentGraph): void {
  ensureDir();
  writeFileSync(cachePath(graph.entityId), JSON.stringify(graph, null, 2));
}

export function deleteArgumentGraph(entityId: string): boolean {
  ensureDir();
  const p = cachePath(entityId);
  try { if (existsSync(p)) { unlinkSync(p); return true; } } catch { /* ignore */ }
  return false;
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validateAndPrune(graph: ArgumentGraph): ArgumentGraph {
  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  // Drop edges that reference missing nodes.
  const validEdges = graph.edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to) && e.from !== e.to);

  // De-dupe parallel edges with same relation.
  const seen = new Set<string>();
  const dedupEdges: ArgumentGraphEdge[] = [];
  for (const e of validEdges) {
    const key = `${e.from}->${e.to}:${e.relation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedupEdges.push(e);
  }

  // Ensure cruxNodeId is valid — fall back to the thesis node if missing.
  const thesisNode = graph.nodes.find((n) => n.type === "thesis");
  let cruxNodeId = graph.cruxNodeId;
  if (!nodeIds.has(cruxNodeId)) {
    cruxNodeId = thesisNode?.id ?? graph.nodes[0]?.id ?? cruxNodeId;
  }

  return { ...graph, edges: dedupEdges, cruxNodeId };
}

// ─── Generation ──────────────────────────────────────────────────────────────

function buildPrompt(params: {
  title: string;
  author: string;
  research: EntityResearchResult;
}): string {
  const { title, author, research } = params;
  const chapterLines = research.chapterSummaries.slice(0, 15).map((c) => `- ${c.chapter}: ${c.summary}`).join("\n");
  const insightLines = research.keyInsights.slice(0, 15).map((i) => `- ${i.insight}${i.example ? ` [ex: ${i.example}]` : ""}`).join("\n");
  const critLines = research.criticalPerspectives.slice(0, 10).map((c) => `- ${c}`).join("\n");

  return `You are mapping the ARGUMENT STRUCTURE of "${title}" by ${author} as a directed graph. This is not a mind map and not a chapter outline — you are exposing how the book's claims depend on each other, which assumptions they rest on, and where the argument could break.

RESEARCH INPUT

Core thesis: ${research.coreThesis}

Key themes: ${research.keyThemes.join("; ")}

Chapter summaries:
${chapterLines}

Key insights:
${insightLines}

Critical perspectives (existing critiques — use as counter nodes):
${critLines}

OUTPUT — STRICT JSON (no prose, no markdown fences)

{
  "thesis": "One-sentence restatement of the book's central claim",
  "cruxNodeId": "id of the single most load-bearing claim — if this falls, the whole argument collapses",
  "nodes": [
    {
      "id": "n1",
      "type": "thesis" | "claim" | "assumption" | "evidence" | "counter" | "conclusion",
      "label": "short (≤80 char) display text — must be a full claim, not a topic",
      "description": "2-3 sentences expanding the label",
      "chapter": "optional source chapter or section"
    }
  ],
  "edges": [
    {
      "from": "id of source node",
      "to": "id of target node",
      "relation": "supports" | "requires" | "exemplifies" | "contradicts" | "weakens" | "concludes",
      "note": "optional — why this relation holds"
    }
  ]
}

NODE TYPES

- thesis: The book's single central claim. Exactly ONE thesis node.
- claim: A major sub-argument that the book defends.
- assumption: A premise the argument relies on (often unstated — surface them).
- evidence: A specific study, anecdote, or data point the book uses.
- counter: A published critique or alternative view that challenges a claim.
- conclusion: A practical takeaway the book draws from its claims.

RELATION TYPES

- supports: A → B means A is evidence or a sub-argument FOR B.
- requires: A → B means B cannot hold without A being true (dependency).
- exemplifies: A → B means A is a concrete instance of general claim B.
- contradicts: A → B means A directly opposes B (usually from counter nodes).
- weakens: A → B means A doesn't destroy B but makes it less confident.
- concludes: A → B means practical takeaway B follows from claim A.

CONSTRAINTS

- 12-20 nodes total. Aim for claims at the center, evidence at the periphery, and 2-4 counter nodes to expose dissent.
- 15-35 edges. Not every node needs many edges, but every node (except thesis) must be connected via at least one edge.
- Exactly ONE thesis node. Every claim must eventually connect UP to the thesis via supports/requires/concludes.
- Surface 2-3 ASSUMPTIONS — the premises most readers wouldn't notice. These are high-value; don't skip them.
- Include 2-4 COUNTER nodes grounded in the critical perspectives above.
- The cruxNodeId should be the claim that, if falsified, would invalidate the most other nodes.
- Every node's label is a FULL CLAIM, not a topic. "System 1 is automatic" ✓ — "System 1" ✗

Output ONLY the JSON, no commentary.`;
}

export async function generateArgumentGraph(params: {
  entityId: EntityId;
  onProgress?: (progress: DeepContentProgress) => void;
}): Promise<ArgumentGraph> {
  const { entityId, onProgress } = params;

  // Try cache first.
  const cached = getArgumentGraph(entityId);
  if (cached) {
    onProgress?.({ phase: "complete", percentComplete: 100 });
    return cached;
  }

  // Resolve entity.
  const entity = await resolveEntity(entityId);
  if (!entity) throw new Error(`Entity not found: ${entityId}`);

  const title = entity.title;
  const author = (entity.metadata.author || "Unknown") as string;

  // Reuse research cached by either podcast variant if available.
  onProgress?.({ phase: "researching", detail: "Loading research...", percentComplete: 10 });
  let research: EntityResearchResult | undefined;
  const discussion = getProcessedContent(entityId, "discussion");
  if (discussion?.research) research = discussion.research;
  if (!research) {
    const interview = getProcessedContent(entityId, "interview");
    if (interview?.research) research = interview.research;
  }

  // If no research yet, run fresh research.
  if (!research) {
    onProgress?.({ phase: "researching", detail: "Fresh research (no cached variant)...", percentComplete: 15 });
    const { researchEntity } = await import("./deep-content.js");
    research = await researchEntity({
      entityId,
      title,
      author,
      description: (entity.metadata.description || "") as string,
      entityType: entity.type,
      onProgress: (p) => {
        const pct = 15 + Math.round((p.percentComplete ?? 0) * 0.4);
        onProgress?.({ phase: p.phase, detail: p.detail, percentComplete: pct });
      },
    });
  }

  onProgress?.({ phase: "writing_section", detail: "Extracting argument structure...", percentComplete: 60 });
  const prompt = buildPrompt({ title, author, research });
  const raw = await llm({ prompt, tier: "pro", timeoutMs: 90_000, maxOutputTokens: 8192 });
  if (!raw) throw new Error("LLM returned empty response for argument graph");

  // Parse — tolerate code fences and stray prose before the opening brace.
  const jsonStr = raw.replace(/```json\n?|\n?```/g, "").trim();
  const firstBrace = jsonStr.indexOf("{");
  const lastBrace = jsonStr.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace < 0) throw new Error(`Invalid JSON response: ${jsonStr.slice(0, 200)}`);
  const sliced = jsonStr.slice(firstBrace, lastBrace + 1);

  let parsed: { thesis: string; cruxNodeId: string; nodes: ArgumentGraphNode[]; edges: ArgumentGraphEdge[] };
  try {
    parsed = JSON.parse(sliced);
  } catch (err) {
    logError("argument-graph", `Failed to parse JSON for ${entityId}`, err, { snippet: sliced.slice(0, 500) });
    throw new Error(`Argument graph JSON parse failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const graph: ArgumentGraph = validateAndPrune({
    entityId,
    title,
    author,
    generatedAt: new Date().toISOString(),
    thesis: parsed.thesis,
    cruxNodeId: parsed.cruxNodeId,
    nodes: parsed.nodes ?? [],
    edges: parsed.edges ?? [],
  });

  onProgress?.({ phase: "stitching", detail: `Graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges`, percentComplete: 90 });

  saveArgumentGraph(graph);
  logAction({ ts: Date.now(), type: "action", category: "argument-graph", message: `Generated graph for ${entityId}: ${graph.nodes.length} nodes, ${graph.edges.length} edges` });

  onProgress?.({ phase: "complete", percentComplete: 100 });
  return graph;
}
