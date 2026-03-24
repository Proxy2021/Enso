/**
 * Convert an external image URL to a proxied URL served by the Enso media proxy.
 * This ensures images load reliably on mobile WebViews that may block cross-origin requests.
 */
export function toProxiedImageUrl(url: string): string {
  if (!url) return url;
  if (!url.startsWith("http://") && !url.startsWith("https://")) return url;
  const encoded = Buffer.from(url, "utf-8").toString("base64url");
  return `/media/proxy/${encoded}`;
}
