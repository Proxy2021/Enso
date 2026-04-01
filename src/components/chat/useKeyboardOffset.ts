import { useState, useEffect } from "react";

/**
 * Tracks visual viewport offset on mobile when the software keyboard opens.
 * Adjusts the input container so it stays above the keyboard instead of
 * being hidden behind it. Falls back gracefully when API is unavailable.
 */
export function useKeyboardOffset() {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let rafId = 0;
    const update = () => {
      if (rafId) return; // already scheduled
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const diff = window.innerHeight - vv.height - vv.offsetTop;
        setOffset(Math.max(0, diff));
      });
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(rafId);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return offset;
}
