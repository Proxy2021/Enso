/**
 * Card → Cortex Page Conversion
 *
 * Selectively converts app cards (research, data source outputs, orchestration)
 * into Cortex wiki pages. Regular chat stays in conversation journals only.
 *
 * Rules:
 * - Research cards → sources/research-{slug}.md
 * - App cards with toolFamily → entities/{slug}.md or sources/{slug}.md
 * - Orchestration results → synthesis/orchestration-{slug}.md
 * - Regular chat, user bubbles → null (not persisted to Cortex)
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { logAction } from "./action-log.js";

const CORTEX_DIR = join(homedir(), ".enso", "wiki");
const INDEX_PATH = join(CORTEX_DIR, "_index.md");

// App families whose cards should become Cortex pages
const CORTEX_WORTHY_FAMILIES = new Set([
  "researcher",
  "kindle",
  "browser_data",
  "email_scanner",
  "projects_scanner",
  "system_info",
  "cortex",
  "steam",
  "movies_tv",
  "photo_library",
  "twitter",
  "qq_music",
]);

interface CardRecord {
  id: string;
  runId?: string;
  type?: string;
  role?: string;
  text?: string;
  data?: unknown;
  toolMeta?: { toolId?: string };
  cardMode?: { interactionMode?: string; appId?: string; toolFamily?: string; signatureId?: string };
  appData?: unknown;
  timestamp?: number;
}

interface CortexPage {
  path: string;
  title: string;
  content: string;
  summary: string;
  tags: string[];
}

/**
 * Convert a card record to a Cortex page, if appropriate.
 * Returns null for cards that shouldn't become pages.
 */
export function cardToCortexPage(record: CardRecord): CortexPage | null {
  // Only assistant cards with content
  if (record.role === "user" || !record.text) return null;

  const toolFamily = record.cardMode?.toolFamily || record.toolMeta?.toolId;
  const cardType = record.type;

  // Research cards
  if (toolFamily === "researcher" || cardType === "research") {
    return researchCardToPage(record);
  }

  // Orchestration results
  if (cardType === "orchestration" && record.data) {
    return orchestrationCardToPage(record);
  }

  // App cards from data source apps
  if (toolFamily && CORTEX_WORTHY_FAMILIES.has(toolFamily)) {
    return appCardToPage(record, toolFamily);
  }

  return null;
}

function researchCardToPage(record: CardRecord): CortexPage | null {
  const text = record.text || "";
  if (text.length < 50) return null; // Skip trivial responses

  // Extract topic from first line or heading
  const firstLine = text.split("\n")[0].replace(/^#+\s*/, "").trim();
  const topic = firstLine.slice(0, 100) || "Research";
  const slug = slugify(topic);
  if (!slug) return null;

  const date = new Date(record.timestamp || Date.now()).toISOString().split("T")[0];

  return {
    path: `sources/research-${slug}.md`,
    title: topic,
    content: `# ${topic}\n\n*Research conducted on ${date}*\n\n${text}`,
    summary: text.slice(0, 200).replace(/\n/g, " "),
    tags: ["research", "source", date],
  };
}

function orchestrationCardToPage(record: CardRecord): CortexPage | null {
  const text = record.text || "";
  const data = record.data as Record<string, unknown> | undefined;
  const goal = (data?.goal as string) || text.split("\n")[0].slice(0, 100) || "Orchestration";
  const slug = slugify(goal);
  if (!slug) return null;

  const date = new Date(record.timestamp || Date.now()).toISOString().split("T")[0];

  return {
    path: `synthesis/orchestration-${slug}.md`,
    title: goal,
    content: `# ${goal}\n\n*Multi-agent orchestration from ${date}*\n\n${text}`,
    summary: text.slice(0, 200).replace(/\n/g, " "),
    tags: ["orchestration", "synthesis", date],
  };
}

function appCardToPage(record: CardRecord, toolFamily: string): CortexPage | null {
  const text = record.text || "";
  if (text.length < 30) return null;

  const firstLine = text.split("\n")[0].replace(/^#+\s*/, "").trim();
  const title = firstLine.slice(0, 100) || `${toolFamily} result`;
  const slug = slugify(title);
  if (!slug) return null;

  const date = new Date(record.timestamp || Date.now()).toISOString().split("T")[0];

  return {
    path: `sources/${toolFamily}-${slug}.md`,
    title,
    content: `# ${title}\n\n*From ${toolFamily} app on ${date}*\n\n${text}`,
    summary: text.slice(0, 200).replace(/\n/g, " "),
    tags: [toolFamily, "source", date],
  };
}

/**
 * Write a Cortex page from a card record, if the card qualifies.
 * Returns the page path if written, null if skipped.
 */
export function writeCortexPageFromCard(record: CardRecord): string | null {
  const page = cardToCortexPage(record);
  if (!page) return null;

  const fullPath = join(CORTEX_DIR, page.path);

  // Don't overwrite existing pages (avoid duplicates from card updates)
  if (existsSync(fullPath)) return page.path;

  // Write the page
  const dir = dirname(fullPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, page.content, "utf-8");

  // Update index
  const indexEntry = `\n## ${page.path}\n**${page.title}** — ${page.summary.slice(0, 200)}. Tags: ${page.tags.join(", ")}.\nUpdated: ${new Date().toISOString()}\n`;
  const currentIndex = existsSync(INDEX_PATH) ? readFileSync(INDEX_PATH, "utf-8") : "";
  if (!currentIndex.includes(`## ${page.path}`)) {
    writeFileSync(INDEX_PATH, currentIndex + indexEntry);
  }

  logAction({
    ts: Date.now(), type: "action", category: "card-to-cortex",
    message: `Card ${record.id} → Cortex page: ${page.path}`,
  });

  return page.path;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}
