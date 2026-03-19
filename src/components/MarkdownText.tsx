import { useMemo, useEffect, useRef, useState } from "react";

interface MarkdownTextProps {
  text: string;
}

/**
 * Lightweight inline markdown renderer.
 * Handles: headers, bold, italic, inline code, code blocks (with Mermaid diagram rendering),
 * bullet/numbered lists, links, and markdown tables.
 */
export default function MarkdownText({ text }: MarkdownTextProps) {
  const elements = useMemo(() => parseMarkdown(text), [text]);
  return <>{elements}</>;
}

/** Detects if a table has numeric data suitable for charting */
function isNumericTable(headers: string[], rows: string[][]): boolean {
  if (rows.length < 2 || headers.length < 2) return false;
  // Check if at least one non-first column has mostly numeric values
  let numericCols = 0;
  for (let col = 1; col < headers.length; col++) {
    let numCount = 0;
    for (const row of rows) {
      const val = (row[col] || "").replace(/[$€£¥%,\s]/g, "").trim();
      if (val && !isNaN(Number(val))) numCount++;
    }
    if (numCount >= rows.length * 0.6) numericCols++;
  }
  return numericCols >= 1;
}

/** Extracts numeric value from a cell string (strips currency, %, commas) */
function extractNumber(val: string): number {
  const cleaned = val.replace(/[$€£¥%,\s]/g, "").trim();
  const num = Number(cleaned);
  return isNaN(num) ? 0 : num;
}

