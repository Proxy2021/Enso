/**
 * youtube-tools.ts — YouTube Data API v3 system tools.
 *
 * 6 tools: my_feed, trending, search, channel_videos, liked_videos, subscriptions
 * Uses googleapis npm with OAuth2 for personalized data.
 */

import { google } from "googleapis";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { EnsoAgentTool } from "./local-types.js";
import { getAuthenticatedClient, isAuthorized, isAuthError, REAUTH_MESSAGE, checkTokenHealth, callWithAuthGuard } from "./youtube-auth.js";
import { logAction, logError } from "./action-log.js";
import { dataSourceError, toolExecutionError } from "./errors.js";

// ── Helpers ──

export interface VideoInfo {
  videoId: string;
  title: string;
  channelTitle: string;
  channelId?: string;
  publishedAt: string;
  viewCount?: string;
  likeCount?: string;
  duration?: string;
  thumbnailUrl: string;
  videoUrl: string;
  description?: string;
}

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: `[ERROR] ${message}` }] };
}

function getYouTube() {
  const auth = getAuthenticatedClient();
  if (!auth) throw dataSourceError("youtube", "YouTube not authorized. Configure YouTube Client ID & Secret in Settings, then visit /api/youtube/auth to authorize.");
  return google.youtube({ version: "v3", auth });
}

function getYouTubePublic() {
  // For public endpoints, use API key (falls back to OAuth if available)
  const auth = getAuthenticatedClient();
  if (auth) return google.youtube({ version: "v3", auth });

  const apiKey = process.env.YOUTUBE_API_KEY || process.env.GEMINI_API_KEY;
  if (apiKey) return google.youtube({ version: "v3", auth: apiKey });

  throw dataSourceError("youtube", "No YouTube credentials configured");
}

/** Enrich video IDs with view counts, durations, etc. */
async function enrichVideos(yt: ReturnType<typeof google.youtube>, videoIds: string[]): Promise<Map<string, { viewCount?: string; likeCount?: string; duration?: string; description?: string }>> {
  const map = new Map<string, { viewCount?: string; likeCount?: string; duration?: string; description?: string }>();
  if (videoIds.length === 0) return map;

  // YouTube API allows max 50 IDs per request
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const res = await yt.videos.list({
      part: ["statistics", "contentDetails", "snippet"],
      id: batch,
    });
    for (const item of res.data.items || []) {
      map.set(item.id!, {
        viewCount: item.statistics?.viewCount ?? undefined,
        likeCount: item.statistics?.likeCount ?? undefined,
        duration: item.contentDetails?.duration?.replace("PT", "").toLowerCase(),
        description: item.snippet?.description?.slice(0, 500),
      });
    }
  }
  return map;
}

function formatVideo(item: any, stats?: { viewCount?: string; likeCount?: string; duration?: string; description?: string }): VideoInfo {
  const snippet = item.snippet || {};
  const videoId = item.id?.videoId || item.contentDetails?.videoId || item.id || "";
  return {
    videoId,
    title: snippet.title || "",
    channelTitle: snippet.channelTitle || "",
    channelId: snippet.channelId,
    publishedAt: snippet.publishedAt || "",
    viewCount: stats?.viewCount,
    likeCount: stats?.likeCount,
    duration: stats?.duration,
    thumbnailUrl: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    description: stats?.description || snippet.description?.slice(0, 500),
  };
}

// ── Feed Cache ──

const FEED_DISK_CACHE_PATH = join(homedir(), ".enso", "data", "user-context", "cache", "youtube-feed-cache.json");

interface FeedCacheEntry {
  data: VideoInfo[];
  ts: number;
}
const feedCache = new Map<string, FeedCacheEntry>();
const FEED_CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

function getCachedFeed(key: string): VideoInfo[] | null {
  const entry = feedCache.get(key);
  if (entry && Date.now() - entry.ts < FEED_CACHE_TTL_MS) return entry.data;
  return null;
}

function getDiskFeed(): { videos: VideoInfo[]; savedAt?: string } | null {
  try {
    if (!existsSync(FEED_DISK_CACHE_PATH)) return null;
    const raw = JSON.parse(readFileSync(FEED_DISK_CACHE_PATH, "utf-8"));
    if (!Array.isArray(raw.videos) || raw.videos.length === 0) return null;
    return { videos: raw.videos, savedAt: raw.savedAt };
  } catch {
    return null;
  }
}

