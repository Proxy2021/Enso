import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk";

type AgentToolResult = { content: Array<{ type: string; text?: string }> };

// ── Param types ──

type ExploreParams = { city: string };
type RestaurantsParams = { city: string; cuisine?: string; limit?: number };
type PhotoSpotsParams = { city: string; limit?: number };
type LandmarksParams = { city: string; limit?: number };
type SendEmailParams = {
  recipient: string;
  city: string;
  category?: string;
  places?: Array<{ name: string; description: string; imageUrl?: string; category?: string; rating?: string }>;
  summary?: string;
};

// ── Shared data types ──

interface Place {
  name: string;
  description: string;
  category: string;
  rating?: string;
  imageUrl?: string;
  sourceUrl?: string;
  highlights?: string[];
  location?: string;
}

interface BraveWebResult {
  title: string;
  url: string;
  description: string;
}

interface BraveImageResult {
  title: string;
  url: string;         // page URL
  thumbnail: string;   // image thumbnail src
}

// ── Helpers ──

function jsonResult(data: unknown): AgentToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string): AgentToolResult {
  return { content: [{ type: "text", text: `[ERROR] ${message}` }] };
}

function getBraveApiKey(): string | undefined {
  if (process.env.BRAVE_API_KEY) return process.env.BRAVE_API_KEY;
  try {
    const fs = require("fs");
    const path = require("path");
    const cfgPath = path.join(process.env.OPENCLAW_STATE_DIR || path.join(require("os").homedir(), ".openclaw"), "openclaw.json");
    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
    return cfg?.tools?.web?.search?.apiKey;
  } catch { return undefined; }
}

async function getGeminiApiKey(): Promise<string | undefined> {
  try {
    const { getActiveAccount } = await import("./server.js");
    return getActiveAccount()?.geminiApiKey;
  } catch {
    return process.env.GEMINI_API_KEY;
  }
}

// ── Brave Search helpers ──

