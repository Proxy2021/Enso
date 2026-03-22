/**
 * Text truncation utility.
 * Replaces dozens of `.slice(0, N)` calls across the codebase.
 */

export function truncate(
  text: string | undefined | null,
  maxLen: number,
  suffix = "...",
): string {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - suffix.length) + suffix;
}

export function truncateNoSuffix(
  text: string | undefined | null,
  maxLen: number,
): string {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen);
}
