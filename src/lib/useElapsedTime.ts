import { useState, useEffect, useRef } from "react";

/**
 * Hook that counts elapsed seconds from mount time (or a provided start time).
 * Updates once per second. Returns elapsed seconds as an integer.
 */
export function useElapsedTime(startTime?: number): number {
  const mountTime = useRef(startTime ?? Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t0 = mountTime.current;
    const tick = () => setElapsed(Math.floor((Date.now() - t0) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return elapsed;
}

/** Format seconds into a human-readable string: "5s", "1:23", "12:05" */
export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Estimate typical duration (in seconds) for an operation based on its label.
 * Returns undefined for indeterminate operations (no meaningful estimate).
 */
export function estimateDuration(label?: string): number | undefined {
  if (!label) return undefined;
  const l = label.toLowerCase();

  // Research phases
  if (l.includes("research")) return 35;
  if (l.includes("deep") && l.includes("div")) return 180;

  // Enhance / app rendering
  if (l.includes("enhancing")) return 8;
  if (l.includes("generating ui") || l.includes("generating_ui")) return 10;

  // Build
  if (l.includes("build")) return 120;

  // Refine
  if (l.includes("refin")) return 12;

  // Card actions (fast)
  if (l.includes("processing action")) return 5;

  // Claude Code — indeterminate (user-driven, unpredictable)
  if (l.includes("claude code") || l.includes("agent:")) return undefined;

  return undefined;
}
