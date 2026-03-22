import { useState, useCallback, useMemo, useRef } from "react";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";

/**
 * Fetch text files under `{basePath}/{id}/file/{filename}` with an in-memory cache.
 * `basePath` is typically `API.DISCOVERY_RESULTS` or `API.EVOLUTION_SPRINTS`.
 */
export function useFetchFile(basePath: string) {
  const [fileCache, setFileCache] = useState<Record<string, string>>({});
  const cacheRef = useRef<Record<string, string>>({});
  const baseUrl = getBackendBaseUrl();
  const headers = useMemo(() => authHeaders(), []);

  const root = basePath.replace(/\/$/, "");

  const fetchFile = useCallback(
    async (id: string, filename: string): Promise<string | null> => {
      const key = `${id}/${filename}`;
      const hit = cacheRef.current[key];
      if (hit !== undefined) return hit;
      try {
        const res = await fetch(`${baseUrl}${root}/${id}/file/${filename}`, { headers });
        if (!res.ok) return null;
        const text = await res.text();
        cacheRef.current = { ...cacheRef.current, [key]: text };
        setFileCache((prev) => ({ ...prev, [key]: text }));
        return text;
      } catch {
        return null;
      }
    },
    [baseUrl, root, headers],
  );

  return { fetchFile, fileCache };
}
