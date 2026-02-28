import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { getDocCollection, type DocMeta } from "./persistence.js";
import { sendHtmlEmail } from "./email.js";

type AgentToolResult = { content: Array<{ type: string; text?: string }> };

// ── Param types ──

type ExploreParams = { city: string; force?: boolean };
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
type DeleteHistoryParams = { city: string };

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

interface CityVideo {
  title: string;
  url: string;         // video page URL
  thumbnail: string;
  description: string;
  duration?: string;
  creator?: string;
  publisher?: string;
  age?: string;
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

// ── Persistent exploration cache ──

interface CachedCityExploration {
  city: string;
  sections: Array<{ label: string; category: string; places: Place[] }>;
  places: Place[];
  summary: string;
  searchSources: string[];
  videos: CityVideo[];
  timestamp: number;
}

interface CityHistoryMeta extends DocMeta {
  city: string;
  placeCount: number;
  videoCount: number;
  summaryPreview: string;
}

const cityCache = new Map<string, CachedCityExploration>();

const cityHistory = getDocCollection<CachedCityExploration, CityHistoryMeta>(
  "city_planner",
  "explorations",
  { maxEntries: 30 },
);

function citySlug(city: string): string {
  return city.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

// Hydrate in-memory cache from disk on module load
for (const entry of cityHistory.list()) {
  const data = cityHistory.load(entry.id);
  if (data) cityCache.set(data.city.toLowerCase(), data);
}

// ── Helpers ──

function jsonResult(data: unknown): AgentToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string): AgentToolResult {
  return { content: [{ type: "text", text: `[ERROR] ${message}` }] };
}

function getBraveApiKey(): string | undefined {
  return process.env.BRAVE_API_KEY;
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

async function braveVideoSearch(query: string, count = 6): Promise<CityVideo[]> {
  const apiKey = getBraveApiKey();
  if (!apiKey) return [];

  const url = new URL("https://api.search.brave.com/res/v1/videos/search");
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
    const body = (await resp.json()) as {
      results?: Array<{
        title: string;
        url: string;
        description?: string;
        age?: string;
        video?: { duration?: string; creator?: string; publisher?: string };
        thumbnail?: { src: string };
      }>;
    };
    return (body.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      thumbnail: r.thumbnail?.src ?? "",
      description: r.description ?? "",
      duration: r.video?.duration,
      creator: r.video?.creator,
      publisher: r.video?.publisher,
      age: r.age,
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

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
    // Return welcome/landing state — template renders a city search input + recent explorations
    const recentCities = cityHistory.list().slice(0, 8).map((entry) => ({
      city: entry.meta.city,
      placeCount: entry.meta.placeCount,
      videoCount: entry.meta.videoCount,
      summaryPreview: entry.meta.summaryPreview,
      timestamp: entry.timestamp,
    }));
    return jsonResult({
      tool: "enso_city_explore",
      city: "",
      category: "welcome",
      sections: [],
      places: [],
      summary: "",
      searchSources: [],
      videos: [],
      recentCities,
    });
  }

  // Check cache unless force=true
  const cacheKey = city.toLowerCase();
  if (!params.force && cityCache.has(cacheKey)) {
    const cached = cityCache.get(cacheKey)!;
    console.log(`[enso:city] cache hit for "${city}" (${cached.places.length} places, ${cached.videos.length} videos)`);
    return jsonResult({
      tool: "enso_city_explore",
      city: cached.city,
      category: "overview",
      sections: cached.sections,
      places: cached.places,
      summary: cached.summary,
      searchSources: cached.searchSources,
      videos: cached.videos,
      fromHistory: true,
    });
  }

  // Research all 3 categories + videos in parallel
  const [restaurants, photoSpots, landmarks, videos] = await Promise.all([
    researchCategory(city, "restaurants", { limit: 4 }),
    researchCategory(city, "photo_spots", { limit: 4 }),
    researchCategory(city, "landmarks", { limit: 4 }),
    braveVideoSearch(`${city} travel guide things to do`, 6),
  ]);

  const allSources = [
    ...restaurants.searchSources,
    ...photoSpots.searchSources,
    ...landmarks.searchSources,
  ];

  const sections = [
    { label: "Top Restaurants", category: "restaurants", places: restaurants.places },
    { label: "Photo Spots", category: "photo_spots", places: photoSpots.places },
    { label: "Landmarks", category: "landmarks", places: landmarks.places },
  ];
  const allPlaces = [...restaurants.places, ...photoSpots.places, ...landmarks.places];
  const summaryText = `Explore ${city}: ${restaurants.places.length} restaurants, ${photoSpots.places.length} photo spots, and ${landmarks.places.length} landmarks discovered.`;
  const sourcesDeduped = [...new Set(allSources)].slice(0, 15);

  // Persist to cache + disk
  const cacheEntry: CachedCityExploration = {
    city,
    sections,
    places: allPlaces,
    summary: summaryText,
    searchSources: sourcesDeduped,
    videos,
    timestamp: Date.now(),
  };
  cityCache.set(cacheKey, cacheEntry);
  try {
    cityHistory.save(citySlug(city), cacheEntry, {
      city,
      placeCount: allPlaces.length,
      videoCount: videos.length,
      summaryPreview: summaryText.slice(0, 120),
    });
    console.log(`[enso:city] saved exploration for "${city}" (${allPlaces.length} places, ${videos.length} videos)`);
  } catch (err) {
    console.log(`[enso:city] failed to persist exploration: ${err}`);
  }

  return jsonResult({
    tool: "enso_city_explore",
    city,
    category: "overview",
    sections,
    places: allPlaces,
    summary: summaryText,
    searchSources: sourcesDeduped,
    videos,
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

  // Pull rich data from cache if available (much better than agent-passed flat data)
  const cached = cityCache.get(city.toLowerCase());
  const sections = cached?.sections ?? [];
  const places = cached?.places ?? params.places ?? [];
  const summary = cached?.summary ?? params.summary ?? `Curated picks for ${city}`;
  const videos = cached?.videos ?? [];
  const sources = cached?.searchSources ?? [];

  if (places.length === 0) {
    return errorResult(`No exploration data found for "${city}". Run enso_city_explore first.`);
  }

  const html = buildEmailHtml(city, sections, places, summary, videos, sources);
  const subject = `🏙️ ${city} — City Travel Guide`;

  // Build plain-text fallback
  const textLines = [`${city} — City Travel Guide`, "", summary, ""];
  for (const section of sections) {
    textLines.push(`── ${section.label} ──`);
    for (const p of section.places) {
      textLines.push(`  • ${p.name}${p.rating ? ` (${p.rating})` : ""}`);
      textLines.push(`    ${p.description}`);
      if (p.highlights?.length) textLines.push(`    ✦ ${p.highlights.join(" · ")}`);
    }
    textLines.push("");
  }
  if (videos.length > 0) {
    textLines.push("── Video Guides ──");
    for (const v of videos) textLines.push(`  ▶ ${v.title} — ${v.url}`);
    textLines.push("");
  }
  textLines.push("Generated by Enso City Planner");

  // Primary: send via himalaya CLI (local SMTP)
  try {
    const result = await sendHtmlEmail({
      to: recipient,
      subject,
      html,
      textFallback: textLines.join("\n"),
    });
    if (result.success) {
      return jsonResult({
        tool: "enso_city_send_email",
        success: true,
        recipient,
        city,
        message: result.message,
        placeCount: places.length,
        videoCount: videos.length,
      });
    }
    console.log(`[enso:city] himalaya send failed: ${result.message}`);
  } catch (err) {
    console.log(`[enso:city] himalaya send error: ${err}`);
  }

  // Fallback: return HTML for manual use
  return jsonResult({
    tool: "enso_city_send_email",
    success: false,
    recipient,
    city,
    message: "Email send failed — HTML report generated below",
    fallbackHtml: html,
  });
}

async function cityDeleteHistory(params: DeleteHistoryParams): Promise<AgentToolResult> {
  const city = params.city?.trim();
  if (!city) {
    // Delete all history
    const entries = cityHistory.list();
    for (const entry of entries) {
      cityHistory.remove(entry.id);
    }
    cityCache.clear();
    return jsonResult({
      tool: "enso_city_explore",
      city: "",
      category: "welcome",
      sections: [],
      places: [],
      summary: "",
      videos: [],
      recentCities: [],
      deletedCount: entries.length,
    });
  }

  // Delete specific city
  const slug = citySlug(city);
  const removed = cityHistory.remove(slug);
  cityCache.delete(city.toLowerCase());

  // Return welcome with updated recent list
  const recentCities = cityHistory.list().slice(0, 8).map((entry) => ({
    city: entry.meta.city,
    placeCount: entry.meta.placeCount,
    videoCount: entry.meta.videoCount,
    summaryPreview: entry.meta.summaryPreview,
    timestamp: entry.timestamp,
  }));

  return jsonResult({
    tool: "enso_city_explore",
    city: "",
    category: "welcome",
    sections: [],
    places: [],
    summary: "",
    videos: [],
    recentCities,
    deletedCity: removed ? city : null,
  });
}

function buildEmailHtml(
  city: string,
  sections: Array<{ label: string; category: string; places: Place[] }>,
  _allPlaces: Place[],
  summary: string,
  videos: CityVideo[],
  sources: string[],
): string {
  const esc = escapeHtml;
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  // Category icons (emoji)
  const catIcon: Record<string, string> = { restaurants: "🍽️", photo_spots: "📸", landmarks: "🏛️" };

  // Build section HTML
  const sectionBlocks = sections.map((section) => {
    const icon = catIcon[section.category] ?? "📍";
    const placeRows = section.places.map((p) => {
      const highlights = (p.highlights ?? []).slice(0, 3);
      const highlightHtml = highlights.length > 0
        ? `<div style="margin-top:6px;">${highlights.map((h) => `<span style="display:inline-block;background:#2d2b55;color:#c4b5fd;font-size:11px;padding:2px 8px;border-radius:10px;margin:2px 4px 2px 0;">${esc(h)}</span>`).join("")}</div>`
        : "";
      const locationHtml = p.location ? `<div style="color:#64748b;font-size:12px;margin-top:3px;">📍 ${esc(p.location)}</div>` : "";

      return `<tr><td style="padding:6px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border-radius:8px;overflow:hidden;border:1px solid #2a2a4a;">
          ${p.imageUrl ? `<tr><td><img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" width="100%" style="display:block;max-height:180px;object-fit:cover;" /></td></tr>` : ""}
          <tr><td style="padding:14px 16px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="color:#f1f5f9;font-size:15px;font-weight:600;">${esc(p.name)}</td>
              ${p.rating ? `<td style="text-align:right;color:#fbbf24;font-size:13px;font-weight:600;white-space:nowrap;">⭐ ${esc(p.rating)}</td>` : ""}
            </tr></table>
            ${locationHtml}
            <div style="color:#cbd5e1;font-size:13px;margin-top:8px;line-height:1.5;">${esc(p.description)}</div>
            ${highlightHtml}
          </td></tr>
        </table>
      </td></tr>`;
    }).join("\n");

    return `<tr><td style="padding:24px 0 8px;">
      <div style="color:#e2e8f0;font-size:18px;font-weight:700;border-bottom:2px solid #3b3b5c;padding-bottom:8px;">
        ${icon} ${esc(section.label)} <span style="color:#64748b;font-size:13px;font-weight:400;">(${section.places.length})</span>
      </div>
    </td></tr>
    ${placeRows}`;
  }).join("\n");

  // Video section
  const videoSection = videos.length > 0 ? `
    <tr><td style="padding:24px 0 8px;">
      <div style="color:#e2e8f0;font-size:18px;font-weight:700;border-bottom:2px solid #3b3b5c;padding-bottom:8px;">🎬 Video Guides <span style="color:#64748b;font-size:13px;font-weight:400;">(${videos.length})</span></div>
    </td></tr>
    ${videos.slice(0, 6).map((v) => `<tr><td style="padding:4px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border-radius:8px;border:1px solid #2a2a4a;">
        <tr>
          ${v.thumbnail ? `<td width="120" style="vertical-align:top;"><a href="${esc(v.url)}" style="text-decoration:none;"><img src="${esc(v.thumbnail)}" alt="" width="120" style="display:block;border-radius:8px 0 0 8px;height:68px;object-fit:cover;" /></a></td>` : ""}
          <td style="padding:10px 14px;vertical-align:top;">
            <a href="${esc(v.url)}" style="color:#93c5fd;font-size:13px;font-weight:600;text-decoration:none;">${esc(v.title)}</a>
            <div style="color:#64748b;font-size:11px;margin-top:3px;">${[v.creator, v.duration].filter(Boolean).map(esc).join(" · ")}</div>
          </td>
        </tr>
      </table>
    </td></tr>`).join("\n")}` : "";

  // Sources
  const sourceSection = sources.length > 0 ? `
    <tr><td style="padding:20px 0 4px;">
      <div style="color:#64748b;font-size:12px;font-weight:600;margin-bottom:6px;">SOURCES</div>
      <div style="color:#475569;font-size:11px;line-height:1.6;">
        ${sources.slice(0, 10).map((url) => { try { return `<a href="${esc(url)}" style="color:#475569;text-decoration:none;">${esc(new URL(url).hostname)}</a>`; } catch { return ""; } }).filter(Boolean).join(" · ")}
      </div>
    </td></tr>` : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0d0d1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;">
  <!-- Header banner -->
  <tr><td style="background:linear-gradient(135deg,#1e1b4b,#312e81);padding:32px 24px;text-align:center;border-radius:0 0 16px 16px;">
    <div style="font-size:14px;color:#a5b4fc;letter-spacing:2px;text-transform:uppercase;font-weight:600;">City Travel Guide</div>
    <div style="color:#f1f5f9;font-size:28px;font-weight:800;margin-top:8px;line-height:1.2;">${esc(city)}</div>
    <div style="color:#c7d2fe;font-size:13px;margin-top:10px;">${esc(date)} · ${_allPlaces.length} places${videos.length > 0 ? ` · ${videos.length} videos` : ""}</div>
  </td></tr>

  <!-- Summary -->
  <tr><td style="padding:24px 20px 0;">
    <div style="background:#1a1a2e;border-radius:12px;padding:18px 20px;border-left:4px solid #6366f1;">
      <div style="color:#e2e8f0;font-size:14px;line-height:1.6;">${esc(summary)}</div>
    </div>
  </td></tr>

  <!-- Sections -->
  <tr><td style="padding:0 20px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${sectionBlocks}
      ${videoSection}
    </table>
  </td></tr>

  <!-- Sources -->
  <tr><td style="padding:0 20px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${sourceSection}
    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:24px 20px;text-align:center;">
    <div style="border-top:1px solid #1e1e3a;padding-top:16px;">
      <div style="color:#4b5563;font-size:11px;">Generated by <span style="color:#6366f1;">Enso City Planner</span></div>
    </div>
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
      description: "Full city overview — discovers top restaurants, photography spots, and tourist landmarks using web research, AI synthesis, and video guides. Results are cached for fast revisits.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          city: { type: "string", description: "City name (e.g. 'Paris', 'Tokyo'). Empty string returns welcome view with recent explorations." },
          force: { type: "boolean", description: "Force fresh research even if cached results exist" },
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
      description: "Email a full city travel guide (all sections, videos, sources) to a recipient. Pulls rich data from the exploration cache — run enso_city_explore first.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          recipient: { type: "string", description: "Email address to send the report to" },
          city: { type: "string", description: "City name (must have been explored already)" },
        },
        required: ["recipient", "city"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        citySendEmail(params as SendEmailParams),
    } as AnyAgentTool,
    {
      name: "enso_city_delete_history",
      label: "City Delete History",
      description: "Delete saved city exploration history. Provide a city name to delete one, or empty string to clear all.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          city: { type: "string", description: "City name to delete (empty string = delete all)" },
        },
        required: ["city"],
      },
      execute: async (_callId: string, params: Record<string, unknown>) =>
        cityDeleteHistory(params as DeleteHistoryParams),
    } as AnyAgentTool,
  ];
}

export function registerCityTools(api: OpenClawPluginApi): void {
  for (const tool of createCityTools()) {
    api.registerTool(tool);
  }
}