async function braveWebSearch(query: string, count = 5): Promise<BraveWebResult[]> {
  const apiKey = getBraveApiKey();
  if (!apiKey) {
    console.log("[enso:city] braveWebSearch: no BRAVE_API_KEY");
    return [];
  }
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(Math.max(count, 1), 10)));

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 10_000);
  try {
    const resp = await globalThis.fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
      signal: ac.signal,
    });
    if (!resp.ok) {
      console.log(`[enso:city] braveWebSearch failed: ${resp.status}`);
      return [];
    }
    const body = (await resp.json()) as { web?: { results?: Array<{ title: string; url: string; description: string }> } };
    return (body.web?.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      description: r.description ?? "",
    }));
  } catch (err) {
    console.log(`[enso:city] braveWebSearch error: ${err}`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function braveImageSearch(query: string, count = 6): Promise<BraveImageResult[]> {
  const apiKey = getBraveApiKey();
  if (!apiKey) return [];

  const url = new URL("https://api.search.brave.com/res/v1/images/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(Math.max(count, 1), 10)));

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 10_000);
  try {
    const resp = await globalThis.fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
      signal: ac.signal,
    });
    if (!resp.ok) return [];
    const body = (await resp.json()) as { results?: Array<{ title: string; url: string; thumbnail?: { src: string } }> };
    return (body.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      thumbnail: r.thumbnail?.src ?? "",
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ── LLM synthesis ──

async function synthesizePlaces(
  snippets: BraveWebResult[],
  images: BraveImageResult[],
  city: string,
  category: string,
  limit: number,
): Promise<{ places: Place[]; summary: string }> {
  const geminiKey = await getGeminiApiKey();
  if (!geminiKey || snippets.length === 0) {
    // Fallback: build places from raw search snippets
    return fallbackFromSnippets(snippets, images, city, limit);
  }

  const snippetText = snippets.map((s, i) => `${i + 1}. ${s.title}\n   ${s.description}\n   URL: ${s.url}`).join("\n");

  const prompt = `You are a travel research assistant. Given web search results about ${category} in ${city}, extract the top ${limit} specific places/venues.

SEARCH RESULTS:
${snippetText}

Return valid JSON (no markdown fences) with this exact structure:
{
  "places": [
    {
      "name": "Place Name",
      "description": "2-3 sentence description with what makes it special",
      "category": "Subcategory (e.g. Fine Dining, Scenic Viewpoint, Historical Monument)",
      "rating": "rating if mentioned or empty string",
      "highlights": ["highlight 1", "highlight 2"],
      "location": "neighborhood or area if known",
      "sourceUrl": "source URL from the search results"
    }
  ],
  "summary": "One paragraph overview of ${category} in ${city}"
}

Rules:
- Return exactly ${limit} places (or fewer if not enough data)
- Each place must be a real, specific venue/location (not generic descriptions)
- Description should be informative and enticing
- Category should be a specific subcategory relevant to the place type`;

  try {
    const { callGeminiLLMWithRetry } = await import("./ui-generator.js");
    const raw = await callGeminiLLMWithRetry(prompt, geminiKey);
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned) as { places: Place[]; summary: string };
    // Match images to places
    const places = matchImagesToPlaces(parsed.places ?? [], images);
    return { places: places.slice(0, limit), summary: parsed.summary ?? "" };
  } catch (err) {
    console.log(`[enso:city] synthesizePlaces LLM error: ${err}`);
    return fallbackFromSnippets(snippets, images, city, limit);
  }
}

function fallbackFromSnippets(
  snippets: BraveWebResult[],
  images: BraveImageResult[],
  _city: string,
  limit: number,
): { places: Place[]; summary: string } {
  const places: Place[] = snippets.slice(0, limit).map((s, i) => ({
    name: s.title.split(" - ")[0].split(" | ")[0].trim() || `Place ${i + 1}`,
    description: s.description,
    category: "Notable",
    sourceUrl: s.url,
    imageUrl: images[i]?.thumbnail,
  }));
  return { places, summary: `Search results for the query.` };
}

function matchImagesToPlaces(places: Place[], images: BraveImageResult[]): Place[] {
  const usedImages = new Set<number>();
  return places.map((place) => {
    if (place.imageUrl) return place;
    // Fuzzy match: find image whose title contains any word from the place name (3+ chars)
    const nameWords = place.name.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < images.length; i++) {
      if (usedImages.has(i)) continue;
      const imgTitle = images[i].title.toLowerCase();
      const score = nameWords.filter((w) => imgTitle.includes(w)).length;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestScore > 0) {
      usedImages.add(bestIdx);
      return { ...place, imageUrl: images[bestIdx].thumbnail };
    }
    // Fallback: assign first unused image
    for (let i = 0; i < images.length; i++) {
      if (!usedImages.has(i)) {
        usedImages.add(i);
        return { ...place, imageUrl: images[i].thumbnail };
      }
    }
    return place;
  });
}

// ── Sample data for demo/no-API-key mode ──

function generateSamplePlaces(city: string, category: "restaurants" | "photo_spots" | "landmarks", limit: number): Place[] {
  const sampleData: Record<string, Place[]> = {
    restaurants: [
      { name: `Le Comptoir du Panthéon`, description: `Classic French bistro known for its seasonal menu and lively sidewalk terrace in the heart of the Latin Quarter.`, category: "French Bistro", rating: "4.5", highlights: ["Seasonal tasting menu", "Outdoor terrace seating", "Wine pairing available"], location: "Latin Quarter" },
      { name: `Maison Maison`, description: `Modern fusion restaurant blending French culinary traditions with Asian influences, set in a beautifully restored townhouse.`, category: "Fusion", rating: "4.7", highlights: ["Tasting menu", "Sake pairings", "Historic building"], location: "Le Marais" },
      { name: `Chez L'Ami Jean`, description: `Beloved neighborhood restaurant famous for generous Basque-inspired dishes and legendary rice pudding dessert.`, category: "Basque Cuisine", rating: "4.6", highlights: ["Rice pudding dessert", "Basque dishes", "Warm atmosphere"], location: "7th Arrondissement" },
      { name: `Brasserie Lipp`, description: `Iconic Parisian brasserie since 1880, serving traditional Alsatian dishes to artists, politicians, and food lovers.`, category: "Traditional Brasserie", rating: "4.3", highlights: ["Historic since 1880", "Alsatian cuisine", "Celebrity clientele"], location: "Saint-Germain-des-Prés" },
      { name: `Pink Mamma`, description: `Multi-story Italian trattoria with a rooftop terrace, wood-fired pizzas, and a buzzing atmosphere that draws long queues.`, category: "Italian", rating: "4.4", highlights: ["Rooftop terrace", "Wood-fired pizza", "Instagram-worthy interior"], location: "Oberkampf" },
      { name: `Le Bouillon Chartier`, description: `Grand belle époque dining hall serving affordable classic French fare since 1896, a must-visit for the atmosphere alone.`, category: "Classic French", rating: "4.2", highlights: ["Belle époque interior", "Budget-friendly", "Historic landmark"], location: "Grands Boulevards" },
    ],
    photo_spots: [
      { name: `Trocadéro Gardens`, description: `The iconic viewpoint across the Seine offering the most photographed angle of the Eiffel Tower, especially magical at golden hour.`, category: "Scenic Viewpoint", highlights: ["Eiffel Tower view", "Golden hour magic", "Fountain foreground"], location: "16th Arrondissement" },
      { name: `Rue Crémieux`, description: `A narrow, colorful pedestrian street lined with pastel-painted houses — one of the most Instagram-famous spots in Paris.`, category: "Street Photography", highlights: ["Pastel houses", "Car-free street", "Instagram favorite"], location: "12th Arrondissement" },
      { name: `Pont Alexandre III`, description: `The most ornate bridge in Paris, with gilded statues, Art Nouveau lamps, and stunning views of the Invalides and Grand Palais.`, category: "Architecture", highlights: ["Art Nouveau design", "Gilded statues", "River views"], location: "8th Arrondissement" },
      { name: `Montmartre & Sacré-Cœur`, description: `The hilltop artists' quarter with winding cobblestone streets, panoramic city views, and the dazzling white basilica.`, category: "Panoramic View", highlights: ["City panorama", "Cobblestone streets", "Street artists"], location: "18th Arrondissement" },
      { name: `Louvre Pyramid`, description: `I.M. Pei's glass pyramid creates striking geometric contrasts against the classical Louvre palace, best shot at blue hour.`, category: "Iconic Landmark", highlights: ["Glass pyramid", "Reflections at blue hour", "Classical backdrop"], location: "1st Arrondissement" },
      { name: `Canal Saint-Martin`, description: `Charming canal with iron footbridges and tree-lined banks, perfect for capturing the romantic, local side of Paris.`, category: "Urban Landscape", highlights: ["Iron footbridges", "Tree-lined banks", "Local atmosphere"], location: "10th Arrondissement" },
    ],
    landmarks: [
      { name: `Eiffel Tower`, description: `The 330-meter iron lattice tower built for the 1889 World's Fair remains the defining symbol of Paris and France.`, category: "Iconic Monument", rating: "4.7", highlights: ["Summit observation deck", "Nighttime light show", "Built 1889"], location: "Champ de Mars" },
      { name: `Notre-Dame Cathedral`, description: `Masterpiece of French Gothic architecture dating to the 12th century, currently undergoing restoration after the 2019 fire.`, category: "Gothic Cathedral", rating: "4.8", highlights: ["Gothic architecture", "Rose windows", "Island location"], location: "Île de la Cité" },
      { name: `Arc de Triomphe`, description: `Napoleon's monumental arch honoring those who fought for France, standing at the center of twelve radiating avenues.`, category: "Historical Monument", rating: "4.6", highlights: ["Rooftop panorama", "Tomb of Unknown Soldier", "Champs-Élysées views"], location: "Place Charles de Gaulle" },
      { name: `Palace of Versailles`, description: `The lavish royal palace with its Hall of Mirrors, magnificent gardens, and fountains that defined European grandeur.`, category: "Royal Palace", rating: "4.8", highlights: ["Hall of Mirrors", "Formal gardens", "Musical fountains show"], location: "Versailles" },
      { name: `Musée d'Orsay`, description: `Housed in a stunning Beaux-Arts railway station, this museum holds the world's greatest collection of Impressionist art.`, category: "Art Museum", rating: "4.7", highlights: ["Impressionist collection", "Railway station architecture", "River Seine views"], location: "7th Arrondissement" },
      { name: `Panthéon`, description: `Neoclassical monument in the Latin Quarter housing the remains of France's greatest citizens, from Voltaire to Marie Curie.`, category: "Neoclassical Monument", rating: "4.5", highlights: ["Foucault's Pendulum", "Crypt of luminaries", "Dome views"], location: "Latin Quarter" },
    ],
  };

  // Generic fallback that adapts to any city name
  const templates = sampleData[category] ?? sampleData.restaurants;
  return templates.slice(0, limit).map((p) => ({
    ...p,
    description: p.description.replace(/Paris/g, city),
  }));
}

// ── Research pipeline ──

async function researchCategory(
  city: string,
  category: "restaurants" | "photo_spots" | "landmarks",
  options?: { cuisine?: string; limit?: number },
): Promise<{ places: Place[]; summary: string; searchSources: string[] }> {
  const limit = Math.min(Math.max(options?.limit ?? 6, 2), 12);

  // If no Brave API key, use LLM-only research or sample data
  if (!getBraveApiKey()) {
    console.log(`[enso:city] No BRAVE_API_KEY — attempting LLM-only research for ${category} in ${city}`);
    const geminiKey = await getGeminiApiKey();
    if (geminiKey) {
      try {
        return await llmOnlyResearch(city, category, limit, geminiKey, options?.cuisine);
      } catch (err) {
        console.log(`[enso:city] LLM-only research failed: ${err}`);
      }
    }
    // Final fallback: sample data
    const places = generateSamplePlaces(city, category, limit);
    return {
      places,
      summary: `Sample data for ${category.replace(/_/g, " ")} in ${city}. Set BRAVE_API_KEY for live web research.`,
      searchSources: [],
    };
  }

  const categoryLabels: Record<string, string> = {
    restaurants: "restaurants",
    photo_spots: "photography spots and scenic locations",
    landmarks: "tourist landmarks and monuments",
  };
  const categoryLabel = categoryLabels[category] ?? category;
  const cuisineSuffix = options?.cuisine ? ` ${options.cuisine} cuisine` : "";
  const searchQuery = `best ${categoryLabel}${cuisineSuffix} in ${city}`;
  const imageQuery = `${city} ${categoryLabel}${cuisineSuffix} photos`;

  // Run web search + image search in parallel
  const [webResults, imageResults] = await Promise.all([
    braveWebSearch(searchQuery, limit + 2),
    braveImageSearch(imageQuery, limit + 2),
  ]);

  const { places, summary } = await synthesizePlaces(webResults, imageResults, city, categoryLabel, limit);
  const searchSources = webResults.map((r) => r.url).filter(Boolean);

  return { places, summary, searchSources };
}

async function llmOnlyResearch(
  city: string,
  category: "restaurants" | "photo_spots" | "landmarks",
  limit: number,
  geminiKey: string,
  cuisine?: string,
): Promise<{ places: Place[]; summary: string; searchSources: string[] }> {
  const categoryLabels: Record<string, string> = {
    restaurants: "restaurants",
    photo_spots: "photography and scenic spots",
    landmarks: "tourist landmarks and monuments",
  };
  const categoryLabel = categoryLabels[category] ?? category;
  const cuisineSuffix = cuisine ? ` (${cuisine} cuisine)` : "";

  const prompt = `You are a knowledgeable city travel guide. Recommend the top ${limit} ${categoryLabel}${cuisineSuffix} in ${city}.

Return valid JSON (no markdown fences) with this exact structure:
{
  "places": [
    {
      "name": "Specific Place Name",
      "description": "2-3 sentence description with what makes it special",
      "category": "Subcategory",
      "rating": "rating out of 5 if applicable, or empty string",
      "highlights": ["highlight 1", "highlight 2"],
      "location": "neighborhood or area"
    }
  ],
  "summary": "One paragraph overview of ${categoryLabel} in ${city}"
}

Rules:
- Only recommend real, well-known places
- Be specific with names and descriptions
- Return exactly ${limit} places`;

  const { callGeminiLLMWithRetry } = await import("./ui-generator.js");
  const raw = await callGeminiLLMWithRetry(prompt, geminiKey);
  const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const parsed = JSON.parse(cleaned) as { places: Place[]; summary: string };
  return {
    places: (parsed.places ?? []).slice(0, limit),
    summary: parsed.summary ?? "",
    searchSources: [],
  };
}

// ── Tool implementations ──

async function cityExplore(params: ExploreParams): Promise<AgentToolResult> {
  const city = params.city?.trim();
  if (!city) {
    // Return welcome/landing state — template renders a city search input
    return jsonResult({
      tool: "enso_city_explore",
      city: "",
      category: "welcome",
      sections: [],
      places: [],
      summary: "",
      searchSources: [],
    });
  }

  // Research all 3 categories in parallel, 4 results each
  const [restaurants, photoSpots, landmarks] = await Promise.all([
    researchCategory(city, "restaurants", { limit: 4 }),
    researchCategory(city, "photo_spots", { limit: 4 }),
    researchCategory(city, "landmarks", { limit: 4 }),
  ]);

  const allSources = [
    ...restaurants.searchSources,
    ...photoSpots.searchSources,
    ...landmarks.searchSources,
  ];

  return jsonResult({
    tool: "enso_city_explore",
    city,
    category: "overview",
    sections: [
      { label: "Top Restaurants", category: "restaurants", places: restaurants.places },
      { label: "Photo Spots", category: "photo_spots", places: photoSpots.places },
      { label: "Landmarks", category: "landmarks", places: landmarks.places },
    ],
    places: [...restaurants.places, ...photoSpots.places, ...landmarks.places],
    summary: `Explore ${city}: ${restaurants.places.length} restaurants, ${photoSpots.places.length} photo spots, and ${landmarks.places.length} landmarks discovered.`,
    searchSources: [...new Set(allSources)].slice(0, 15),
  });
}

async function cityRestaurants(params: RestaurantsParams): Promise<AgentToolResult> {
  const city = params.city?.trim() || "Paris";

  const result = await researchCategory(city, "restaurants", {
    cuisine: params.cuisine,
    limit: params.limit,
  });

  return jsonResult({
    tool: "enso_city_restaurants",
    city,
    category: "restaurants",
    cuisine: params.cuisine ?? "all",
    places: result.places,
    summary: result.summary,
    searchSources: result.searchSources,
  });
}

async function cityPhotoSpots(params: PhotoSpotsParams): Promise<AgentToolResult> {
  const city = params.city?.trim() || "Paris";

  const result = await researchCategory(city, "photo_spots", { limit: params.limit });

  return jsonResult({
    tool: "enso_city_photo_spots",
    city,
    category: "photo_spots",
    places: result.places,
    summary: result.summary,
    searchSources: result.searchSources,
  });
}

async function cityLandmarks(params: LandmarksParams): Promise<AgentToolResult> {
  const city = params.city?.trim() || "Paris";

  const result = await researchCategory(city, "landmarks", { limit: params.limit });

  return jsonResult({
    tool: "enso_city_landmarks",
    city,
    category: "landmarks",
    places: result.places,
    summary: result.summary,
    searchSources: result.searchSources,
  });
}

async function citySendEmail(params: SendEmailParams): Promise<AgentToolResult> {
  const recipient = params.recipient?.trim();
  if (!recipient) return errorResult("recipient email is required");
  const city = params.city?.trim() || "City";
  const places = params.places ?? [];
  const summary = params.summary ?? `Curated picks for ${city}`;
  const category = params.category ?? "overview";

  const html = buildEmailHtml(city, category, places, summary);

  // Try Resend API
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 10_000);
      try {
        const resp = await globalThis.fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Enso City Planner <onboarding@resend.dev>",
            to: [recipient],
            subject: `${city} — City Research Report`,
            html,
          }),
          signal: ac.signal,
        });
        if (resp.ok) {
          return jsonResult({
            tool: "enso_city_send_email",
            success: true,
            recipient,
            city,
            message: `Email sent to ${recipient}`,
          });
        }
        const errBody = await resp.text();
        console.log(`[enso:city] Resend API error: ${resp.status} ${errBody}`);
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      console.log(`[enso:city] Resend send error: ${err}`);
    }
  }

  // Fallback: return HTML for manual use
  return jsonResult({
    tool: "enso_city_send_email",
    success: false,
    recipient,
    city,
    message: resendKey
      ? "Email send failed — HTML report generated below"
      : "No RESEND_API_KEY configured — HTML report generated below",
    fallbackHtml: html,
  });
}