function getStaleFeed(key: string): { videos: VideoInfo[]; savedAt?: string } | null {
  const entry = feedCache.get(key);
  if (entry) return { videos: entry.data, savedAt: new Date(entry.ts).toISOString() };
  return getDiskFeed();
}

function setCachedFeed(key: string, data: VideoInfo[]): void {
  feedCache.set(key, { data, ts: Date.now() });
  // Persist to disk for cross-restart resilience
  if (data.length > 0) {
    try {
      mkdirSync(join(homedir(), ".enso", "data", "user-context", "cache"), { recursive: true });
      writeFileSync(FEED_DISK_CACHE_PATH, JSON.stringify({ videos: data, savedAt: new Date().toISOString() }, null, 2));
    } catch { /* non-fatal */ }
  }
}

// Auth notification state is now managed by youtube-auth-state.ts + callWithAuthGuard in youtube-auth.ts

export async function checkYouTubeOnStartup(): Promise<void> {
  if (!isAuthorized()) return;
  try {
    await callWithAuthGuard(async () => {
      const health = await checkTokenHealth();
      if (!health.valid) throw dataSourceError("youtube", health.error || "Token validation failed");
      logAction({ ts: Date.now(), type: "action", category: "youtube", message: "Startup health check: YouTube token valid" });
    });
  } catch {
    // callWithAuthGuard already handled state update + notification
  }
}

// ── Tool Implementations ──

async function myFeed(params: Record<string, unknown>): Promise<VideoInfo[]> {
  const yt = getYouTube();
  const maxResults = Math.min(Number(params.maxResults) || 10, 50);
  const publishedAfter = params.publishedAfter as string | undefined;
  const cacheKey = `${maxResults}:${publishedAfter || ""}`;

  // Return cached result if fresh
  const cached = getCachedFeed(cacheKey);
  if (cached) return cached;

  // Step 1: Get subscriptions
  const subs: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await yt.subscriptions.list({
      part: ["snippet"],
      mine: true,
      maxResults: 50,
      pageToken,
    });
    for (const item of res.data.items || []) {
      const chId = item.snippet?.resourceId?.channelId;
      if (chId) subs.push(chId);
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken && subs.length < 50); // Cap at 50 channels to conserve quota

  if (subs.length === 0) return [];

  // Step 2: Get uploads playlist IDs for each channel (batch)
  const channelBatches: string[][] = [];
  for (let i = 0; i < subs.length; i += 50) channelBatches.push(subs.slice(i, i + 50));

  const uploadPlaylists: string[] = [];
  for (const batch of channelBatches) {
    const res = await yt.channels.list({
      part: ["contentDetails"],
      id: batch,
    });
    for (const ch of res.data.items || []) {
      const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
      if (uploads) uploadPlaylists.push(uploads);
    }
  }

  // Step 3: Get latest videos from each channel's uploads (1-2 per channel)
  const allVideos: any[] = [];
  const videosPerChannel = Math.max(1, Math.ceil(maxResults / uploadPlaylists.length * 2));

  // Fetch in parallel, batches of 10
  for (let i = 0; i < uploadPlaylists.length; i += 10) {
    const batch = uploadPlaylists.slice(i, i + 10);
    const promises = batch.map((pl) =>
      yt.playlistItems.list({
        part: ["snippet", "contentDetails"],
        playlistId: pl,
        maxResults: Math.min(videosPerChannel, 5),
        ...(publishedAfter ? {} : {}), // Can't filter by date here, do it post-fetch
      }).catch(() => null),
    );
    const results = await Promise.all(promises);
    for (const res of results) {
      if (res?.data?.items) {
        for (const item of res.data.items) {
          if (publishedAfter && item.snippet?.publishedAt && item.snippet.publishedAt < publishedAfter) continue;
          allVideos.push(item);
        }
      }
    }
  }

  // Step 4: Sort by date, take top N
  allVideos.sort((a, b) => {
    const da = a.snippet?.publishedAt || "";
    const db = b.snippet?.publishedAt || "";
    return db.localeCompare(da);
  });
  const topVideos = allVideos.slice(0, maxResults);

  // Step 5: Enrich with stats
  const videoIds = topVideos.map((v) => v.contentDetails?.videoId || v.snippet?.resourceId?.videoId || "").filter(Boolean);
  const stats = await enrichVideos(yt, videoIds);

  const result = topVideos.map((v) => {
    const vid = v.contentDetails?.videoId || v.snippet?.resourceId?.videoId || "";
    return formatVideo(v, stats.get(vid));
  });

  setCachedFeed(cacheKey, result);
  return result;
}

