/**
 * Card content export utilities.
 * Created by evolution sprint — copy card content as markdown/text, download as PDF/CSV.
 */

/** Copy card text as Markdown to clipboard */
export async function copyAsMarkdown(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/** Copy card text as plain text to clipboard */
export async function copyAsPlainText(text: string): Promise<void> {
  // Strip markdown formatting
  const plain = text
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  await navigator.clipboard.writeText(plain);
}

/** Check if text contains markdown tables */
export function hasMarkdownTables(text: string): boolean {
  return /\|.+\|/.test(text) && /\|[-:]+\|/.test(text);
}

/** Download card content as PDF (simple print-based approach) */
export async function downloadAsPDF(text: string, filename = "export.pdf"): Promise<void> {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<html><head><title>${filename}</title><style>body{font-family:system-ui;padding:2rem;max-width:800px;margin:auto;}</style></head><body><pre style="white-space:pre-wrap;">${text}</pre></body></html>`);
  win.document.close();
  win.print();
}

/** Download card content as CSV (extracts tables from markdown) */
export async function downloadAsCSV(text: string, filename = "export.csv"): Promise<void> {
  // Extract markdown table rows
  const lines = text.split("\n").filter(l => l.trim().startsWith("|"));
  if (lines.length === 0) return;

  const csv = lines
    .filter(l => !/^[\s|:-]+$/.test(l)) // skip separator rows
    .map(l =>
      l.split("|")
        .filter(Boolean)
        .map(cell => `"${cell.trim().replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
