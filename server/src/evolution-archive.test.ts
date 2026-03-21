import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";

// ── Mocks ──

const mockFs: Record<string, string | Buffer> = {};
const mockDirs: Record<string, string[]> = {};
const createdDirs: string[] = [];
const copiedFiles: Array<{ src: string; dest: string }> = [];
const deletedFiles: string[] = [];

vi.mock("fs", () => ({
  existsSync: vi.fn((path: string) => path in mockFs || path in mockDirs),
  mkdirSync: vi.fn((path: string) => { createdDirs.push(path); }),
  readdirSync: vi.fn((path: string) => mockDirs[path] || []),
  readFileSync: vi.fn((path: string) => {
    if (path in mockFs) return mockFs[path];
    throw new Error(`ENOENT: ${path}`);
  }),
  writeFileSync: vi.fn((path: string, content: string) => { mockFs[path] = content; }),
  copyFileSync: vi.fn((src: string, dest: string) => {
    copiedFiles.push({ src, dest });
    mockFs[dest] = mockFs[src] || "";
  }),
  unlinkSync: vi.fn((path: string) => { deletedFiles.push(path); }),
  statSync: vi.fn(() => ({ isFile: () => true })),
  rmdirSync: vi.fn(),
}));

vi.mock("./action-log.js", () => ({
  logAction: vi.fn(),
  logError: vi.fn(),
}));

const { archiveEvolutionSprint, cleanEvolutionTempFiles, listEvolutionSprints } = await import("./evolution-archive.js");
const { logError } = await import("./action-log.js");

// ── Setup / Teardown ──

beforeEach(() => {
  // Clear mocks
  Object.keys(mockFs).forEach(k => delete mockFs[k]);
  Object.keys(mockDirs).forEach(k => delete mockDirs[k]);
  createdDirs.length = 0;
  copiedFiles.length = 0;
  deletedFiles.length = 0;
  vi.clearAllMocks();
});

// ── Tests ──

describe("Archive Directory Structure", () => {
  it("creates sprint directory with personas/ and validation/ subdirs", () => {
    const projectRoot = "/test/project";
    mockDirs[projectRoot] = [".evolution-synthesis.md"];
    mockFs[join(projectRoot, ".evolution-synthesis.md")] = "# Synthesis";

    archiveEvolutionSprint("sprint-001", "test goal", projectRoot, "test-project");

    const dirPaths = createdDirs.map(d => d.replace(/\\/g, "/"));
    expect(dirPaths.some(d => d.includes("sprint-001"))).toBe(true);
    expect(dirPaths.some(d => d.includes("personas"))).toBe(true);
    expect(dirPaths.some(d => d.includes("validation"))).toBe(true);
  });

  it("creates team/ subdirectory for team agent reports", () => {
    const projectRoot = "/test/project";
    mockDirs[projectRoot] = [".evolution-team-architect.md"];
    mockFs[join(projectRoot, ".evolution-team-architect.md")] = "# Team report";

    archiveEvolutionSprint("sprint-002", "test", projectRoot, "test-project");

    const dirPaths = createdDirs.map(d => d.replace(/\\/g, "/"));
    expect(dirPaths.some(d => d.includes("team"))).toBe(true);
  });

  it("writes meta.json with correct structure", () => {
    const projectRoot = "/test/project";
    mockDirs[projectRoot] = [".evolution-synthesis.md"];
    mockFs[join(projectRoot, ".evolution-synthesis.md")] = "# Synthesis";

    const meta = archiveEvolutionSprint("sprint-003", "my goal", projectRoot, "test-project");

    expect(meta).not.toBeNull();
    expect(meta!.sprintId).toBe("sprint-003");
    expect(meta!.goal).toBe("my goal");
    expect(meta!.projectId).toBe("test-project");
    expect(meta!.phases).toBeDefined();
    expect(meta!.files).toBeDefined();
  });
});

