/**
 * content-enrichment.ts — Universal content entity enrichment.
 *
 * Dispatches enrichment to the right API based on entity type:
 *   book     → Google Books API (free, no key)
 *   movie    → TMDB API (key from api-keys.json)
 *   tv-series → TMDB API
 *   documentary → TMDB API
 *   game     → Steam Store API (free, no key)
 *   channel  → YouTube Data API (key from api-keys.json)
 *
 * Called fire-and-forget after ingestDiscoveredEntity() from:
 *   - add_to_cortex card action
 *   - /api/cortex/quick-add endpoint
 *   - daily discovery pipeline
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { logAction, logError } from "./action-log.js";
import {
  parseEntityId, entityCortexPath, slugify,
  upsertEntityIndex, saveEntityIndex,
  type EntityType, type EntitySource, type EntityIndexEntry,
} from "./entity-model.js";
import type { DirectIngestPage } from "./data-source-registry.js";

const CORTEX_DIR = join(homedir(), ".enso", "wiki");

// ─── API Key Resolution ──────────────────────────────────────────────────────

function getApiKey(name: string): string | undefined {
  // Try env first, then api-keys.json
  const envKey = process.env[`${name.toUpperCase()}_API_KEY`] || process.env[name.toUpperCase()];
  if (envKey) return envKey;
  try {
    const keysPath = join(homedir(), ".enso", "api-keys.json");
    if (existsSync(keysPath)) {
      const keys = JSON.parse(readFileSync(keysPath, "utf-8"));
      return keys[name] || keys[`${name}ApiKey`] || keys[`${name}_api_key`];
    }
  } catch { /* ignore */ }
  return undefined;
}

// ─── Cortex Page Helpers ─────────────────────────────────────────────────────

function readCortexPage(entityId: string): { title: string; creator: string; cortexPath: string; fullPath: string } | null {
  const parsed = parseEntityId(entityId);
  if (!parsed) return null;
  const cortexPath = entityCortexPath(entityId);
  if (!cortexPath) return null;
  const fullPath = join(CORTEX_DIR, cortexPath);
  if (!existsSync(fullPath)) return null;

  const content = readFileSync(fullPath, "utf-8");
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : parsed.slug;
  const creatorMatch = content.match(/\*\*(?:By\s+)?(.+?)\*\*/);
  const creator = creatorMatch ? creatorMatch[1].replace(/^By\s+/, "").trim() : "";

  return { title, creator, cortexPath, fullPath };
}

function updateIndexEntry(path: string, page: DirectIngestPage): void {
  const INDEX_PATH = join(CORTEX_DIR, "_index.md");
  if (!existsSync(INDEX_PATH)) return;
  const raw = readFileSync(INDEX_PATH, "utf-8");
  const entityIdLine = page.entityId ? `\nEntityId: ${page.entityId}` : "";
  const replacement = `\n## ${page.path}\n**${page.title}** — ${page.summary.slice(0, 200)}. Tags: ${page.tags.join(", ")}.\nUpdated: ${new Date().toISOString()}${entityIdLine}\n`;
  const pattern = new RegExp(`\n## ${page.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n[\\s\\S]*?(?=\\n## |$)`, "m");
  if (pattern.test(raw)) {
    writeFileSync(INDEX_PATH, raw.replace(pattern, replacement));
  } else {
    writeFileSync(INDEX_PATH, raw + replacement);
  }
}

// ─── Type-Specific Enrichers ─────────────────────────────────────────────────