/** Simple inline bar chart for numeric tables */
function InlineBarChart({ headers, rows }: { headers: string[]; rows: string[][] }) {
  // Find numeric columns (skip first column which is labels)
  const numericColIndices: number[] = [];
  for (let col = 1; col < headers.length; col++) {
    let numCount = 0;
    for (const row of rows) {
      const val = (row[col] || "").replace(/[$€£¥%,\s]/g, "").trim();
      if (val && !isNaN(Number(val))) numCount++;
    }
    if (numCount >= rows.length * 0.6) numericColIndices.push(col);
  }

  // Use first numeric column for chart
  const chartCol = numericColIndices[0] ?? 1;
  const values = rows.map((row) => extractNumber(row[chartCol] || "0"));
  const maxVal = Math.max(...values, 1);
  const colors = ["#6366f1", "#8b5cf6", "#a78bfa", "#818cf8", "#7c3aed", "#6d28d9", "#5b21b6", "#4f46e5"];

  return (
    <div className="my-1.5 p-3 rounded-md border border-gray-700/50 bg-gray-900/30">
      <div className="text-xs text-gray-400 mb-2 font-medium">{headers[chartCol]}</div>
      <div className="space-y-1.5">
        {rows.map((row, i) => {
          const pct = (values[i] / maxVal) * 100;
          return (
            <div key={i} className="flex items-center gap-2">
              <div className="text-xs text-gray-400 w-24 truncate text-right">{row[0]}</div>
              <div className="flex-1 h-5 bg-gray-800/50 rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-300"
                  style={{ width: `${pct}%`, backgroundColor: colors[i % colors.length] }}
                />
              </div>
              <div className="text-xs text-gray-300 w-16 text-right">{row[chartCol]}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Table with optional chart toggle for numeric data */
function ChartableTable({ headers, rows, idx }: { headers: string[]; rows: string[][]; idx: number }) {
  const [showChart, setShowChart] = useState(false);
  const hasNumeric = useMemo(() => isNumericTable(headers, rows), [headers, rows]);

  return (
    <div key={idx}>
      {hasNumeric && (
        <div className="flex justify-end mb-1">
          <button
            onClick={() => setShowChart(!showChart)}
            className="text-[10px] px-2 py-0.5 rounded border border-gray-700/50 bg-gray-800/50 text-gray-400 hover:text-gray-200 hover:border-indigo-500/40 transition-colors"
          >
            {showChart ? "View as Table" : "View as Chart"}
          </button>
        </div>
      )}
      {showChart ? (
        <InlineBarChart headers={headers} rows={rows} />
      ) : (
        <div className="my-1.5 overflow-x-auto rounded-md border border-gray-700/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800/80">
                {headers.map((h, hi) => (
                  <th key={hi} className="px-3 py-1.5 text-left font-semibold text-gray-200 border-b border-gray-700/50">
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? "bg-gray-900/30" : "bg-gray-900/60"}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-1.5 text-gray-300 border-b border-gray-700/30">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Renders Mermaid diagram code as an inline SVG with dark theme */
let mermaidLoadPromise: Promise<any> | null = null;
function loadMermaid(): Promise<any> {
  if (mermaidLoadPromise) return mermaidLoadPromise;
  mermaidLoadPromise = new Promise((resolve, reject) => {
    if ((window as any).mermaid) {
      resolve((window as any).mermaid);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";
    script.onload = () => {
      const m = (window as any).mermaid;
      m.initialize({ startOnLoad: false, theme: "dark", themeVariables: { primaryColor: "#6366f1", primaryTextColor: "#e5e7eb", lineColor: "#9ca3af", secondaryColor: "#1f2937", tertiaryColor: "#111827" } });
      resolve(m);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return mermaidLoadPromise;
}

let mermaidIdCounter = 0;
function MermaidDiagram({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svgHtml, setSvgHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadMermaid()
      .then(async (m) => {
        if (cancelled) return;
        const id = `mermaid-${++mermaidIdCounter}`;
        try {
          const { svg } = await m.render(id, code);
          if (!cancelled) setSvgHtml(svg);
        } catch (e: any) {
          if (!cancelled) setError(e?.message || "Diagram render failed");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load Mermaid library");
      });
    return () => { cancelled = true; };
  }, [code]);

  if (error) {
    return (
      <pre className="bg-gray-900 rounded-md px-3 py-2 my-1.5 text-xs overflow-x-auto text-gray-300 border border-gray-700/50">
        <code>{code}</code>
      </pre>
    );
  }

  if (!svgHtml) {
    return (
      <div className="bg-gray-900/50 rounded-md px-3 py-4 my-1.5 flex items-center justify-center border border-gray-700/50">
        <span className="text-xs text-gray-400 animate-pulse">Rendering diagram...</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="bg-gray-900/30 rounded-md px-3 py-3 my-1.5 overflow-x-auto border border-gray-700/50"
      dangerouslySetInnerHTML={{ __html: svgHtml }}
    />
  );
}

type BlockNode =
  | { type: "heading"; level: number; content: string }
  | { type: "code-block"; lang: string; content: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "blockquote"; content: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "paragraph"; content: string };

function parseMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const blocks: BlockNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.trimStart().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: "code-block", lang, content: codeLines.join("\n") });
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        content: headingMatch[2],
      });
      i++;
      continue;
    }

    // Blockquote
    const bqMatch = line.match(/^>\s?(.*)/);
    if (bqMatch) {
      const bqLines: string[] = [bqMatch[1]];
      i++;
      while (i < lines.length && lines[i].match(/^>\s?(.*)/)) {
        bqLines.push(lines[i].match(/^>\s?(.*)/)![1]);
        i++;
      }
      blocks.push({ type: "blockquote", content: bqLines.join("\n") });
      continue;
    }

    // List items (collect consecutive)
    const bulletMatch = line.match(/^\s*[-*•]\s+(.*)/);
    const numberedMatch = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (bulletMatch || numberedMatch) {
      const ordered = Boolean(numberedMatch);
      const items: string[] = [];
      while (i < lines.length) {
        const bm = lines[i].match(/^\s*[-*•]\s+(.*)/);
        const nm = lines[i].match(/^\s*\d+[.)]\s+(.*)/);
        const m = ordered ? nm : bm;
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    // Markdown table (| col1 | col2 |)
    if (line.includes("|") && line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      if (tableLines.length >= 2) {
        const parseRow = (row: string) =>
          row.split("|").map((c) => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length);
        const headers = parseRow(tableLines[0]);
        // Skip separator row (|---|---|)
        const startRow = tableLines[1].replace(/[|\s-:]/g, "").length === 0 ? 2 : 1;
        const rows = tableLines.slice(startRow).map(parseRow);
        blocks.push({ type: "table", headers, rows });
        continue;
      }
    }

    // Empty line — skip
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-special lines
    const paraLines: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) break;
      if (l.trimStart().startsWith("```")) break;
      if (l.match(/^#{1,4}\s+/)) break;
      if (l.match(/^\s*[-*•]\s+/) || l.match(/^\s*\d+[.)]\s+/)) break;
      paraLines.push(l);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", content: paraLines.join("\n") });
    }
  }

  return blocks.map((block, idx) => {
    switch (block.type) {
      case "heading": {
        const sizes = [
          "text-lg font-bold mt-3 mb-1",
          "text-base font-semibold mt-2 mb-1",
          "text-sm font-semibold mt-2 mb-0.5",
          "text-sm font-medium mt-1",
        ];
        return (
          <div key={idx} className={sizes[block.level - 1] ?? sizes[3]}>
            {renderInline(block.content)}
          </div>
        );
      }
      case "code-block":
        if (block.lang.toLowerCase() === "mermaid") {
          return <MermaidDiagram key={idx} code={block.content} />;
        }
        return (
          <pre
            key={idx}
            className="bg-gray-900 rounded-md px-3 py-2 my-1.5 text-xs overflow-x-auto text-gray-300 border border-gray-700/50"
          >
            <code>{block.content}</code>
          </pre>
        );
      case "blockquote":
        return (
          <div
            key={idx}
            className="border-l-2 border-indigo-500/60 pl-3 my-1.5 text-sm text-gray-300"
          >
            {renderInline(block.content)}
          </div>
        );
      case "list": {
        const Tag = block.ordered ? "ol" : "ul";
        return (
          <Tag
            key={idx}
            className={`my-1 ml-4 space-y-0.5 ${
              block.ordered ? "list-decimal" : "list-disc"
            }`}
          >
            {block.items.map((item, j) => (
              <li key={j} className="text-sm">
                {renderInline(item)}
              </li>
            ))}
          </Tag>
        );
      }
      case "table":
        return <ChartableTable key={idx} headers={block.headers} rows={block.rows} idx={idx} />;
      case "paragraph":
        return (
          <p key={idx} className="whitespace-pre-wrap my-1">
            {renderInline(block.content)}
          </p>
        );
    }
  });
}

/** Render inline markdown: **bold**, *italic*, `code`, [links](url) */
function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Regex for: **bold**, *italic*, `code`, [text](url)
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = re.exec(text)) !== null) {
    // Push text before the match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      // **bold**
      parts.push(
        <strong key={key++} className="font-semibold">
          {match[2]}
        </strong>,
      );
    } else if (match[3]) {
      // *italic*
      parts.push(
        <em key={key++} className="italic">
          {match[3]}
        </em>,
      );
    } else if (match[4]) {
      // `code`
      parts.push(
        <code
          key={key++}
          className="bg-gray-700/50 px-1 py-0.5 rounded text-xs font-mono"
        >
          {match[4]}
        </code>,
      );
    } else if (match[5] && match[6]) {
      // [text](url)
      parts.push(
        <a
          key={key++}
          href={match[6]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-400 hover:underline"
        >
          {match[5]}
        </a>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Push remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}
