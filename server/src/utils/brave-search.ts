/**
 * Shared Brave Search API helper.
 * Centralizes URL construction, headers, timeout, and error handling.
 */

import { BRAVE_WEB_SEARCH, BRAVE_IMAGE_SEARCH, BRAVE_VIDEO_SEARCH, BRAVE_SEARCH_TIMEOUT_MS } from "../config.js";

export type BraveSearchType = "web" | "images" | "videos";

const ENDPOINT_MAP: Record<BraveSearchType, string> = {
  web: BRAVE_WEB_SEARCH,
  images: BRAVE_IMAGE_SEARCH,
  videos: BRAVE_VIDEO_SEARCH,
};

export interface BraveSearchOptions {
  query: string;
  type?: BraveSearchType;
  count?: number;
  maxCount?: number;
  country?: string;
  timeoutMs?: number;
}

export async function braveSearchFetch<T = unknown>(
  apiKey: string,
  options: BraveSearchOptions,
): Promise<T | null> {
  const {
    query,
    type = "web",
    count = 6,
    maxCount = 10,
    country,
    timeoutMs = BRAVE_SEARCH_TIMEOUT_MS,
  } = options;

  const url = new URL(ENDPOINT_MAP[type]);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(Math.max(count, 1), maxCount)));
  if (country) url.searchParams.set("country", country);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const resp = await globalThis.fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": apiKey,
      },
      signal: ac.signal,
    });
    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