async function enrichBook(entityId: string, info: { title: string; creator: string; cortexPath: string; fullPath: string }): Promise<boolean> {
  const query = info.creator
    ? `intitle:${encodeURIComponent(info.title)}+inauthor:${encodeURIComponent(info.creator)}`
    : encodeURIComponent(info.title + " book");

  const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=3`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return false;
  const data = await res.json() as { items?: Array<{ volumeInfo?: Record<string, unknown> }> };
  if (!data.items?.length) return false;

  const vol = data.items[0].volumeInfo as Record<string, unknown> | undefined;
  if (!vol) return false;

  const author = info.creator || ((vol.authors as string[])?.join(", ") ?? "Unknown");
  const isbn = (vol.industryIdentifiers as Array<{ type: string; identifier: string }>)?.find(id => id.type === "ISBN_13")?.identifier
    || (vol.industryIdentifiers as Array<{ type: string; identifier: string }>)?.find(id => id.type === "ISBN_10")?.identifier || "";
  const coverUrl = ((vol.imageLinks as Record<string, string>)?.thumbnail || "").replace("http://", "https://");
  const desc = String(vol.description || "").replace(/<[^>]+>/g, "").slice(0, 1000);
  const categories = (vol.categories as string[]) || [];

  const lines = buildCortexPage(info.title, {
    creator: author, type: "book",
    publisher: vol.publisher as string, publishedDate: vol.publishedDate as string,
    pageCount: vol.pageCount as number, language: vol.language as string,
    rating: vol.averageRating as number, ratingsCount: vol.ratingsCount as number,
    isbn, coverUrl, description: desc, categories,
  });

  writeFileSync(info.fullPath, lines, "utf-8");
  updateEntityIndex(entityId, info, coverUrl, categories, desc);
  logAction({ ts: Date.now(), type: "action", category: "content-enrich", message: `Enriched book "${info.title}": ${vol.pageCount || "?"} pages, ${categories.join(", ")}` });
  return true;
}

async function enrichMovie(entityId: string, info: { title: string; creator: string; cortexPath: string; fullPath: string }, type: string): Promise<boolean> {
  const tmdbKey = getApiKey("tmdb");
  if (!tmdbKey) { logAction({ ts: Date.now(), type: "action", category: "content-enrich", message: "No TMDB API key — cannot enrich movie" }); return false; }

  const searchType = type === "tv-series" ? "tv" : "movie";
  const searchRes = await fetch(`https://api.themoviedb.org/3/search/${searchType}?api_key=${tmdbKey}&query=${encodeURIComponent(info.title)}&language=en-US`, { signal: AbortSignal.timeout(10000) });
  if (!searchRes.ok) return false;
  const searchData = await searchRes.json() as { results?: Array<Record<string, unknown>> };
  if (!searchData.results?.length) return false;

  const tmdbId = searchData.results[0].id;
  // Fetch details + credits
  const detailRes = await fetch(`https://api.themoviedb.org/3/${searchType}/${tmdbId}?api_key=${tmdbKey}&append_to_response=credits&language=en-US`, { signal: AbortSignal.timeout(10000) });
  if (!detailRes.ok) return false;
  const d = await detailRes.json() as Record<string, unknown>;

  const genres = ((d.genres as Array<{ name: string }>) || []).map(g => g.name);
  const cast = ((d.credits as Record<string, unknown>)?.cast as Array<{ name: string }> || []).slice(0, 8).map(c => c.name);
  const directors = ((d.credits as Record<string, unknown>)?.crew as Array<{ name: string; job: string }> || []).filter(c => c.job === "Director").map(c => c.name);
  const posterUrl = d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : "";
  const rating = d.vote_average as number || 0;
  const overview = String(d.overview || "").slice(0, 1000);
  const year = type === "tv-series"
    ? String(d.first_air_date || "").slice(0, 4)
    : String(d.release_date || "").slice(0, 4);

  const lines = buildCortexPage(d.title as string || d.name as string || info.title, {
    creator: directors.join(", ") || info.creator, type,
    rating, ratingsCount: d.vote_count as number,
    description: overview, categories: genres, coverUrl: posterUrl,
    extra: [
      cast.length ? `- **Cast**: ${cast.join(", ")}` : "",
      directors.length ? `- **Director**: ${directors.join(", ")}` : "",
      d.runtime ? `- **Runtime**: ${d.runtime} min` : "",
      type === "tv-series" && d.number_of_seasons ? `- **Seasons**: ${d.number_of_seasons}` : "",
      year ? `- **Year**: ${year}` : "",
      d.imdb_id ? `- **IMDB**: [${d.imdb_id}](https://www.imdb.com/title/${d.imdb_id})` : "",
    ].filter(Boolean),
  });

  writeFileSync(info.fullPath, lines, "utf-8");
  updateEntityIndex(entityId, info, posterUrl, genres, overview);
  logAction({ ts: Date.now(), type: "action", category: "content-enrich", message: `Enriched ${type} "${info.title}": ⭐${rating.toFixed(1)}, ${genres.join(", ")}` });
  return true;
}