function buildEmailHtml(
  city: string,
  category: string,
  places: Array<{ name: string; description: string; imageUrl?: string; category?: string; rating?: string }>,
  summary: string,
): string {
  const categoryTitle: Record<string, string> = {
    overview: "City Overview",
    restaurants: "Restaurants",
    photo_spots: "Photo Spots",
    landmarks: "Landmarks",
  };
  const title = `${city} — ${categoryTitle[category] ?? category}`;

  const placeCards = places
    .map(
      (p) => `
    <tr><td style="padding:8px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1e1e2e;border-radius:8px;overflow:hidden;">
        ${p.imageUrl ? `<tr><td><img src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(p.name)}" width="100%" style="display:block;max-height:160px;object-fit:cover;" /></td></tr>` : ""}
        <tr><td style="padding:12px 16px;">
          <div style="color:#e2e8f0;font-size:16px;font-weight:600;">${escapeHtml(p.name)}</div>
          ${p.category ? `<div style="color:#94a3b8;font-size:12px;margin-top:2px;">${escapeHtml(p.category)}${p.rating ? ` · ${escapeHtml(p.rating)}` : ""}</div>` : ""}
          <div style="color:#cbd5e1;font-size:14px;margin-top:6px;line-height:1.4;">${escapeHtml(p.description)}</div>
        </td></tr>
      </table>
    </td></tr>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:20px;">
  <tr><td style="padding:20px 0;text-align:center;">
    <div style="color:#e2e8f0;font-size:24px;font-weight:700;">${escapeHtml(title)}</div>
    <div style="color:#94a3b8;font-size:14px;margin-top:6px;">${escapeHtml(summary)}</div>
  </td></tr>
  ${placeCards}
  <tr><td style="padding:16px 0;text-align:center;color:#64748b;font-size:12px;">
    Generated by Enso City Planner
  </td></tr>
</table>
</body></html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Tool registration ──

export function createCityTools(): AnyAgentTool[] {
  return [
    {
      name: "enso_city_explore",
      label: "City Explore",
      description: "Full city overview — discovers top restaurants, photography spots, and tourist landmarks using web research and AI synthesis.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          city: { type: "string", description: "City name (e.g. 'Paris', 'Tokyo')" },
        },
        required: ["city"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        cityExplore(params as ExploreParams),
    } as AnyAgentTool,
    {
      name: "enso_city_restaurants",
      label: "City Restaurants",
      description: "Deep restaurant research for a city — cuisine types, ratings, descriptions, and images.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          city: { type: "string", description: "City name" },
          cuisine: { type: "string", description: "Cuisine filter (e.g. 'Italian', 'Japanese')" },
          limit: { type: "number", description: "Max results (2-12, default 6)" },
        },
        required: ["city"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        cityRestaurants(params as RestaurantsParams),
    } as AnyAgentTool,
    {
      name: "enso_city_photo_spots",
      label: "City Photo Spots",
      description: "Discover scenic and Instagram-worthy photography locations in a city.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          city: { type: "string", description: "City name" },
          limit: { type: "number", description: "Max results (2-12, default 6)" },
        },
        required: ["city"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        cityPhotoSpots(params as PhotoSpotsParams),
    } as AnyAgentTool,
    {
      name: "enso_city_landmarks",
      label: "City Landmarks",
      description: "Research tourist landmarks — historical, iconic, and cultural sites in a city.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          city: { type: "string", description: "City name" },
          limit: { type: "number", description: "Max results (2-12, default 6)" },
        },
        required: ["city"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        cityLandmarks(params as LandmarksParams),
    } as AnyAgentTool,
    {
      name: "enso_city_send_email",
      label: "City Email Report",
      description: "Compile city research results into a styled HTML email and send via Resend API.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          recipient: { type: "string", description: "Email address to send to" },
          city: { type: "string", description: "City name for the report title" },
          category: { type: "string", description: "Category: overview, restaurants, photo_spots, landmarks" },
          places: {
            type: "array",
            description: "Places to include in the email",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                imageUrl: { type: "string" },
                category: { type: "string" },
                rating: { type: "string" },
              },
              required: ["name", "description"],
            },
          },
          summary: { type: "string", description: "Summary text for the email header" },
        },
        required: ["recipient", "city"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        citySendEmail(params as SendEmailParams),
    } as AnyAgentTool,
  ];
}

export function registerCityTools(api: OpenClawPluginApi): void {
  for (const tool of createCityTools()) {
    api.registerTool(tool);
  }
}
