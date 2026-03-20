import { describe, it, expect } from "vitest";
import { sanitizeMermaidCode, autoRepairMermaid, extractMermaidOutline, checkMermaidComplexity, simplifyMermaidDiagram } from "../MarkdownText";

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

  // E1 Sprint 12: Mind map repair strips wrapping delimiters
  it("strips wrapping delimiters from mindmap labels", () => {
    const input = `mindmap\n  root((Project))\n    Planning\n    Development`;
    const result = autoRepairMermaid(input);
    expect(result).toContain("mindmap");
    expect(result).not.toContain("((");
    expect(result).not.toContain("))");
    expect(result).toContain("Project");
  });

  // E1 Sprint 12: Timeline auto-adds title
  it("adds title to timeline when missing", () => {
    const input = `timeline\n    2026-Q1 : MVP Launch\n    2026-Q2 : Beta`;
    const result = autoRepairMermaid(input);
    expect(result).toContain("title Timeline");
    expect(result).toContain("timeline");
  });

  it("does NOT add title to timeline when already present", () => {
    const input = `timeline\n    title My Timeline\n    2026-Q1 : MVP`;
    const result = autoRepairMermaid(input);
    const matches = result.match(/title/g);
    expect(matches).toHaveLength(1);
  });
});

// ── Parse-Validation Tests (E4): validate sanitized output is syntactically correct ──

describe("sanitizeMermaidCode — diagram type coverage", () => {
  it("MR-01: flowchart with CSS styles produces clean output", () => {
    const input = `flowchart TD\n    A-->B\n    style A fill:#f9f,stroke:#333,stroke-width:2px`;
    const result = sanitizeMermaidCode(input);
    expect(result).toContain("flowchart TD");
    expect(result).toContain("A-->B");
    expect(result).not.toMatch(/style\s+\S+\s+fill/);
  });

  it("MR-02: architecture diagram with subgraphs + style directives sanitizes cleanly", () => {
    const input = `flowchart TD
    subgraph API["API Layer"]
        A[Gateway] --> B[Auth]
        A --> C[Users]
    end
    style A fill:#f9f,stroke:#333
    classDef highlight fill:#f96
    class B highlight`;
    const result = sanitizeMermaidCode(input);
    expect(result).toContain("subgraph");
    expect(result).toContain("A[Gateway] --> B[Auth]");
    expect(result).not.toMatch(/^\s*style\s/m);
    expect(result).not.toMatch(/^\s*classDef\s/m);
    expect(result).not.toMatch(/^\s*class\s/m);
  });

  it("MR-03: mindmap passes through with labels intact", () => {
    const input = `mindmap\n  root((Project))\n    Planning\n    Development`;
    const result = sanitizeMermaidCode(input);
    expect(result).toContain("mindmap");
    expect(result.split("\n").length).toBeGreaterThanOrEqual(3);
  });

  it("MR-04: pie chart with style directive strips CSS, preserves data", () => {
    const input = `pie title Budget\n    "Engineering" : 45\n    "Marketing" : 30\n    style a1 fill:#f88`;
    const result = sanitizeMermaidCode(input);
    expect(result).toContain("pie title Budget");
    expect(result).toContain('"Engineering" : 45');
    expect(result).not.toMatch(/style\s+\S+\s+fill/);
  });

  it("MR-05: sequenceDiagram passes through unchanged", () => {
    const input = `sequenceDiagram\n    A->>B: Hello\n    B-->>A: Hi`;
    const result = sanitizeMermaidCode(input);
    expect(result).toBe(input);
  });

  it("MR-06: gantt without dateFormat gets auto-repaired", () => {
    const input = `gantt\n    section Phase 1\n    Task :a1, 2025-01-01, 30d`;
    const result = autoRepairMermaid(sanitizeMermaidCode(input));
    expect(result).toContain("dateFormat YYYY-MM-DD");
  });

  it("MR-07: flowChart (wrong case) gets normalized", () => {
    const input = `flowChart TD\n    A-->B`;
    const result = autoRepairMermaid(sanitizeMermaidCode(input));
    expect(result).toMatch(/^flowchart TD/m);
  });

  it("MR-08: %%{init}%% theme directive is stripped", () => {
    const input = `%%{init: {'theme':'dark'}}%%\nflowchart TD\n    A-->B`;
    const result = sanitizeMermaidCode(input);
    expect(result).not.toContain("%%{init");
    expect(result).toContain("flowchart TD");
    expect(result).toContain("A-->B");
  });

  it("MR-09: :::className inline styling is stripped", () => {
    const input = `flowchart TD\n    A:::highlight --> B`;
    const result = sanitizeMermaidCode(input);
    expect(result).not.toContain(":::");
    expect(result).toContain("A");
    expect(result).toContain("B");
  });

  it("MR-10: empty mermaid code handled gracefully", () => {
    const result = sanitizeMermaidCode("");
    expect(result).toBeDefined();
    expect(typeof result).toBe("string");
  });
});

// ── E2: extractMermaidOutline tests ──