async function enrichGame(entityId: string, info: { title: string; creator: string; cortexPath: string; fullPath: string }): Promise<boolean> {
  // Steam Store API — search by name
  const searchRes = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(info.title)}&cc=us&l=en`, { signal: AbortSignal.timeout(10000) });
  if (!searchRes.ok) return false;
  const searchData = await searchRes.json() as { items?: Array<{ id: number; name: string }> };
  if (!searchData.items?.length) return false;

  const appId = searchData.items[0].id;
  const detailRes = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`, { signal: AbortSignal.timeout(10000) });
  if (!detailRes.ok) return false;
  const detailData = await detailRes.json() as Record<string, { success: boolean; data: Record<string, unknown> }>;
  const d = detailData[String(appId)]?.data;
  if (!d) return false;

  const genres = ((d.genres as Array<{ description: string }>) || []).map(g => g.description);
  const developers = (d.developers as string[]) || [];
  const publishers = (d.publishers as string[]) || [];
  const desc = String(d.short_description || d.detailed_description || "").replace(/<[^>]+>/g, "").slice(0, 1000);
  const coverUrl = d.header_image as string || "";
  const metacritic = (d.metacritic as Record<string, unknown>)?.score as number || 0;
  const releaseDate = (d.release_date as Record<string, string>)?.date || "";

  const lines = buildCortexPage(d.name as string || info.title, {
    creator: developers.join(", ") || info.creator, type: "game",
    rating: metacritic, description: desc, categories: genres, coverUrl,
    extra: [
      developers.length ? `- **Developer**: ${developers.join(", ")}` : "",
      publishers.length ? `- **Publisher**: ${publishers.join(", ")}` : "",
      metacritic ? `- **Metacritic**: ${metacritic}/100` : "",
      releaseDate ? `- **Release Date**: ${releaseDate}` : "",
      `- **Steam**: [Store Page](https://store.steampowered.com/app/${appId})`,
    ].filter(Boolean),
  });

  writeFileSync(info.fullPath, lines, "utf-8");
  updateEntityIndex(entityId, info, coverUrl, genres, desc);
  logAction({ ts: Date.now(), type: "action", category: "content-enrich", message: `Enriched game "${info.title}": metacritic ${metacritic}, ${genres.join(", ")}` });
  return true;
}

async function enrichChannel(entityId: string, info: { title: string; creator: string; cortexPath: string; fullPath: string }): Promise<boolean> {
  const ytKey = getApiKey("youtubeClientId"); // YouTube Data API uses different key
  // For now, use Google's public search — works without API key for basic info
  const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(info.title)}&type=channel&maxResults=1&key=${ytKey || ""}`, { signal: AbortSignal.timeout(10000) });
  if (!searchRes.ok) return false;
  const searchData = await searchRes.json() as { items?: Array<{ id: { channelId: string }; snippet: Record<string, unknown> }> };
  if (!searchData.items?.length) return false;

  const channelId = searchData.items[0].id.channelId;
  const snippet = searchData.items[0].snippet;
  const desc = String(snippet.description || "").slice(0, 1000);
  const thumbnailUrl = (snippet.thumbnails as Record<string, { url: string }>)?.high?.url
    || (snippet.thumbnails as Record<string, { url: string }>)?.default?.url || "";

  const lines = buildCortexPage(snippet.title as string || info.title, {
    creator: snippet.channelTitle as string || "", type: "channel",
    description: desc, coverUrl: thumbnailUrl,
    extra: [
      channelId ? `- **Channel ID**: ${channelId}` : "",
      `- **YouTube**: [Channel](https://www.youtube.com/channel/${channelId})`,
    ].filter(Boolean),
  });

  writeFileSync(info.fullPath, lines, "utf-8");
  updateEntityIndex(entityId, info, thumbnailUrl, [], desc);
  logAction({ ts: Date.now(), type: "action", category: "content-enrich", message: `Enriched channel "${info.title}"` });
  return true;
}

// ─── Shared Helpers ──────────────────────────────────────────────────────────

