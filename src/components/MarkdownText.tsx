import { useMemo, useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";

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
        <div className="my-1.5 overflow-x-auto max-w-full rounded-md border border-gray-700/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800/80">
                {headers.map((h, hi) => (
                  <th key={hi} className="px-2 sm:px-3 py-1.5 text-left font-semibold text-gray-200 border-b border-gray-700/50 break-words">
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? "bg-gray-900/30" : "bg-gray-900/60"}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-2 sm:px-3 py-1.5 text-gray-300 border-b border-gray-700/30 break-words">
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

/** Pre-process AI-generated Mermaid code to strip features that crash the parser */
function sanitizeMermaidCode(code: string): string {
  let clean = code;
  // 1. Strip %%{init:...}%% directives (CSS themes, config overrides) — multiline-safe
  clean = clean.replace(/%%\{init:[\s\S]*?\}%%/g, "");
  // 2. Replace HTML <br/> tags with Mermaid newline escape
  clean = clean.replace(/<br\s*\/?>/gi, "\\n");
  // 3. Strip remaining HTML tags from labels
  clean = clean.replace(/<\/?[a-z][^>]*>/gi, "");
  // 4. Strip CSS `style` directives (e.g., "style nodeA fill:#f9f,stroke:#333")
  clean = clean.replace(/^\s*style\s+\S+\s+.+$/gm, "");
  // 5. Strip `classDef` directives (e.g., "classDef error fill:#f99")
  clean = clean.replace(/^\s*classDef\s+.+$/gm, "");
  // 6. Strip `class` assignments (e.g., "class nodeA,nodeB error")
  clean = clean.replace(/^\s*class\s+\S+[\s,]+\S+\s*$/gm, "");
  // 7. Strip `linkStyle` directives (e.g., "linkStyle 0 stroke:#ff3")
  clean = clean.replace(/^\s*linkStyle\s+.+$/gm, "");
  // 8. Strip `click` event handlers (e.g., "click nodeA callback")
  clean = clean.replace(/^\s*click\s+\S+\s+.+$/gm, "");
  // 8.5. Strip inline CSS class application (e.g., "A:::errorClass")
  clean = clean.replace(/:::\w+/g, "");
  // 9. Remove 'direction' keyword inside subgraphs (mermaid 11.x doesn't support this)
  clean = clean.replace(
    /(subgraph\s[^\n]*\n)([\s\S]*?)(end\b)/g,
    (match, open, body, close) => {
      const cleanBody = body.replace(/^\s*direction\s+(TB|BT|LR|RL)\s*$/gm, "");
      return open + cleanBody + close;
    }
  );
  // 10. Trim trailing whitespace per line, trim overall
  clean = clean.split("\n").map(l => l.trimEnd()).join("\n").trim();
  return clean;
}

/** Attempt to auto-repair common LLM Mermaid syntax mistakes */
function autoRepairMermaid(code: string): string {
  let fixed = code;
  // Fix 1: Remove unsupported "end" labels (e.g., "end SubgraphName" → "end")
  fixed = fixed.replace(/^(\s*end)\s+\S.*$/gm, "$1");
  // Fix 2: Remove empty node IDs (e.g., " --> " with no source)
  fixed = fixed.replace(/^\s*-->\s/gm, "");
  // Fix 3: Fix unterminated strings in labels — strip unclosed quotes
  fixed = fixed.replace(/\["([^\]"]*?)$/gm, '["$1"]');
  // Fix 4: Remove duplicate graph/flowchart declarations
  const lines = fixed.split("\n");
  let foundDecl = false;
  fixed = lines.filter(line => {
    if (/^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap|timeline|quadrantChart|block-beta)\b/.test(line)) {
      if (foundDecl) return false;
      foundDecl = true;
    }
    return true;
  }).join("\n");
  // Fix 5: Normalize Gantt dateFormat — ensure it exists for gantt charts
  if (/^\s*gantt\b/m.test(fixed) && !/dateFormat/m.test(fixed)) {
    fixed = fixed.replace(/^(\s*gantt\b.*)$/m, "$1\n    dateFormat YYYY-MM-DD");
  }
  // Fix 6: Case-insensitive diagram type normalization
  fixed = fixed.replace(/^(\s*)(flowChart)(\s)/m, "$1flowchart$3");
  fixed = fixed.replace(/^(\s*)(sequencediagram)(\s)/mi, "$1sequenceDiagram$3");
  fixed = fixed.replace(/^(\s*)(classdiagram)(\s)/mi, "$1classDiagram$3");
  fixed = fixed.replace(/^(\s*)(statediagram-v2)(\s)/mi, "$1stateDiagram-v2$3");
  fixed = fixed.replace(/^(\s*)(erdiagram)(\s)/mi, "$1erDiagram$3");

  // Fix 7: Mind map repairs — strip special characters from labels, fix indentation
  if (/^\s*mindmap\b/m.test(fixed)) {
    fixed = fixed.split("\n").map(line => {
      // Strip characters that break mindmap parser: (), [], {}, <>, `, #, @
      if (!/^\s*mindmap\b/.test(line) && line.trim().length > 0) {
        // Preserve indentation, clean label text
        const indent = line.match(/^(\s*)/)?.[1] ?? "";
        let label = line.trim();
        // Remove wrapping delimiters that confuse mindmap: ((text)), [text], {text}
        label = label.replace(/^\(\((.+?)\)\)$/, "$1");
        label = label.replace(/^\[(.+?)\]$/, "$1");
        label = label.replace(/^\{(.+?)\}$/, "$1");
        // Strip remaining special chars that crash parser
        label = label.replace(/[`#@<>{}[\]()]/g, "");
        // Collapse multiple spaces
        label = label.replace(/\s{2,}/g, " ").trim();
        return label ? indent + label : "";
      }
      return line;
    }).filter(l => l.trim().length > 0 || /^\s*mindmap\b/.test(l)).join("\n");
  }

  // Fix 8: Timeline repairs — ensure title exists
  if (/^\s*timeline\b/m.test(fixed) && !/^\s*title\b/m.test(fixed)) {
    fixed = fixed.replace(/^(\s*timeline\b.*)$/m, "$1\n    title Timeline");
  }

  // Fix 9: Pie chart repairs — validate label:value pairs, strip style lines
  if (/^\s*pie\b/m.test(fixed)) {
    fixed = fixed.split("\n").map(line => {
      // Fix pie data lines: ensure "Label" : value format
      const pieDataMatch = line.match(/^\s*"([^"]+)"\s*:\s*(\d+(?:\.\d+)?)/);
      if (pieDataMatch) return `    "${pieDataMatch[1]}" : ${pieDataMatch[2]}`;
      return line;
    }).join("\n");
  }

  return fixed;
}

export { sanitizeMermaidCode, autoRepairMermaid };

/** Extract a human-readable outline from Mermaid diagram source code */
function extractMermaidOutline(code: string): { title: string; items: string[] } {
  const lines = code.split("\n").map(l => l.trim()).filter(Boolean);
  const typeMatch = lines[0]?.match(/^\s*(flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap|timeline|quadrantChart)/);
  const diagramType = typeMatch?.[1] ?? "Diagram";
  const titleLine = lines.find(l => /^\s*title\s+/i.test(l)) ?? lines.find(l => /^\s*pie\s+title\s+/i.test(l));
  const title = titleLine
    ? titleLine.replace(/^\s*(?:pie\s+)?title\s+/i, "").trim()
    : `${diagramType.charAt(0).toUpperCase() + diagramType.slice(1)} Overview`;

  const items: string[] = [];
  for (const line of lines) {
    // Extract node labels: A["Label"], A[Label], A(Label), A{Label}
    const nodeMatch = line.match(/\w+\s*[\[("{\(]+"?([^"\]\)}>]+)"?\s*[\]"\)}>]/);
    if (nodeMatch && nodeMatch[1]?.trim()) {
      const label = nodeMatch[1].trim();
      if (label.length > 2 && label.length < 80 && !items.includes(label)) {
        items.push(label);
      }
    }
    // Extract subgraph labels: subgraph "Label" or subgraph Label
    const subMatch = line.match(/^\s*subgraph\s+"?([^"\n]+)"?\s*$/);
    if (subMatch && subMatch[1]?.trim()) {
      items.push(`[${subMatch[1].trim()}]`);
    }
    // Extract Gantt task labels
    const ganttMatch = line.match(/^\s*([^:]+?)\s*:[^,]*,/);
    if (ganttMatch && diagramType === "gantt" && ganttMatch[1]?.trim().length > 2) {
      const label = ganttMatch[1].trim();
      if (!label.startsWith("section") && !items.includes(label)) {
        items.push(label);
      }
    }
    // Extract section headers for Gantt
    const sectionMatch = line.match(/^\s*section\s+(.+)$/);
    if (sectionMatch) {
      items.push(`**${sectionMatch[1].trim()}**`);
    }
    // Extract timeline events
    if (diagramType === "timeline" && !line.startsWith("timeline") && !line.startsWith("title")) {
      const timelineLabel = line.replace(/^\s*/, "").trim();
      if (timelineLabel.length > 2) items.push(timelineLabel);
    }
    // Extract pie labels
    const pieMatch = line.match(/^\s*"([^"]+)"\s*:/);
    if (pieMatch && diagramType === "pie") {
      items.push(pieMatch[1].trim());
    }
  }
  return { title, items: items.slice(0, 20) };
}

/** Count nodes and edges in a Mermaid diagram to assess render complexity */
function checkMermaidComplexity(code: string): { nodes: number; edges: number; subgraphs: number; overBudget: boolean } {
  const lines = code.split("\n");
  let nodes = 0, edges = 0, subgraphs = 0;
  const seenIds = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^subgraph\b/.test(trimmed)) { subgraphs++; continue; }
    if (/-->|==>|-\.->|---/.test(trimmed)) edges++;
    const nodeMatch = trimmed.match(/^(\w+)\s*[\[("{\(]/);
    if (nodeMatch && !seenIds.has(nodeMatch[1])) {
      seenIds.add(nodeMatch[1]);
      nodes++;
    }
    const edgeNodes = trimmed.match(/(\w+)\s*(?:-->|==>|-\.->)/g);
    if (edgeNodes) {
      for (const m of edgeNodes) {
        const id = m.replace(/\s*(?:-->|==>|-\.->)/, "").trim();
        if (id && !seenIds.has(id)) { seenIds.add(id); nodes++; }
      }
    }
    // Also capture destination nodes after arrows
    const destNodes = trimmed.match(/(?:-->|==>|-\.->)\s*(?:\|[^|]*\|)?\s*(\w+)/g);
    if (destNodes) {
      for (const m of destNodes) {
        const id = m.replace(/(?:-->|==>|-\.->)\s*(?:\|[^|]*\|)?\s*/, "").trim();
        if (id && !seenIds.has(id)) { seenIds.add(id); nodes++; }
      }
    }
  }

  const MAX_NODES = 20;
  const MAX_SUBGRAPHS = 3;
  const overBudget = nodes > MAX_NODES || subgraphs > MAX_SUBGRAPHS;

  return { nodes, edges, subgraphs, overBudget };
}

/** Auto-simplify a Mermaid diagram by removing nested subgraphs and truncating */
function simplifyMermaidDiagram(code: string): string {
  let lines = code.split("\n");

  // Step 1: Remove nested subgraphs (keep only top-level)
  let depth = 0;
  lines = lines.filter(line => {
    const trimmed = line.trim();
    if (/^subgraph\b/.test(trimmed)) {
      depth++;
      return depth <= 1;
    }
    if (trimmed === "end" && depth > 0) {
      const keep = depth <= 1;
      depth--;
      return keep;
    }
    return true;
  });

  // Step 2: Limit to first 18 meaningful lines (nodes + edges)
  const header = lines.filter(l => /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|mindmap|timeline)\b/.test(l.trim()));
  const body = lines.filter(l => !header.includes(l) && l.trim().length > 0);
  const truncated = [...header, ...body.slice(0, 18)];

  return truncated.join("\n");
}

export { extractMermaidOutline, checkMermaidComplexity, simplifyMermaidDiagram };

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
        // Create a temporary offscreen container for rendering
        // This prevents mermaid from injecting error SVGs into the visible DOM
        const tempContainer = document.createElement("div");
        tempContainer.id = id;
        tempContainer.style.position = "absolute";
        tempContainer.style.left = "-9999px";
        document.body.appendChild(tempContainer);
        try {
          const sanitized = sanitizeMermaidCode(code);
          // Pre-render complexity check
          const complexity = checkMermaidComplexity(sanitized);
          let renderCode = sanitized;
          if (complexity.overBudget) {
            renderCode = simplifyMermaidDiagram(sanitized);
          }
          // Pre-validate syntax before rendering
          try {
            await m.parse(renderCode);
          } catch (parseErr: any) {
            // Attempt auto-repair: common LLM mistakes
            const repaired = autoRepairMermaid(renderCode);
            if (repaired !== renderCode) {
              try {
                await m.parse(repaired);
                const { svg } = await m.render(id, repaired);
                if (!cancelled) setSvgHtml(svg);
                return;
              } catch {
                // Repair didn't help — fall through to fallback
              }
            }
            // Try converting failed mindmap to a simple flowchart as fallback
            if (/^\s*mindmap\b/m.test(renderCode)) {
              try {
                const mindmapLines = renderCode.split("\n").filter(l => l.trim() && !/^\s*mindmap\b/.test(l));
                const sanitizeLabel = (s: string) => s.replace(/["[\]]/g, "'");
                const root = mindmapLines[0]?.trim() ?? "Root";
                const children = mindmapLines.slice(1).map(l => l.trim()).filter(Boolean);
                let fallback = `flowchart TD\n    ROOT["${sanitizeLabel(root)}"]`;
                children.forEach((child, i) => {
                  fallback += `\n    N${i}["${sanitizeLabel(child)}"]`;
                  fallback += `\n    ROOT --> N${i}`;
                });
                await m.parse(fallback);
                const { svg } = await m.render(id, fallback);
                if (!cancelled) setSvgHtml(svg);
                return;
              } catch {
                // Fallback also failed — continue to error display
              }
            }
            throw parseErr;
          }
          const { svg } = await m.render(id, renderCode);
          if (!cancelled) setSvgHtml(svg);
        } catch (e: any) {
          if (!cancelled) setError(e?.message || t("error.diagramRenderFailed"));
        } finally {
          // Clean up temp container (removes any error SVGs mermaid injected)
          tempContainer.remove();
        }
      })
      .catch(() => {
        if (!cancelled) setError(t("error.mermaidLoadFailed"));
      });
    return () => { cancelled = true; };
  }, [code]);

  if (error) {
    const outline = extractMermaidOutline(code);
    return (
      <div className="bg-gray-900 rounded-md my-1.5 border border-gray-700/50 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800/60 border-b border-gray-700/50">
          <span className="text-[10px] text-gray-500">{outline.title}</span>
          <button
            onClick={() => navigator.clipboard.writeText(code)}
            className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Copy Mermaid
          </button>
        </div>
        {outline.items.length > 0 ? (
          <ul className="px-3 py-2 text-xs text-gray-300 space-y-0.5">
            {outline.items.map((item, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-gray-600 mt-0.5 shrink-0">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <pre className="px-3 py-2 text-xs overflow-x-auto text-gray-300">
            <code>{code}</code>
          </pre>
        )}
      </div>
    );
  }

  if (!svgHtml) {
    return (
      <div className="bg-gray-900/50 rounded-md px-3 py-4 my-1.5 flex items-center justify-center border border-gray-700/50">
        <span className="text-xs text-gray-400 animate-pulse">{t("card.renderingDiagram")}</span>
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
