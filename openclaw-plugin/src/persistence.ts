/**
 * persistence.ts — Reusable document collection persistence for Enso apps.
 *
 * Provides indexed collections of JSON documents stored as separate files,
 * with listing, metadata, and auto-pruning. Complements the simple KV store
 * in ctx.store for larger, structured data like research results, itineraries, etc.
 *
 * Storage layout:
 *   ~/.openclaw/enso-data/<family>/<collection>/
 *     index.json           — [{ id, timestamp, meta }]
 *     docs/<id>.json       — full document data
 *
 * Usage (built-in tools):
 *   import { getDocCollection } from "./persistence.js";
 *   const topics = getDocCollection<MyData>("researcher", "topics", { maxEntries: 50 });
 *   topics.save("my-id", data, { label: "hello" });
 *   const entries = topics.list();  // newest first
 *   const doc = topics.load("my-id");
 *
 * Usage (dynamic apps via ctx.store.docs):
 *   const coll = ctx.store.docs("my_collection");
 *   await coll.save("id", data, { label: "hello" });
 *   const entries = await coll.list();
 */

import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ── Types ──

export interface DocMeta {
  [key: string]: string | number | boolean;
}

export interface DocEntry<M extends DocMeta = DocMeta> {
  id: string;
  timestamp: number;
  meta: M;
}

export interface DocCollection<T = unknown, M extends DocMeta = DocMeta> {
  /** List all entries (newest first). Returns index metadata only, not full docs. */
  list(): DocEntry<M>[];
  /** Save a document. If id exists, overwrites. Auto-prunes oldest if over maxEntries. */
  save(id: string, data: T, meta: M): void;
  /** Load full document by id. Returns null if not found. */
  load(id: string): T | null;
  /** Check if a document exists by id. */
  has(id: string): boolean;
  /** Remove a document + its index entry. Returns true if it existed. */
  remove(id: string): boolean;
  /** Remove all documents in the collection. */
  clear(): void;
  /** Number of documents in the collection. */
  count(): number;
}

// ── Constants ──

const BASE_DIR = join(homedir(), ".openclaw", "enso-data");

// ── ID sanitisation ──

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,120}$/;

function sanitizeId(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  if (!slug) throw new Error(`Cannot derive a valid document id from "${raw}"`);
  return slug;
}

function validateId(id: string): string {
  if (ID_RE.test(id)) return id;
  return sanitizeId(id);
}

// ── Implementation ──

class DocCollectionImpl<T, M extends DocMeta> implements DocCollection<T, M> {
  private readonly indexPath: string;
  private readonly docsDir: string;
  private readonly maxEntries: number;
  private index: DocEntry<M>[] | null = null; // lazy-loaded

  constructor(family: string, collection: string, maxEntries: number) {
    const collDir = join(BASE_DIR, family, collection);
    this.indexPath = join(collDir, "index.json");
    this.docsDir = join(collDir, "docs");
    this.maxEntries = maxEntries;
  }

  // ── Index I/O ──

  private loadIndex(): DocEntry<M>[] {
    if (this.index !== null) return this.index;
    try {
      if (existsSync(this.indexPath)) {
        this.index = JSON.parse(readFileSync(this.indexPath, "utf-8")) as DocEntry<M>[];
        return this.index;
      }
    } catch {
      // corrupt index — start fresh
    }
    this.index = [];
    return this.index;
  }

  private saveIndex(): void {
    mkdirSync(join(this.docsDir, ".."), { recursive: true }); // ensure collection dir
    writeFileSync(this.indexPath, JSON.stringify(this.index, null, 2));
  }

  // ── Doc file helpers ──

  private docPath(id: string): string {
    return join(this.docsDir, id + ".json");
  }

  private writeDoc(id: string, data: T): void {
    mkdirSync(this.docsDir, { recursive: true });
    writeFileSync(this.docPath(id), JSON.stringify(data));
  }

  private readDoc(id: string): T | null {
    try {
      if (existsSync(this.docPath(id))) {
        return JSON.parse(readFileSync(this.docPath(id), "utf-8")) as T;
      }
    } catch {
      // corrupt doc
    }
    return null;
  }

  private deleteDoc(id: string): void {
    try {
      unlinkSync(this.docPath(id));
    } catch {
      // already gone
    }
  }

  // ── Public API ──

  list(): DocEntry<M>[] {
    return [...this.loadIndex()];
  }

  save(id: string, data: T, meta: M): void {
    const safeId = validateId(id);
    const index = this.loadIndex();

    // Write the document file
    this.writeDoc(safeId, data);

    // Update index: remove old entry for same id, prepend new one
    const filtered = index.filter((e) => e.id !== safeId);
    filtered.unshift({ id: safeId, timestamp: Date.now(), meta });
    this.index = filtered;

    // Prune oldest entries beyond maxEntries
    while (this.index.length > this.maxEntries) {
      const removed = this.index.pop()!;
      this.deleteDoc(removed.id);
    }

    this.saveIndex();
  }

  load(id: string): T | null {
    const safeId = validateId(id);
    return this.readDoc(safeId);
  }

  has(id: string): boolean {
    const safeId = validateId(id);
    return this.loadIndex().some((e) => e.id === safeId);
  }

  remove(id: string): boolean {
    const safeId = validateId(id);
    const index = this.loadIndex();
    const before = index.length;
    this.index = index.filter((e) => e.id !== safeId);
    if (this.index.length === before) return false;
    this.deleteDoc(safeId);
    this.saveIndex();
    return true;
  }

  clear(): void {
    const index = this.loadIndex();
    for (const entry of index) {
      this.deleteDoc(entry.id);
    }
    this.index = [];
    this.saveIndex();
  }

  count(): number {
    return this.loadIndex().length;
  }
}

// ── Factory ──

const collections = new Map<string, DocCollection<unknown, DocMeta>>();

/**
 * Get (or create) a document collection.
 *
 * @param family   Tool family name (e.g. "researcher", "travel_planner")
 * @param collection  Collection name within the family (e.g. "topics", "itineraries")
 * @param opts.maxEntries  Maximum documents to keep (oldest auto-pruned). Default 100.
 */
export function getDocCollection<T = unknown, M extends DocMeta = DocMeta>(
  family: string,
  collection: string,
  opts?: { maxEntries?: number },
): DocCollection<T, M> {
  const key = `${family}/${collection}`;
  if (!collections.has(key)) {
    collections.set(
      key,
      new DocCollectionImpl<T, M>(family, collection, opts?.maxEntries ?? 100) as unknown as DocCollection<unknown, DocMeta>,
    );
  }
  return collections.get(key)! as unknown as DocCollection<T, M>;
}