describe("File Copying", () => {
  it("copies persona reports to personas/ subdirectory", () => {
    const projectRoot = "/test/project";
    mockDirs[projectRoot] = [".evolution-persona-developer.md"];
    mockFs[join(projectRoot, ".evolution-persona-developer.md")] = "# Persona";

    const meta = archiveEvolutionSprint("sprint-004", "test", projectRoot, "test-project");

    expect(meta!.phases.personas.count).toBeGreaterThan(0);
    expect(copiedFiles.some(f => f.dest.includes("personas"))).toBe(true);
  });

  it("copies team reports to team/ subdirectory (BUG-001 regression)", () => {
    const projectRoot = "/test/project";
    mockDirs[projectRoot] = [
      ".evolution-team-architect.md",
      ".evolution-team-marketing-director.md",
    ];
    mockFs[join(projectRoot, ".evolution-team-architect.md")] = "# Architect";
    mockFs[join(projectRoot, ".evolution-team-marketing-director.md")] = "# Marketing";

    const meta = archiveEvolutionSprint("sprint-005", "test", projectRoot, "test-project");

    // Should not crash (BUG-001 was rootFiles undefined)
    expect(meta).not.toBeNull();
    expect(copiedFiles.some(f => f.dest.includes("team"))).toBe(true);
    expect(meta!.files.some(f => f.startsWith("team/"))).toBe(true);
  });

  it("copies validation reports to validation/ subdirectory", () => {
    const projectRoot = "/test/project";
    mockDirs[projectRoot] = [".evolution-retest-developer.md"];
    mockFs[join(projectRoot, ".evolution-retest-developer.md")] = "# Retest";

    const meta = archiveEvolutionSprint("sprint-006", "test", projectRoot, "test-project");

    expect(copiedFiles.some(f => f.dest.includes("validation"))).toBe(true);
  });

  it("copies dashboard-ui.jsx as dashboard", () => {
    const projectRoot = "/test/project";
    mockDirs[projectRoot] = [".orchestration-ui.jsx"];
    mockFs[join(projectRoot, ".orchestration-ui.jsx")] = "var App = () => {};";

    const meta = archiveEvolutionSprint("sprint-007", "test", projectRoot, "test-project");

    expect(meta!.phases.dashboard).toBe(true);
  });
});

describe("Sprint Status", () => {
  it("sets status 'completed' when core phases present", () => {
    const projectRoot = "/test/project";
    mockDirs[projectRoot] = [
      ".evolution-synthesis.md",
      ".evolution-implementation.md",
      ".evolution-review.md",
    ];
    for (const f of mockDirs[projectRoot]) {
      mockFs[join(projectRoot, f)] = "# Content";
    }

    const meta = archiveEvolutionSprint("sprint-008", "test", projectRoot, "test-project");

    expect(meta!.status).toBe("completed");
  });

  it("sets status 'partial' when key phases missing (BUG-006 regression)", () => {
    const projectRoot = "/test/project";
    // Only one file — should NOT be "completed"
    mockDirs[projectRoot] = [".evolution-persona-developer.md"];
    mockFs[join(projectRoot, ".evolution-persona-developer.md")] = "# Persona";

    const meta = archiveEvolutionSprint("sprint-009", "test", projectRoot, "test-project");

    expect(meta!.status).toBe("partial");
  });
});

describe("Error Handling", () => {
  it("logs errors instead of silently swallowing (BUG-007 regression)", async () => {
    const projectRoot = "/test/project";
    mockDirs[projectRoot] = [".evolution-team-architect.md"];
    mockFs[join(projectRoot, ".evolution-team-architect.md")] = "# Team";

    // Make copyFileSync throw for team report (use regex for cross-platform path sep)
    const fsMock = await import("fs");
    (fsMock.copyFileSync as unknown as ReturnType<typeof vi.fn>).mockImplementation((src: string, dest: string) => {
      if (/[/\\]team[/\\]/.test(dest as string)) {
        throw new Error("Permission denied");
      }
      copiedFiles.push({ src: src as string, dest: dest as string });
    });

    const meta = archiveEvolutionSprint("sprint-010", "test", projectRoot, "test-project");

    // Should not crash
    expect(meta).not.toBeNull();
    // logError should have been called
    expect(logError).toHaveBeenCalled();
  });

  it("returns null on catastrophic failure without crashing", async () => {
    // Provide a projectRoot that makes mkdirSync fail
    const { mkdirSync } = await import("fs");
    vi.mocked(mkdirSync).mockImplementation(() => {
      throw new Error("EACCES");
    });

    const meta = archiveEvolutionSprint("sprint-011", "test", "/bad/path", "test");
    expect(meta).toBeNull();
  });
});