function buildCortexPage(title: string, opts: {
  creator?: string; type: string;
  publisher?: string; publishedDate?: string; pageCount?: number; language?: string;
  rating?: number; ratingsCount?: number; isbn?: string;
  coverUrl?: string; description?: string; categories?: string[];
  extra?: string[];
}): string {
  const lines: string[] = [`# ${title}\n`];
  if (opts.creator) lines.push(`By **${opts.creator}**.${opts.publisher ? ` Published by ${opts.publisher}` : ""}${opts.publishedDate ? `, ${opts.publishedDate}` : ""}${opts.pageCount ? `. ${opts.pageCount} pages.` : ""}\n`);
  if (opts.rating) {
    const ratingStr = opts.type === "game" ? `🎮 ${opts.rating}/100` : `⭐ ${opts.rating}`;
    lines.push(`${ratingStr}${opts.ratingsCount ? ` (${opts.ratingsCount.toLocaleString()} ratings)` : ""}${opts.categories?.length ? ` · ${opts.categories.join(", ")}` : ""}\n`);
  }
  if (opts.description) { lines.push("## Overview\n"); lines.push(opts.description + "\n"); }
  lines.push("## Details");
  if (opts.creator) lines.push(`- **Creator**: ${opts.creator}`);
  lines.push(`- **Type**: ${opts.type}`);
  lines.push(`- **Source**: Discovered`);
  if (opts.extra) lines.push(...opts.extra);
  if (opts.language) lines.push(`- **Language**: ${opts.language}`);
  if (opts.isbn) lines.push(`- **ISBN**: ${opts.isbn}`);
  if (opts.coverUrl) lines.push(`- **Cover**: ![cover](${opts.coverUrl})`);
  if (opts.categories?.length) { lines.push("\n## Categories"); for (const c of opts.categories) lines.push(`- ${c}`); }
  lines.push(`\n*Enriched: ${new Date().toISOString().split("T")[0]}*`);
  return lines.join("\n");
}

function updateEntityIndex(entityId: string, info: { title: string; cortexPath: string }, imageUrl: string, categories: string[], description: string): void {
  const parsed = parseEntityId(entityId);
  if (!parsed) return;

  const page: DirectIngestPage = {
    path: info.cortexPath, title: info.title, content: "",
    summary: description.slice(0, 200) || info.title,
    tags: [parsed.type, parsed.source, "enriched", ...categories.map(c => c.toLowerCase())],
    entityId,
  };
  updateIndexEntry(info.cortexPath, page);

  upsertEntityIndex({
    entityId, type: parsed.type as EntityType, source: parsed.source as EntitySource,
    title: info.title, slug: parsed.slug, imageUrl, cortexPath: info.cortexPath,
    tags: page.tags, updatedAt: new Date().toISOString(),
  });
  saveEntityIndex();
}

async function enrichArticle(entityId: string, info: { title: string; creator: string; cortexPath: string; fullPath: string }): Promise<boolean> {
  // Use Brave web search to find the article and extract key info
  try {
    const { braveWebSearch, fetchPageContent } = await import("./researcher-tools.js");
    const results = await braveWebSearch(`"${info.title}" article`, 3);
    if (!results.length) return false;

    let content = "";
    let sourceUrl = results[0].url;
    let sourceDomain = "";
    try { sourceDomain = new URL(sourceUrl).hostname.replace("www.", ""); } catch { /* ignore */ }

    // Try to fetch the article content
    try {
      content = await fetchPageContent(sourceUrl);
    } catch { /* ignore */ }

    const desc = content.slice(0, 1000) || results[0].description || "";

    const lines = buildCortexPage(info.title, {
      creator: info.creator || sourceDomain, type: "article",
      description: desc,
      extra: [
        sourceUrl ? `- **URL**: [${sourceDomain}](${sourceUrl})` : "",
        `- **Found via**: Web search`,
      ].filter(Boolean),
    });

    writeFileSync(info.fullPath, lines, "utf-8");
    updateEntityIndex(entityId, info, "", [], desc.slice(0, 200));
    logAction({ ts: Date.now(), type: "action", category: "content-enrich", message: `Enriched article "${info.title}" from ${sourceDomain}` });
    return true;
  } catch { return false; }
}