async function trending(params: Record<string, unknown>): Promise<VideoInfo[]> {
  const yt = getYouTubePublic();
  const maxResults = Math.min(Number(params.maxResults) || 10, 50);
  const regionCode = (params.regionCode as string) || "US";
  const categoryId = params.categoryId as string | undefined;

  const res = await yt.videos.list({
    part: ["snippet", "statistics", "contentDetails"],
    chart: "mostPopular",
    regionCode,
    maxResults,
    ...(categoryId ? { videoCategoryId: categoryId } : {}),
  });

  return (res.data.items || []).map((item): VideoInfo => ({
    videoId: item.id || "",
    title: item.snippet?.title || "",
    channelTitle: item.snippet?.channelTitle || "",
    channelId: item.snippet?.channelId ?? undefined,
    publishedAt: item.snippet?.publishedAt || "",
    viewCount: item.statistics?.viewCount ?? undefined,
    likeCount: item.statistics?.likeCount ?? undefined,
    duration: item.contentDetails?.duration?.replace("PT", "").toLowerCase(),
    thumbnailUrl: item.snippet?.thumbnails?.high?.url || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
    videoUrl: `https://www.youtube.com/watch?v=${item.id}`,
    description: item.snippet?.description?.slice(0, 200),
  }));
}

export async function search(params: Record<string, unknown>): Promise<VideoInfo[]> {
  const yt = getYouTubePublic();
  const query = String(params.query || "");
  const maxResults = Math.min(Number(params.maxResults) || 10, 50);
  const order = (params.order as string) || "relevance";

  if (!query.trim()) throw toolExecutionError("enso_youtube_search", "Search query is required");

  const res = await yt.search.list({
    part: ["snippet"],
    q: query,
    type: ["video"],
    maxResults,
    order: order as any,
  });

  const items = res.data.items || [];
  const videoIds = items.map((i) => i.id?.videoId).filter(Boolean) as string[];
  const stats = await enrichVideos(yt, videoIds);

  return items.map((item) => {
    const vid = item.id?.videoId || "";
    return formatVideo(item, stats.get(vid));
  });
}

async function channelVideos(params: Record<string, unknown>): Promise<VideoInfo[]> {
  const yt = getYouTubePublic();
  const channelId = String(params.channelId || "");
  const maxResults = Math.min(Number(params.maxResults) || 10, 50);

  if (!channelId.trim()) throw toolExecutionError("enso_youtube_channel_videos", "channelId is required");

  // Get uploads playlist
  const chRes = await yt.channels.list({ part: ["contentDetails"], id: [channelId] });
  const uploads = chRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw dataSourceError("youtube", `No uploads playlist found for channel ${channelId}`);

  const plRes = await yt.playlistItems.list({
    part: ["snippet", "contentDetails"],
    playlistId: uploads,
    maxResults,
  });

  const items = plRes.data.items || [];
  const videoIds = items.map((i) => i.contentDetails?.videoId).filter(Boolean) as string[];
  const stats = await enrichVideos(yt, videoIds);

  return items.map((item) => {
    const vid = item.contentDetails?.videoId || "";
    return formatVideo(item, stats.get(vid));
  });
}

async function likedVideos(params: Record<string, unknown>): Promise<VideoInfo[]> {
  const yt = getYouTube();
  const maxResults = Math.min(Number(params.maxResults) || 10, 50);

  const res = await yt.videos.list({
    part: ["snippet", "statistics", "contentDetails"],
    myRating: "like",
    maxResults,
  });

  return (res.data.items || []).map((item): VideoInfo => ({
    videoId: item.id || "",
    title: item.snippet?.title || "",
    channelTitle: item.snippet?.channelTitle || "",
    channelId: item.snippet?.channelId ?? undefined,
    publishedAt: item.snippet?.publishedAt || "",
    viewCount: item.statistics?.viewCount ?? undefined,
    likeCount: item.statistics?.likeCount ?? undefined,
    duration: item.contentDetails?.duration?.replace("PT", "").toLowerCase(),
    thumbnailUrl: item.snippet?.thumbnails?.high?.url || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
    videoUrl: `https://www.youtube.com/watch?v=${item.id}`,
  }));
}

