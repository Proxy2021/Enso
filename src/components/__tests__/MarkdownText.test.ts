import { describe, it, expect } from "vitest";

// Copy of sanitizeMermaidCode from src/components/MarkdownText.tsx for unit testing
// Must match production code — includes E1 enhancement (CSS directive stripping)
function sanitizeMermaidCode(code: string): string {
  let clean = code;
  // 1. Strip %%{init:...}%% directives (CSS themes, config overrides) — multiline-safe
  clean = clean.replace(/%%\{init:[\s\S]*?\}%%/g, "");
  // 2. Replace ALL <br> variants (case-insensitive, with/without slash/space)
  clean = clean.replace(/<br\s*\/?>/gi, "\n");
  // 3. Strip remaining HTML tags from node labels
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
  // 9. Remove 'direction' keyword inside subgraphs (mermaid 11.x doesn't support this)
  clean = clean.replace(
    /(subgraph\s[^\n]*\n)([\s\S]*?)(end\b)/g,
    (match, open, body, close) => {
      const cleanBody = body.replace(/^\s*direction\s+(TB|BT|LR|RL)\s*$/gm, "");
      return open + cleanBody + close;
    }
  );
  // 10. Trim whitespace per line, trim overall
  clean = clean.split("\n").map(l => l.trimEnd()).join("\n").trim();
  return clean;
}

describe("sanitizeMermaidCode", () => {
  it("passes through simple flowcharts unchanged", () => {
    expect(sanitizeMermaidCode("flowchart TD\n  A --> B")).toBe("flowchart TD\n  A --> B");
  });

  it("replaces <br/> with \n", () => {
    const input = 'flowchart TD\n  A["Line 1<br/>Line 2"]';
    expect(sanitizeMermaidCode(input)).toContain("\n");
    expect(sanitizeMermaidCode(input)).not.toContain("<br/>");
  });

  it("replaces <br> variants case-insensitively", () => {
    expect(sanitizeMermaidCode('A["test<BR>text"]')).not.toContain("<BR>");
    expect(sanitizeMermaidCode('A["test<br />text"]')).not.toContain("<br />");
    expect(sanitizeMermaidCode('A["test<Br/>text"]')).not.toContain("<Br/>");
  });

  it("strips %%{init}%% directives", () => {
    const input = "%%{init: {'theme':'dark'}}%%\nflowchart TD\n  A --> B";
    expect(sanitizeMermaidCode(input)).toBe("flowchart TD\n  A --> B");
  });

  it("removes direction inside subgraphs", () => {
    const input = "flowchart LR\n  subgraph SG\n    direction TB\n    A --> B\n  end";
    const result = sanitizeMermaidCode(input);
    expect(result).not.toMatch(/direction TB/);
    expect(result).toContain("A --> B");
    expect(result).toContain("subgraph SG");
  });

  it("preserves top-level flowchart direction", () => {
    expect(sanitizeMermaidCode("flowchart TB\n  A --> B")).toContain("flowchart TB");
  });

  it("strips HTML tags from labels", () => {
    const input = 'flowchart TD\n  A["<b>Bold</b> text"]';
    const result = sanitizeMermaidCode(input);
    expect(result).not.toContain("<b>");
    expect(result).not.toContain("</b>");
    expect(result).toContain("Bold text");
  });

  // ── S8-001 Regression Tests ──

  it("strips style directives (S8-001)", () => {
    const input = "flowchart TD\n  A --> B\n  style A fill:#f9f,stroke:#333,stroke-width:4px\n  style B fill:#bbf";
    const result = sanitizeMermaidCode(input);
    expect(result).not.toContain("style A");
    expect(result).not.toContain("style B");
    expect(result).toContain("A --> B");
  });

  it("strips classDef and class directives", () => {
    const input = "flowchart TD\n  A --> B\n  classDef error fill:#f99,stroke:#f00\n  class A error";
    const result = sanitizeMermaidCode(input);
    expect(result).not.toContain("classDef");
    expect(result).not.toContain("class A error");
    expect(result).toContain("A --> B");
  });

  it("strips linkStyle directives", () => {
    const input = "flowchart TD\n  A --> B\n  linkStyle 0 stroke:#ff3,stroke-width:4px";
    const result = sanitizeMermaidCode(input);
    expect(result).not.toContain("linkStyle");
    expect(result).toContain("A --> B");
  });

  it("strips click event handlers", () => {
    const input = 'flowchart TD\n  A --> B\n  click A callback "Tooltip"';
    const result = sanitizeMermaidCode(input);
    expect(result).not.toContain("click A");
    expect(result).toContain("A --> B");
  });

  it("strips multiple directive types in same diagram", () => {
    const input = [
      "flowchart TD",
      "  A --> B",
      "  style A fill:#f9f",
      "  classDef important fill:#f00",
      "  class B important",
      '  linkStyle 0 stroke:#333',
      '  click A href "http://example.com"',
    ].join("\n");
    const result = sanitizeMermaidCode(input);
    expect(result).not.toContain("style A");
    expect(result).not.toContain("classDef");
    expect(result).not.toContain("class B");
    expect(result).not.toContain("linkStyle");
    expect(result).not.toContain("click A");
    expect(result).toContain("flowchart TD");
    expect(result).toContain("A --> B");
  });
});
