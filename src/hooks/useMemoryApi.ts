import { useState, useCallback } from "react";
import { getBackendBaseUrl, authHeaders } from "../lib/connection";
import { API, TIMINGS } from "../lib/constants";
import { isNative } from "../lib/platform";
import { useChatStore } from "../store/chat";

export interface MemoryApiData {
  user: string | null;
  memory: string | null;
}

export function useMemoryApi() {
  const [memory, setMemory] = useState<MemoryApiData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const historyCount = useChatStore((s) => s.cardOrder.length);

  const fetchMemory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getBackendBaseUrl()}${API.MEMORY}`, {
        headers: authHeaders(),
        signal: AbortSignal.timeout(TIMINGS.API_FETCH_TIMEOUT),
      });
      if (res.ok) {
        const json = (await res.json()) as MemoryApiData;
        setMemory(json);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  const saveMemory = useCallback(async (field: "user" | "memory", text: string): Promise<boolean> => {
    setSaving(true);
    try {
      await fetch(`${getBackendBaseUrl()}${API.MEMORY}`, {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ [field]: text }),
      });
      setMemory((prev) => (prev ? { ...prev, [field]: text || null } : prev));
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const clearHistory = useCallback(async (): Promise<boolean> => {
    setClearing(true);
    try {
      const storage = isNative ? localStorage : sessionStorage;
      const clientId = storage.getItem("enso-clientId");
      if (clientId) {
        await fetch(`${getBackendBaseUrl()}${API.HISTORY}?clientId=${encodeURIComponent(clientId)}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
      }
      useChatStore.setState({ cardOrder: [], cards: {} });
      return true;
    } catch {
      return false;
    } finally {
      setClearing(false);
    }
  }, []);

  return {
    memory,
    setMemory,
    historyCount,
    loading,
    saving,
    clearing,
    fetchMemory,
    saveMemory,
    clearHistory,
  };
}
