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

  // MS-12: Pie chart with CSS directives stripped
  it("strips CSS from pie chart without breaking structure", () => {
    const source = `pie title Budget Allocation
    "Engineering" : 45
    "Marketing" : 25
    "Sales" : 20
    "Operations" : 10
  style a1 fill:#f88,stroke:#333,stroke-width:2px`;
    const sanitized = sanitizeMermaidCode(source);
    expect(sanitized).not.toContain("style a1");
    expect(sanitized).toContain('"Engineering" : 45');
    expect(sanitized).toContain("pie title");
  });

  // MS-14: Sequence diagram passes through unchanged
  it("preserves valid sequence diagram", () => {
    const source = `sequenceDiagram
    Alice->>Bob: Hello Bob
    Bob-->>Alice: Hi Alice
    Alice->>Bob: How are you?`;
    const sanitized = sanitizeMermaidCode(source);
    expect(sanitized).toContain("Alice->>Bob: Hello Bob");
    expect(sanitized).toContain("sequenceDiagram");
  });

  // MS-15: Complex flowchart with mixed CSS leaks
  it("sanitizes competitive landscape diagram with style and classDef leaks", () => {
    const source = `flowchart TD
    A[AI Agent Market] --> B[Foundation Models]
    A --> C[Consumer AI]
    B --> B1(OpenAI)
    B --> B2(Google DeepMind)
    B --> B3(Anthropic - Claude)
    style B fill:#4a90d9
    classDef highlight fill:#f9f,stroke:#333
    class B1 highlight`;
    const sanitized = sanitizeMermaidCode(source);
    expect(sanitized).not.toContain("style B fill");
    expect(sanitized).not.toContain("classDef");
    expect(sanitized).not.toContain("class B1");
    expect(sanitized).toContain("B3(Anthropic - Claude)");
    expect(sanitized).toContain("flowchart TD");
  });

  // MS-16: Mindmap passes through (no CSS usually)
  it("preserves valid mindmap diagram", () => {
    const source = `mindmap
  root((Project))
    Planning
      Requirements
      Timeline
    Development
      Frontend
      Backend
    Testing`;
    const sanitized = sanitizeMermaidCode(source);
    expect(sanitized).toContain("mindmap");
    expect(sanitized).toContain("root((Project))");
  });

  // MS-17: Timeline diagram passes through
  it("preserves valid timeline diagram", () => {
    const source = `timeline
    title Product Milestones
    2026-Q1 : MVP Launch
    2026-Q2 : Beta Release
    2026-Q3 : GA Release`;
    const sanitized = sanitizeMermaidCode(source);
    expect(sanitized).toContain("timeline");
    expect(sanitized).toContain("MVP Launch");
  });
});

// Copy of autoRepairMermaid from src/components/MarkdownText.tsx for unit testing
// When Track A exports this function, this copy can be replaced with an import
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
    if (/^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie)\b/.test(line)) {
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

  return fixed;
}

describe("autoRepairMermaid", () => {
  // PF-05: Gantt chart with missing dateFormat → auto-repair adds it
  it("PF-05: adds dateFormat to gantt charts when missing", () => {
    const input = "gantt\n    section Phase 1\n    Task A :a1, 2025-01-01, 30d";
    const result = autoRepairMermaid(input);
    expect(result).toContain("dateFormat");
    expect(result).toContain("YYYY-MM-DD");
  });

  it("does NOT add dateFormat when gantt chart already has one", () => {
    const input = "gantt\n    dateFormat YYYY-MM-DD\n    section Phase 1\n    Task A :a1, 2025-01-01, 30d";
    const result = autoRepairMermaid(input);
    // Should only have one dateFormat (the original)
    const matches = result.match(/dateFormat/g);
    expect(matches).toHaveLength(1);
  });

  it("does NOT add dateFormat to non-gantt diagrams", () => {
    const input = "flowchart TD\n  A --> B";
    const result = autoRepairMermaid(input);
    expect(result).not.toContain("dateFormat");
  });

  it("normalizes flowChart to flowchart (case fix)", () => {
    const input = "flowChart TD\n  A --> B";
    const result = autoRepairMermaid(input);
    expect(result).toMatch(/^flowchart TD/m);
    expect(result).not.toMatch(/^flowChart/m);
  });

  it("normalizes case-insensitive diagram types", () => {
    expect(autoRepairMermaid("SEQUENCEDIAGRAM \n  A->>B: msg")).toMatch(/^sequenceDiagram /m);
    expect(autoRepairMermaid("CLASSDIAGRAM \n  A --> B")).toMatch(/^classDiagram /m);
  });

  // MS-13: Gantt chart auto-repair adds missing dateFormat
  it("auto-repairs gantt chart missing dateFormat", () => {
    const source = `gantt
    title Quarterly Churn Rate Trend
    section Q1
    Churn 5.2% :a1, 2024-01-01, 90d`;
    const repaired = autoRepairMermaid(source);
    expect(repaired).toContain("dateFormat");
    expect(repaired).toContain("gantt");
  });
});