async function subscriptions(params: Record<string, unknown>): Promise<Array<{ subscriptionId: string; channelId: string; title: string; description: string; thumbnailUrl: string }>> {
  const yt = getYouTube();
  const maxResults = Math.min(Number(params.maxResults) || 20, 50);

  const all: Array<{ subscriptionId: string; channelId: string; title: string; description: string; thumbnailUrl: string }> = [];
  let pageToken: string | undefined;

  do {
    const res = await yt.subscriptions.list({
      part: ["snippet"],
      mine: true,
      maxResults,
      order: "alphabetical",
      pageToken,
    });
    for (const item of res.data.items || []) {
      all.push({
        subscriptionId: item.id || "",
        channelId: item.snippet?.resourceId?.channelId || "",
        title: item.snippet?.title || "",
        description: item.snippet?.description?.slice(0, 200) || "",
        thumbnailUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.default?.url || "",
      });
    }
    // If caller wants all, keep paginating; otherwise stop
    if (Number(params.maxResults) > 50 || params.all) {
      pageToken = res.data.nextPageToken || undefined;
    } else {
      pageToken = undefined;
    }
  } while (pageToken);

  return all;
}

async function unsubscribe(params: Record<string, unknown>): Promise<{ unsubscribed: string[]; errors: string[] }> {
  const yt = getYouTube();
  const channelIds = (params.channelIds as string[] | undefined) || [];
  const subscriptionIds = (params.subscriptionIds as string[] | undefined) || [];

  if (channelIds.length === 0 && subscriptionIds.length === 0) {
    throw toolExecutionError("enso_youtube_unsubscribe", "Provide channelIds or subscriptionIds to unsubscribe from");
  }

  // If channelIds provided, look up their subscription IDs first
  const idsToDelete: Array<{ subId: string; title: string }> = [];

  if (channelIds.length > 0) {
    // Fetch all subscriptions to find matching subscription IDs
    let pageToken: string | undefined;
    let totalScanned = 0;
    do {
      const res = await yt.subscriptions.list({ part: ["snippet"], mine: true, maxResults: 50, pageToken });
      const items = res.data.items || [];
      totalScanned += items.length;
      for (const item of items) {
        const chId = item.snippet?.resourceId?.channelId;
        if (chId && channelIds.includes(chId)) {
          idsToDelete.push({ subId: item.id || "", title: item.snippet?.title || chId });
        }
      }
      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);
    if (idsToDelete.length === 0) {
      logAction({ ts: Date.now(), type: "action", category: "youtube", message: `Unsubscribe: channel(s) ${channelIds.join(",")} not found in ${totalScanned} subscriptions` });
    }
  }

  // Add directly specified subscription IDs
  for (const sid of subscriptionIds) {
    if (!idsToDelete.find((d) => d.subId === sid)) {
      idsToDelete.push({ subId: sid, title: sid });
    }
  }

  const unsubscribed: string[] = [];
  const errors: string[] = [];

  for (const { subId, title } of idsToDelete) {
    try {
      await yt.subscriptions.delete({ id: subId });
      unsubscribed.push(title);
      logAction({ ts: Date.now(), type: "action", category: "youtube", message: `Unsubscribed from: ${title}` });
    } catch (err) {
      errors.push(`${title}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { unsubscribed, errors };
}

// ── Tool Definitions ──

export function createYouTubeTools(): EnsoAgentTool[] {
  return [
    {
      name: "enso_youtube_my_feed",
      label: "My YouTube Feed",
      description: "Get latest videos from your subscribed YouTube channels — personalized feed sorted by newest. Requires YouTube OAuth authorization.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          maxResults: { type: "number", description: "Number of videos to return (default 10, max 50)" },
          publishedAfter: { type: "string", description: "Only include videos published after this ISO date (e.g. 2026-04-01T00:00:00Z)" },
        },
        required: [],
      },
      isPrimary: true,
      execute: async (_callId, params) => {
        const maxResults = Math.min(Number(params.maxResults) || 10, 50);
        const publishedAfter = params.publishedAfter as string | undefined;
        const cacheKey = `${maxResults}:${publishedAfter || ""}`;
        try {
          const videos = await callWithAuthGuard(
            () => myFeed(params),
            () => {
              const stale = getStaleFeed(cacheKey);
              if (stale) return stale.videos;
              return [] as VideoInfo[];
            },
          );
          if (videos.length > 0) {
            logAction({ ts: Date.now(), type: "action", category: "youtube", message: `My feed: ${videos.length} videos` });
          }
          return jsonResult({ tool: "enso_youtube_my_feed", count: videos.length, videos });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const isQuota = msg.includes("quota");
          if (isQuota) {
            const stale = getStaleFeed(cacheKey);
            if (stale) {
              logAction({ ts: Date.now(), type: "action", category: "youtube", message: `My feed (stale cache, quota exceeded): ${stale.videos.length} videos` });
              return jsonResult({ tool: "enso_youtube_my_feed", count: stale.videos.length, videos: stale.videos, stale: true, cachedAt: stale.savedAt, warning: "YouTube API quota exceeded — showing cached results." });
            }
            return errorResult("YouTube API quota exceeded for today. Feed will be available again after midnight Pacific time.");
          }
          logError("youtube", "my_feed failed", err);
          return errorResult(msg);
        }
      },
    } as EnsoAgentTool,

    {
      name: "enso_youtube_trending",
      label: "YouTube Trending",
      description: "Get trending/popular YouTube videos by region. No OAuth required.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          maxResults: { type: "number", description: "Number of videos (default 10, max 50)" },
          regionCode: { type: "string", description: "ISO 3166-1 alpha-2 country code (default: US). Examples: US, GB, JP, CN, HK" },
          categoryId: { type: "string", description: "YouTube video category ID (e.g. 10=Music, 20=Gaming, 28=Science)" },
        },
        required: [],
      },
      execute: async (_callId, params) => {
        try {
          const videos = await callWithAuthGuard(() => trending(params));
          logAction({ ts: Date.now(), type: "action", category: "youtube", message: `Trending: ${videos.length} videos (${params.regionCode || "US"})` });
          return jsonResult({ tool: "enso_youtube_trending", count: videos.length, videos });
        } catch (err) {
          if (isAuthError(err)) return errorResult(REAUTH_MESSAGE);
          logError("youtube", "trending failed", err);
          return errorResult(err instanceof Error ? err.message : String(err));
        }
      },
    } as EnsoAgentTool,

    {
      name: "enso_youtube_search",
      label: "YouTube Search",
      description: "Search YouTube videos by query. Returns video details with view counts, durations, and thumbnails.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string", description: "Search query" },
          maxResults: { type: "number", description: "Number of results (default 10, max 50)" },
          order: { type: "string", description: "Sort order: relevance (default), date, viewCount, rating" },
        },
        required: ["query"],
      },
      execute: async (_callId, params) => {
        try {
          const videos = await callWithAuthGuard(() => search(params));
          logAction({ ts: Date.now(), type: "action", category: "youtube", message: `Search "${params.query}": ${videos.length} results` });
          return jsonResult({ tool: "enso_youtube_search", query: params.query, count: videos.length, videos });
        } catch (err) {
          if (isAuthError(err)) return errorResult(REAUTH_MESSAGE);
          logError("youtube", "search failed", err);
          return errorResult(err instanceof Error ? err.message : String(err));
        }
      },
    } as EnsoAgentTool,

    {
      name: "enso_youtube_channel_videos",
      label: "Channel Videos",
      description: "Get recent videos from a specific YouTube channel.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          channelId: { type: "string", description: "YouTube channel ID (e.g. UC...)" },
          maxResults: { type: "number", description: "Number of videos (default 10, max 50)" },
        },
        required: ["channelId"],
      },
      execute: async (_callId, params) => {
        try {
          const videos = await callWithAuthGuard(() => channelVideos(params));
          logAction({ ts: Date.now(), type: "action", category: "youtube", message: `Channel ${params.channelId}: ${videos.length} videos` });
          return jsonResult({ tool: "enso_youtube_channel_videos", channelId: params.channelId, count: videos.length, videos });
        } catch (err) {
          if (isAuthError(err)) return errorResult(REAUTH_MESSAGE);
          logError("youtube", "channel_videos failed", err);
          return errorResult(err instanceof Error ? err.message : String(err));
        }
      },
    } as EnsoAgentTool,

    {
      name: "enso_youtube_channel_stats",
      label: "Channel Stats",
      description: "Get subscriber count and video count for a batch of YouTube channel IDs. Returns a map of channelId → { subscriberCount, videoCount }.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          channelIds: {
            type: "array",
            items: { type: "string" },
            description: "Array of YouTube channel IDs to look up stats for",
          },
        },
        required: ["channelIds"],
      },
      execute: async (_callId, params) => {
        try {
          const stats = await callWithAuthGuard(async () => {
            const yt = getYouTubePublic();
            const ids = (params.channelIds as string[]) || [];
            const result: Record<string, { subscriberCount: number; videoCount: number }> = {};
            for (let i = 0; i < ids.length; i += 50) {
              const batch = ids.slice(i, i + 50);
              const res = await yt.channels.list({ part: ["statistics"], id: batch });
              for (const ch of res.data.items || []) {
                result[ch.id!] = {
                  subscriberCount: parseInt(ch.statistics?.subscriberCount || "0"),
                  videoCount: parseInt(ch.statistics?.videoCount || "0"),
                };
              }
            }
            return result;
          });
          logAction({ ts: Date.now(), type: "action", category: "youtube", message: `Channel stats: ${Object.keys(stats).length} channels` });
          return jsonResult({ tool: "enso_youtube_channel_stats", count: Object.keys(stats).length, stats });
        } catch (err) {
          if (isAuthError(err)) return errorResult(REAUTH_MESSAGE);
          logError("youtube", "channel_stats failed", err);
          return errorResult(err instanceof Error ? err.message : String(err));
        }
      },
    } as EnsoAgentTool,

    {
      name: "enso_youtube_liked_videos",
      label: "My Liked Videos",
      description: "Get your liked YouTube videos. Requires YouTube OAuth authorization.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          maxResults: { type: "number", description: "Number of videos (default 10, max 50)" },
        },
        required: [],
      },
      execute: async (_callId, params) => {
        try {
          const videos = await callWithAuthGuard(() => likedVideos(params));
          logAction({ ts: Date.now(), type: "action", category: "youtube", message: `Liked videos: ${videos.length}` });
          return jsonResult({ tool: "enso_youtube_liked_videos", count: videos.length, videos });
        } catch (err) {
          if (isAuthError(err)) return errorResult(REAUTH_MESSAGE);
          logError("youtube", "liked_videos failed", err);
          return errorResult(err instanceof Error ? err.message : String(err));
        }
      },
    } as EnsoAgentTool,

    {
      name: "enso_youtube_subscriptions",
      label: "My Subscriptions",
      description: "List your YouTube channel subscriptions. Requires YouTube OAuth authorization.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          maxResults: { type: "number", description: "Number of channels (default 20, max 50)" },
        },
        required: [],
      },
      execute: async (_callId, params) => {
        try {
          const channels = await callWithAuthGuard(() => subscriptions(params));
          logAction({ ts: Date.now(), type: "action", category: "youtube", message: `Subscriptions: ${channels.length} channels` });
          return jsonResult({ tool: "enso_youtube_subscriptions", count: channels.length, channels });
        } catch (err) {
          if (isAuthError(err)) return errorResult(REAUTH_MESSAGE);
          logError("youtube", "subscriptions failed", err);
          return errorResult(err instanceof Error ? err.message : String(err));
        }
      },
    } as EnsoAgentTool,

    {
      name: "enso_youtube_unsubscribe",
      label: "Unsubscribe",
      description: "Unsubscribe from YouTube channels. Provide channel IDs or subscription IDs. Requires YouTube OAuth with write access.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          channelIds: {
            type: "array",
            items: { type: "string" },
            description: "YouTube channel IDs to unsubscribe from (e.g. ['UCxxxxxx', 'UCyyyyyy'])",
          },
          subscriptionIds: {
            type: "array",
            items: { type: "string" },
            description: "Subscription IDs to delete (from enso_youtube_subscriptions results)",
          },
        },
        required: [],
      },
      execute: async (_callId, params) => {
        try {
          const result = await callWithAuthGuard(() => unsubscribe(params));
          logAction({ ts: Date.now(), type: "action", category: "youtube", message: `Unsubscribed from ${result.unsubscribed.length} channels` });
          return jsonResult({ tool: "enso_youtube_unsubscribe", ...result });
        } catch (err) {
          if (isAuthError(err)) return errorResult(REAUTH_MESSAGE);
          logError("youtube", "unsubscribe failed", err);
          return errorResult(err instanceof Error ? err.message : String(err));
        }
      },
    } as EnsoAgentTool,
  ];
}