async function enrichPlace(entityId: string, info: { title: string; creator: string; cortexPath: string; fullPath: string }): Promise<boolean> {
  try {
    const { braveWebSearch, fetchPageContent, braveImageSearch } = await import("./researcher-tools.js");
    const { llm } = await import("./llm.js");

    // Fetch travel content from multiple sources
    const results = await braveWebSearch(`${info.title} travel guide highlights things to do`, 5);
    if (!results.length) return false;

    const pageTexts: string[] = [];
    for (const r of results.slice(0, 3)) {
      try {
        const text = await fetchPageContent(r.url);
        if (text) pageTexts.push(text.slice(0, 3000));
      } catch { /* skip */ }
    }
    const combinedText = pageTexts.join("\n\n---\n\n") || results.map(r => r.description).join("\n");

    // Get a representative image for the destination
    let imageUrl = "";
    try {
      const images = await braveImageSearch(`${info.title} city landmark travel photo`, 3);
      if (images.length > 0) {
        imageUrl = images[0].thumbnail || images[0].url || "";
      }
    } catch { /* image search is optional */ }

    // LLM-extract structured travel data
    const extractionPrompt = `Extract structured travel information about "${info.title}" from the following web content. Return ONLY valid JSON with this exact schema (use empty arrays/strings if info not available):

{
  "country": "string — the country this place is in",
  "region": "string — geographic region (e.g. Southeast Asia, Northern Europe, East Africa)",
  "description": "string — 2-3 sentence overview of this destination",
  "bestTimeToVisit": "string — best months/seasons to visit and why",
  "currency": "string — local currency name and code (e.g. Thai Baht (THB))",
  "language": "string — primary language(s) spoken",
  "climate": "string — brief climate description",
  "highlights": [{"name": "string", "description": "string — 1-2 sentences", "category": "string — one of: culture, nature, food, nightlife, history, adventure, architecture, shopping"}],
  "neighborhoods": [{"name": "string", "description": "string — 1-2 sentences", "vibe": "string — one word like trendy, historic, artsy, bustling, peaceful"}],
  "foodScene": [{"dish": "string — dish or food experience name", "description": "string — 1 sentence"}],
  "gettingAround": "string — how to get around (transit, taxis, walking, etc.)",
  "safetyTips": "string — key safety considerations for travelers",
  "practicalTips": ["string — useful practical tips for visitors"]
}

Aim for 6-10 highlights, 3-5 neighborhoods (if applicable, fewer for small towns), 4-6 food items, and 3-5 practical tips.

Web content:
${combinedText.slice(0, 8000)}`;

    let structured: Record<string, unknown> = {};
    try {
      const raw = await llm({ prompt: extractionPrompt, tier: "fast", responseMimeType: "application/json", temperature: 0.2 });
      structured = JSON.parse(raw);
    } catch {
      // Fallback to basic enrichment if LLM fails
      const desc = combinedText.slice(0, 1000);
      const lines = buildCortexPage(info.title, {
        creator: "", type: "place", description: desc,
        extra: [`- **Type**: Destination`], categories: ["travel", "destination"],
      });
      writeFileSync(info.fullPath, lines, "utf-8");
      updateEntityIndex(entityId, info, "", ["travel", "destination"], desc.slice(0, 200));
      logAction({ ts: Date.now(), type: "action", category: "content-enrich", message: `Enriched place "${info.title}" (basic — LLM failed)` });
      return true;
    }

    const country = String(structured.country || "");
    const region = String(structured.region || "");
    const desc = String(structured.description || "");
    const highlights = Array.isArray(structured.highlights) ? structured.highlights as Array<{ name: string; description: string; category: string }> : [];
    const neighborhoods = Array.isArray(structured.neighborhoods) ? structured.neighborhoods as Array<{ name: string; description: string; vibe: string }> : [];
    const foodScene = Array.isArray(structured.foodScene) ? structured.foodScene as Array<{ dish: string; description: string }> : [];
    const practicalTips = Array.isArray(structured.practicalTips) ? structured.practicalTips as string[] : [];

    // Build a rich Cortex wiki page
    const pageLines: string[] = [`# ${info.title}\n`];
    if (country || region) pageLines.push(`${[country, region].filter(Boolean).join(", ")}.\n`);
    if (desc) { pageLines.push("## Overview\n", desc + "\n"); }
    if (highlights.length) {
      pageLines.push("## Highlights\n");
      for (const h of highlights) pageLines.push(`- **${h.name}** (${h.category}): ${h.description}`);
      pageLines.push("");
    }
    if (neighborhoods.length) {
      pageLines.push("## Neighborhoods\n");
      for (const n of neighborhoods) pageLines.push(`- **${n.name}** [${n.vibe}]: ${n.description}`);
      pageLines.push("");
    }
    if (foodScene.length) {
      pageLines.push("## Food & Drink\n");
      for (const f of foodScene) pageLines.push(`- **${f.dish}**: ${f.description}`);
      pageLines.push("");
    }
    pageLines.push("## Practical Info\n");
    if (structured.bestTimeToVisit) pageLines.push(`- **Best Time to Visit**: ${structured.bestTimeToVisit}`);
    if (structured.currency) pageLines.push(`- **Currency**: ${structured.currency}`);
    if (structured.language) pageLines.push(`- **Language**: ${structured.language}`);
    if (structured.climate) pageLines.push(`- **Climate**: ${structured.climate}`);
    if (structured.gettingAround) pageLines.push(`- **Getting Around**: ${structured.gettingAround}`);
    if (structured.safetyTips) pageLines.push(`- **Safety**: ${structured.safetyTips}`);
    if (practicalTips.length) {
      pageLines.push("");
      for (const tip of practicalTips) pageLines.push(`- ${tip}`);
    }
    pageLines.push("");
    if (results[0]?.url) pageLines.push(`## Sources\n- [${info.title} travel guide](${results[0].url})\n`);
    pageLines.push(`*Enriched: ${new Date().toISOString().split("T")[0]}*`);

    writeFileSync(info.fullPath, pageLines.join("\n"), "utf-8");

    // Update entity index with tags, summary, and structured metadata in one pass
    const tags = ["travel", "destination", ...(country ? [country.toLowerCase()] : []), ...(region ? [region.toLowerCase()] : [])];
    const parsed = parseEntityId(entityId);
    if (parsed) {
      const page: DirectIngestPage = {
        path: info.cortexPath, title: info.title, content: "",
        summary: desc.slice(0, 200) || info.title,
        tags: [parsed.type, parsed.source, "enriched", ...tags],
        entityId,
      };
      updateIndexEntry(info.cortexPath, page);

      upsertEntityIndex({
        entityId, type: parsed.type as EntityType, source: parsed.source as EntitySource,
        title: info.title, slug: parsed.slug, imageUrl, cortexPath: info.cortexPath,
        tags: page.tags, updatedAt: new Date().toISOString(),
        metadata: {
          country, region, description: desc,
          bestTimeToVisit: String(structured.bestTimeToVisit || ""),
          currency: String(structured.currency || ""),
          language: String(structured.language || ""),
          climate: String(structured.climate || ""),
          highlights, neighborhoods, foodScene,
          gettingAround: String(structured.gettingAround || ""),
          safetyTips: String(structured.safetyTips || ""),
          practicalTips,
          guideUrl: results[0]?.url || "",
          enrichedAt: Date.now(),
        },
      });
      saveEntityIndex();
    }

    logAction({ ts: Date.now(), type: "action", category: "content-enrich", message: `Enriched place "${info.title}": ${country}, ${highlights.length} highlights, ${neighborhoods.length} neighborhoods` });
    return true;
  } catch (err) {
    logError("content-enrich", `Failed to enrich place "${info.title}"`, err);
    return false;
  }
}

// ─── Main Dispatcher ─────────────────────────────────────────────────────────

/**
 * Enrich any content entity with metadata from the appropriate API.
 * Dispatches by entity type. Fire-and-forget safe.
 */
export async function enrichEntity(entityId: string): Promise<boolean> {
  try {
    const parsed = parseEntityId(entityId);
    if (!parsed) return false;

    const info = readCortexPage(entityId);
    if (!info) return false;

    switch (parsed.type) {
      case "book":
        return await enrichBook(entityId, info);
      case "movie":
      case "tv-series":
      case "documentary":
        return await enrichMovie(entityId, info, parsed.type);
      case "game":
        return await enrichGame(entityId, info);
      case "channel":
        return await enrichChannel(entityId, info);
      case "article":
        return await enrichArticle(entityId, info);
      case "place":
        return await enrichPlace(entityId, info);
      default:
        logAction({ ts: Date.now(), type: "action", category: "content-enrich", message: `No enricher for type "${parsed.type}"` });
        return false;
    }
  } catch (err) {
    logError("content-enrich", `Failed to enrich ${entityId}`, err);
    return false;
  }
}
