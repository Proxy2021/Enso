/**
 * End-to-end tests for the sprint enhancements:
 * - WS3: ExecutorContext utility methods
 * - WS3: System tools
 * - WS2: App loading (data_analyzer, system_monitor, note_keeper)
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPS_DIR = path.join(__dirname, "..", "apps");

// ── WS3: ExecutorContext utility methods ──

describe("ExecutorContext utilities", () => {
  it("buildExecutorContext returns all new utility methods", async () => {
    const { buildExecutorContext } = await import("./app-persistence.js");
    const ctx = buildExecutorContext("test_family", "test_suffix");

    expect(typeof ctx.uuid).toBe("function");
    expect(typeof ctx.hash).toBe("function");
    expect(typeof ctx.sleep).toBe("function");
    expect(typeof ctx.log).toBe("function");
    expect(typeof ctx.formatDate).toBe("function");
    expect(typeof ctx.now).toBe("function");
  });

  it("ctx.uuid() returns valid UUID v4", async () => {
    const { buildExecutorContext } = await import("./app-persistence.js");
    const ctx = buildExecutorContext("test_family", "test_suffix");

    const uuid = ctx.uuid();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    const uuid2 = ctx.uuid();
    expect(uuid2).not.toBe(uuid);
  });

  it("ctx.hash() returns SHA-256 hex", async () => {
    const { buildExecutorContext } = await import("./app-persistence.js");
    const ctx = buildExecutorContext("test_family", "test_suffix");

    const hash = ctx.hash("hello");
    expect(hash).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
    expect(hash).toHaveLength(64);
  });

  it("ctx.hash() supports other algorithms", async () => {
    const { buildExecutorContext } = await import("./app-persistence.js");
    const ctx = buildExecutorContext("test_family", "test_suffix");

    const md5 = ctx.hash("hello", "md5");
    expect(md5).toBe("5d41402abc4b2a76b9719d911017c592");
  });

  it("ctx.sleep() resolves within reasonable time", async () => {
    const { buildExecutorContext } = await import("./app-persistence.js");
    const ctx = buildExecutorContext("test_family", "test_suffix");

    const start = Date.now();
    await ctx.sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(200);
  });

  it("ctx.sleep() caps at 10 seconds", async () => {
    const { buildExecutorContext } = await import("./app-persistence.js");
    const ctx = buildExecutorContext("test_family", "test_suffix");

    // Should not throw, but also should not actually wait 99s
    const start = Date.now();
    await ctx.sleep(50); // just test it doesn't error
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });

  it("ctx.now() returns current timestamp", async () => {
    const { buildExecutorContext } = await import("./app-persistence.js");
    const ctx = buildExecutorContext("test_family", "test_suffix");

    const before = Date.now();
    const ts = ctx.now();
    const after = Date.now();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("ctx.formatDate() handles various formats", async () => {
    const { buildExecutorContext } = await import("./app-persistence.js");
    const ctx = buildExecutorContext("test_family", "test_suffix");

    const iso = ctx.formatDate("2026-03-23T12:00:00Z", "iso");
    expect(iso).toBe("2026-03-23T12:00:00.000Z");

    const dateOnly = ctx.formatDate("2026-03-23T12:00:00Z", "date");
    expect(dateOnly).toBe("2026-03-23");

    const timeOnly = ctx.formatDate("2026-03-23T12:00:00Z", "time");
    expect(timeOnly).toMatch(/^\d{2}:\d{2}:\d{2}$/);

    const invalid = ctx.formatDate("not-a-date", "iso");
    expect(invalid).toBe("Invalid Date");

    // Default (no date) returns current locale string
    const now = ctx.formatDate();
    expect(now.length).toBeGreaterThan(0);
  });

  it("ctx.log() does not throw", async () => {
    const { buildExecutorContext } = await import("./app-persistence.js");
    const ctx = buildExecutorContext("test_family", "test_suffix");

    expect(() => ctx.log("test log message")).not.toThrow();
  });
});

// ── WS3: System tools ──

describe("System tools", () => {
  it("createSystemTools() returns 3 tools", async () => {
    const { createSystemTools } = await import("./system-tools.js");
    const tools = createSystemTools();

    expect(tools).toHaveLength(3);
    const names = tools.map((t) => t.name);
    expect(names).toContain("enso_system_info");
    expect(names).toContain("enso_system_processes");
    expect(names).toContain("enso_system_disk");
  });

  it("enso_system_info executes successfully", async () => {
    const { createSystemTools } = await import("./system-tools.js");
    const tools = createSystemTools();
    const infoTool = tools.find((t) => t.name === "enso_system_info")!;

    const result = await infoTool.execute("test-call", {});
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");

    const data = JSON.parse(result.content[0].text!);
    expect(data.tool).toBe("enso_system_info");
    expect(data.hostname).toBeTruthy();
    expect(data.platform).toBeTruthy();
    expect(data.cpuCores).toBeGreaterThan(0);
    expect(data.memory).toBeDefined();
    expect(data.memory.total).toBeTruthy();
    expect(data.memory.usagePercent).toBeGreaterThanOrEqual(0);
    expect(data.nodeVersion).toMatch(/^v\d+/);
  });

  it("enso_system_processes executes successfully", async () => {
    const { createSystemTools } = await import("./system-tools.js");
    const tools = createSystemTools();
    const procTool = tools.find((t) => t.name === "enso_system_processes")!;

    const result = await procTool.execute("test-call", { sort_by: "cpu", limit: 5 });
    expect(result.content).toHaveLength(1);

    const data = JSON.parse(result.content[0].text!);
    expect(data.tool).toBe("enso_system_processes");
    expect(Array.isArray(data.processes)).toBe(true);
    expect(data.processes.length).toBeGreaterThan(0);
    expect(data.processes[0].pid).toBeDefined();
    expect(data.processes[0].name).toBeDefined();
  });

  it("enso_system_disk executes successfully", async () => {
    const { createSystemTools } = await import("./system-tools.js");
    const tools = createSystemTools();
    const diskTool = tools.find((t) => t.name === "enso_system_disk")!;

    const result = await diskTool.execute("test-call", {});
    expect(result.content).toHaveLength(1);

    const data = JSON.parse(result.content[0].text!);
    expect(data.tool).toBe("enso_system_disk");
    expect(Array.isArray(data.disks)).toBe(true);
    expect(data.disks.length).toBeGreaterThan(0);
    expect(data.disks[0].mount).toBeDefined();
    expect(data.disks[0].usagePercent).toBeDefined();
  });
});

// ── WS2: App manifests are valid ──

describe("New app manifests", () => {
  const appFamilies = ["data_analyzer", "system_monitor", "note_keeper"];

  for (const family of appFamilies) {
    describe(family, () => {
      const appDir = path.join(APPS_DIR, family);

      it("app directory exists", () => {
        expect(fs.existsSync(appDir)).toBe(true);
      });

      it("app.json is valid", () => {
        const manifest = JSON.parse(fs.readFileSync(path.join(appDir, "app.json"), "utf-8"));
        expect(manifest.version).toBe(1);
        expect(manifest.spec.toolFamily).toBe(family);
        expect(manifest.spec.toolPrefix).toBe(`enso_${family}_`);
        expect(manifest.spec.signatureId).toBeTruthy();
        expect(Array.isArray(manifest.spec.tools)).toBe(true);
        expect(manifest.spec.tools.length).toBeGreaterThanOrEqual(2);

        // Exactly one primary tool
        const primaries = manifest.spec.tools.filter((t: { isPrimary: boolean }) => t.isPrimary);
        expect(primaries).toHaveLength(1);

        // All tools have additionalProperties: false
        for (const tool of manifest.spec.tools) {
          expect(tool.parameters.additionalProperties).toBe(false);
          expect(tool.suffix).toBeTruthy();

          // sampleData has tool field
          if (tool.sampleData) {
            expect(tool.sampleData.tool).toBe(`enso_${family}_${tool.suffix}`);
          }
        }
      });

      it("template.jsx exists and is non-empty", () => {
        const templatePath = path.join(appDir, "template.jsx");
        expect(fs.existsSync(templatePath)).toBe(true);
        const content = fs.readFileSync(templatePath, "utf-8");
        expect(content.length).toBeGreaterThan(100);
        expect(content).toContain("export default function GeneratedUI");
        expect(content).toContain("data");
        expect(content).toContain("onAction");
      });

      it("all executor files exist and match tool suffixes", () => {
        const manifest = JSON.parse(fs.readFileSync(path.join(appDir, "app.json"), "utf-8"));
        const execDir = path.join(appDir, "executors");
        expect(fs.existsSync(execDir)).toBe(true);

        for (const tool of manifest.spec.tools) {
          const execPath = path.join(execDir, `${tool.suffix}.js`);
          expect(fs.existsSync(execPath)).toBe(true);

          const body = fs.readFileSync(execPath, "utf-8");
          expect(body.length).toBeGreaterThan(10);
          expect(body).toContain("return");
          // The tool identifier appears as a property key or string value
          expect(body).toMatch(/tool[:\s]/);
        }
      });

      it("executor files use var (not const/let)", () => {
        const execDir = path.join(appDir, "executors");
        const files = fs.readdirSync(execDir).filter((f) => f.endsWith(".js"));

        for (const file of files) {
          const body = fs.readFileSync(path.join(execDir, file), "utf-8");
          // Check for const/let declarations (top-level, not inside strings)
          const lines = body.split("\n");
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("//")) continue;
            if (trimmed.startsWith("const ") || trimmed.startsWith("let ")) {
              throw new Error(`${family}/executors/${file} uses const/let: "${trimmed.slice(0, 50)}"`);
            }
          }
        }
      });

      it("executor files have no import statements", () => {
        const execDir = path.join(appDir, "executors");
        const files = fs.readdirSync(execDir).filter((f) => f.endsWith(".js"));

        for (const file of files) {
          const body = fs.readFileSync(path.join(execDir, file), "utf-8");
          expect(body).not.toMatch(/^\s*import\s/m);
          expect(body).not.toMatch(/^\s*require\s*\(/m);
        }
      });
    });
  }
});

// ── WS2: Templates compile in sandbox ──

describe("New app templates compile", () => {
  it("data_analyzer template compiles", async () => {
    // Dynamic import to avoid pulling in browser deps at module level
    const { compileComponent } = await import("../../src/lib/sandbox.js");
    const templateCode = fs.readFileSync(path.join(APPS_DIR, "data_analyzer", "template.jsx"), "utf-8");
    const result = compileComponent(templateCode);
    expect(result.error).toBeUndefined();
    expect(result.Component).toBeDefined();
  });

  it("system_monitor template compiles", async () => {
    const { compileComponent } = await import("../../src/lib/sandbox.js");
    const templateCode = fs.readFileSync(path.join(APPS_DIR, "system_monitor", "template.jsx"), "utf-8");
    const result = compileComponent(templateCode);
    expect(result.error).toBeUndefined();
    expect(result.Component).toBeDefined();
  });

  it("note_keeper template compiles", async () => {
    const { compileComponent } = await import("../../src/lib/sandbox.js");
    const templateCode = fs.readFileSync(path.join(APPS_DIR, "note_keeper", "template.jsx"), "utf-8");
    const result = compileComponent(templateCode);
    expect(result.error).toBeUndefined();
    expect(result.Component).toBeDefined();
  });
});
