import { describe, it, expect } from "vitest";

// Copy of BlockNode type and parseMarkdown parsing logic from src/components/MarkdownText.tsx
// Tests the text→BlockNode[] parsing phase (pure logic, no React dependency)

type BlockNode =
  | { type: "heading"; level: number; content: string }
  | { type: "code-block"; lang: string; content: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "blockquote"; content: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "paragraph"; content: string };

function parseMarkdownToBlocks(text: string): BlockNode[] {
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

  return blocks;
}

describe("parseMarkdown: block parsing", () => {
  // PM-01: Plain text → paragraph block
  it("PM-01: parses plain text into a paragraph block", () => {
    const blocks = parseMarkdownToBlocks("Hello world");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("paragraph");
    expect((blocks[0] as any).content).toBe("Hello world");
  });

  // PM-02: H1 heading (# Heading)
  it("PM-02: parses H1 heading", () => {
    const blocks = parseMarkdownToBlocks("# My Title");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("heading");
    expect((blocks[0] as any).level).toBe(1);
    expect((blocks[0] as any).content).toBe("My Title");
  });

  // PM-03: H2 heading (## Heading)
  it("PM-03: parses H2 heading", () => {
    const blocks = parseMarkdownToBlocks("## Subtitle");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("heading");
    expect((blocks[0] as any).level).toBe(2);
    expect((blocks[0] as any).content).toBe("Subtitle");
  });

  // PM-04: Code block with language (```ts...```)
  it("PM-04: parses code block with language tag", () => {
    const input = "```ts\nconst x = 1;\nconsole.log(x);\n```";
    const blocks = parseMarkdownToBlocks(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("code-block");
    expect((blocks[0] as any).lang).toBe("ts");
    expect((blocks[0] as any).content).toBe("const x = 1;\nconsole.log(x);");
  });

  // PM-05: Mermaid code block (```mermaid...```)
  it("PM-05: parses mermaid code block with correct lang tag", () => {
    const input = "```mermaid\nflowchart TD\n  A --> B\n```";
    const blocks = parseMarkdownToBlocks(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("code-block");
    expect((blocks[0] as any).lang).toBe("mermaid");
    expect((blocks[0] as any).content).toBe("flowchart TD\n  A --> B");
  });

  // PM-10: Mixed content (heading + paragraph + list + code)
  it("PM-10: parses mixed content into correct block types", () => {
    const input = [
      "# Welcome",
      "",
      "This is an introduction paragraph.",
      "",
      "- Item one",
      "- Item two",
      "- Item three",
      "",
      "```js",
      "console.log('hello');",
      "```",
    ].join("\n");

    const blocks = parseMarkdownToBlocks(input);
    expect(blocks).toHaveLength(4);
    expect(blocks[0].type).toBe("heading");
    expect((blocks[0] as any).level).toBe(1);
    expect((blocks[0] as any).content).toBe("Welcome");
    expect(blocks[1].type).toBe("paragraph");
    expect((blocks[1] as any).content).toBe("This is an introduction paragraph.");
    expect(blocks[2].type).toBe("list");
    expect((blocks[2] as any).ordered).toBe(false);
    expect((blocks[2] as any).items).toEqual(["Item one", "Item two", "Item three"]);
    expect(blocks[3].type).toBe("code-block");
    expect((blocks[3] as any).lang).toBe("js");
    expect((blocks[3] as any).content).toBe("console.log('hello');");
  });
});
