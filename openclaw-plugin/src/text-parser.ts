export interface ParsedItem {
  id: string;
  text: string;
  isQuestion: boolean;
}

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

export interface ParsedSection {
  body?: string;
  items?: ParsedItem[];
  table?: ParsedTable;
}

export interface ParsedAgentText {
  summary: string;
  sections: ParsedSection[];
  totalItems: number;
  totalTables: number;
}

const LIST_PATTERN = /^(?:\s*[-*•]\s+|\s*\d+[.)]\s+)/;
const QUESTION_SUFFIX = /\?\s*$/;

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function extractItemText(line: string): string {
  return stripMarkdown(line.replace(LIST_PATTERN, "").trim());
}

function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function isTableLine(line: string): boolean {
  return /^\s*\|/.test(line);
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|[\s:?-]+\|/.test(line) && /^[\s|:\-]+$/.test(line);
}

function isCodeFenceLine(line: string): boolean {
  return /^```/.test(line.trim());
}

function parseTableCell(cell: string): string {
  return stripMarkdown(cell.trim());
}

function parseMarkdownTable(lines: string[]): ParsedTable | null {
  const tableLines = lines.filter((l) => isTableLine(l));
  if (tableLines.length < 2) return null;

  const sepIdx = tableLines.findIndex(isTableSeparator);
  const headerLine = sepIdx > 0 ? tableLines[sepIdx - 1] : tableLines[0];
  const dataStart = sepIdx >= 0 ? sepIdx + 1 : 1;

  const splitRow = (line: string): string[] =>
    line.split("|").slice(1, -1).map(parseTableCell);

  const headers = splitRow(headerLine);
  if (headers.length === 0) return null;

  const rows: string[][] = [];
  for (let i = dataStart; i < tableLines.length; i++) {
    if (isTableSeparator(tableLines[i])) continue;
    const cells = splitRow(tableLines[i]);
    if (cells.length > 0) rows.push(cells);
  }

  if (rows.length === 0) return null;
  return { headers, rows };
}

/**
 * Parse agent text into a structured format for the smart text card.
 * Always returns a result for non-trivial text — every response becomes a smart card.
 */
export function parseAgentText(text: string): ParsedAgentText | null {
  if (!text || text.trim().length === 0) return null;

  const paragraphs = splitIntoParagraphs(text);
  if (paragraphs.length === 0) return null;

  let summary = "";
  const sections: ParsedSection[] = [];
  let itemId = 0;
  let totalItems = 0;
  let totalTables = 0;
  let insideCodeBlock = false;

  for (const para of paragraphs) {
    const lines = para.split("\n").map((l) => l.trim()).filter(Boolean);

    // Handle code blocks — preserve as body text
    if (lines.some(isCodeFenceLine)) {
      insideCodeBlock = !insideCodeBlock;
      if (!summary) {
        summary = stripMarkdown(lines.join(" "));
        continue;
      }
      sections.push({ body: para });
      continue;
    }
    if (insideCodeBlock) {
      sections.push({ body: para });
      continue;
    }

    // Detect table blocks
    if (lines.some(isTableLine)) {
      const tableLinesOnly = lines.filter((l) => isTableLine(l));
      const nonTableLines = lines.filter((l) => !isTableLine(l) && !isTableSeparator(l));

      const table = parseMarkdownTable(tableLinesOnly);
      if (table) {
        totalTables++;
        const body = nonTableLines.length > 0
          ? stripMarkdown(nonTableLines.join(" "))
          : undefined;
        if (!summary && body) {
          summary = body;
          sections.push({ table });
        } else if (!summary) {
          summary = `${table.headers.slice(0, 3).join(", ")} data`;
          sections.push({ table });
        } else {
          sections.push({ body, table });
        }
        continue;
      }
    }

    const items: ParsedItem[] = [];
    const bodyLines: string[] = [];

    for (const line of lines) {
      if (LIST_PATTERN.test(line)) {
        const itemText = extractItemText(line);
        if (itemText.length >= 5) {
          items.push({
            id: `item-${++itemId}`,
            text: itemText,
            isQuestion: QUESTION_SUFFIX.test(itemText),
          });
        }
      } else if (QUESTION_SUFFIX.test(line) && !summary) {
        bodyLines.push(line);
      } else if (QUESTION_SUFFIX.test(line) && line.length >= 10) {
        items.push({
          id: `item-${++itemId}`,
          text: stripMarkdown(line),
          isQuestion: true,
        });
      } else {
        bodyLines.push(line);
      }
    }

    if (!summary) {
      summary = stripMarkdown(bodyLines.join(" ") || lines.join(" "));
      if (items.length > 0) {
        totalItems += items.length;
        sections.push({ items });
      }
      continue;
    }

    if (items.length > 0) {
      totalItems += items.length;
      const body = bodyLines.length > 0 ? bodyLines.join(" ") : undefined;
      sections.push({ body: body ? stripMarkdown(body) : undefined, items });
    } else if (bodyLines.length > 0) {
      sections.push({ body: stripMarkdown(bodyLines.join(" ")) });
    }
  }

  if (!summary && sections.length === 0) return null;

  return { summary, sections, totalItems, totalTables };
}
