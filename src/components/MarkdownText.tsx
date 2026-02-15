import { useMemo } from "react";

interface MarkdownTextProps {
  text: string;
}

/**
 * Lightweight inline markdown renderer.
 * Handles: headers, bold, italic, inline code, code blocks, bullet/numbered lists, links.
 */
export default function MarkdownText({ text }: MarkdownTextProps) {
  const elements = useMemo(() => parseMarkdown(text), [text]);
  return <>{elements}</>;
}

type BlockNode =
  | { type: "heading"; level: number; content: string }
  | { type: "code-block"; lang: string; content: string }
  | { type: "list"; ordered: boolean; items: string[] }
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
        return (
          <pre
            key={idx}
            className="bg-gray-900 rounded-md px-3 py-2 my-1.5 text-xs overflow-x-auto text-gray-300 border border-gray-700/50"
          >
            <code>{block.content}</code>
          </pre>
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