describe("extractMermaidOutline", () => {
  it("extracts node labels from a flowchart", () => {
    const code = `flowchart TD\n    A[Gateway]\n    B[Auth Service]\n    C[Database]\n    A --> B\n    B --> C`;
    const outline = extractMermaidOutline(code);
    expect(outline.title).toBe("Flowchart Overview");
    expect(outline.items).toContain("Gateway");
    expect(outline.items).toContain("Auth Service");
    expect(outline.items).toContain("Database");
  });

  it("extracts subgraph labels", () => {
    const code = `flowchart TD\n    subgraph "API Layer"\n        A[Gateway]\n    end`;
    const outline = extractMermaidOutline(code);
    expect(outline.items).toContain("[API Layer]");
  });

  it("extracts pie chart labels", () => {
    const code = `pie title Budget\n    "Engineering" : 45\n    "Marketing" : 30`;
    const outline = extractMermaidOutline(code);
    expect(outline.title).toBe("Budget");
    expect(outline.items).toContain("Engineering");
    expect(outline.items).toContain("Marketing");
  });

  it("extracts Gantt section headers", () => {
    const code = `gantt\n    dateFormat YYYY-MM-DD\n    section Planning\n    Requirements :a1, 2025-01-01, 30d`;
    const outline = extractMermaidOutline(code);
    expect(outline.items).toContain("**Planning**");
  });

  it("extracts timeline events", () => {
    const code = `timeline\n    title Product Roadmap\n    2026-Q1 : MVP Launch\n    2026-Q2 : Beta Release`;
    const outline = extractMermaidOutline(code);
    expect(outline.title).toBe("Product Roadmap");
    expect(outline.items.length).toBeGreaterThanOrEqual(2);
  });

  it("returns empty items for unrecognizable content", () => {
    const code = `flowchart TD`;
    const outline = extractMermaidOutline(code);
    expect(outline.items).toHaveLength(0);
  });

  it("deduplicates labels", () => {
    const code = `flowchart TD\n    A[Gateway] --> B[Service]\n    C[Gateway] --> D[Other]`;
    const outline = extractMermaidOutline(code);
    const gatewayCount = outline.items.filter(i => i === "Gateway").length;
    expect(gatewayCount).toBeLessThanOrEqual(1);
  });

  it("caps output at 20 items", () => {
    const nodes = Array.from({ length: 30 }, (_, i) => `    N${i}[Node ${i} Label]`).join("\n");
    const code = `flowchart TD\n${nodes}`;
    const outline = extractMermaidOutline(code);
    expect(outline.items.length).toBeLessThanOrEqual(20);
  });

  it("uses title line when present in non-pie diagram", () => {
    const code = `gantt\n    title Sprint Plan\n    dateFormat YYYY-MM-DD`;
    const outline = extractMermaidOutline(code);
    expect(outline.title).toBe("Sprint Plan");
  });
});

// ── E4: checkMermaidComplexity tests ──

describe("checkMermaidComplexity", () => {
  it("counts nodes in a simple flowchart", () => {
    const code = `flowchart TD\n    A[Start] --> B[End]`;
    const result = checkMermaidComplexity(code);
    expect(result.nodes).toBeGreaterThanOrEqual(2);
    expect(result.edges).toBeGreaterThanOrEqual(1);
    expect(result.overBudget).toBe(false);
  });

  it("detects overBudget for >20 nodes", () => {
    const nodes = Array.from({ length: 25 }, (_, i) => `    N${i}[Node${i}]`).join("\n");
    const code = `flowchart TD\n${nodes}`;
    const result = checkMermaidComplexity(code);
    expect(result.nodes).toBeGreaterThan(20);
    expect(result.overBudget).toBe(true);
  });

  it("detects overBudget for >3 subgraphs", () => {
    const code = `flowchart TD\n    subgraph A\n        a1[X]\n    end\n    subgraph B\n        b1[Y]\n    end\n    subgraph C\n        c1[Z]\n    end\n    subgraph D\n        d1[W]\n    end`;
    const result = checkMermaidComplexity(code);
    expect(result.subgraphs).toBe(4);
    expect(result.overBudget).toBe(true);
  });

  it("passes diagrams under budget through", () => {
    const code = `flowchart TD\n    A[One] --> B[Two] --> C[Three]`;
    const result = checkMermaidComplexity(code);
    expect(result.overBudget).toBe(false);
  });

  it("counts edge-only referenced nodes", () => {
    const code = `flowchart TD\n    A --> B\n    B --> C`;
    const result = checkMermaidComplexity(code);
    expect(result.nodes).toBeGreaterThanOrEqual(3);
  });
});

// ── E4: simplifyMermaidDiagram tests ──

describe("simplifyMermaidDiagram", () => {
  it("removes nested subgraphs", () => {
    const code = `flowchart TD\n    subgraph Outer\n        subgraph Inner\n            A[Node]\n        end\n    end`;
    const result = simplifyMermaidDiagram(code);
    expect(result).toContain("subgraph Outer");
    expect(result).not.toContain("subgraph Inner");
  });

  it("preserves diagram type declaration", () => {
    const nodes = Array.from({ length: 25 }, (_, i) => `    N${i}[Node${i}]`).join("\n");
    const code = `flowchart TD\n${nodes}`;
    const result = simplifyMermaidDiagram(code);
    expect(result).toContain("flowchart TD");
  });

  it("truncates to at most 18 body lines", () => {
    const nodes = Array.from({ length: 25 }, (_, i) => `    N${i}[Node${i}]`).join("\n");
    const code = `flowchart TD\n${nodes}`;
    const result = simplifyMermaidDiagram(code);
    const bodyLines = result.split("\n").filter(l => !l.trim().startsWith("flowchart"));
    expect(bodyLines.length).toBeLessThanOrEqual(18);
  });

  it("passes small diagrams through mostly unchanged", () => {
    const code = `flowchart TD\n    A[Start] --> B[End]`;
    const result = simplifyMermaidDiagram(code);
    expect(result).toContain("A[Start]");
    expect(result).toContain("B[End]");
  });
});
