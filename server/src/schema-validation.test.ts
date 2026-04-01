/**
 * Schema Validation Tests — Sprint 17
 *
 * Validates all app.json tool parameter schemas for structural correctness.
 * Self-updating: new apps in server/apps/ are automatically included.
 *
 * This test would have prevented the Sprint 16 schema bomb where
 * batch_generate.scenes had type:"array" without an items field.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPS_DIR = path.join(__dirname, "..", "apps");

// ── Helper: recursively validate a JSON Schema node ──

interface SchemaViolation {
  path: string;
  rule: string;
  detail: string;
}

function validateSchemaNode(
  node: Record<string, unknown>,
  jsonPath: string,
  violations: SchemaViolation[],
): void {
  if (!node || typeof node !== "object") return;

  const type = node.type as string | undefined;

  // Rule 1: type:"array" MUST have an "items" field
  if (type === "array") {
    if (!node.items) {
      violations.push({
        path: jsonPath,
        rule: "array-requires-items",
        detail: `type:"array" at ${jsonPath} is missing the required "items" field`,
      });
    } else if (typeof node.items === "object") {
      validateSchemaNode(
        node.items as Record<string, unknown>,
        `${jsonPath}.items`,
        violations,
      );
    }
  }

  // Rule 2: type:"object" with "properties" MUST have those properties defined (not empty)
  if (type === "object" && node.properties !== undefined) {
    const props = node.properties as Record<string, unknown>;
    if (typeof props === "object" && props !== null) {
      for (const [propName, propSchema] of Object.entries(props)) {
        if (!propSchema || typeof propSchema !== "object") {
          violations.push({
            path: `${jsonPath}.properties.${propName}`,
            rule: "property-must-be-defined",
            detail: `Property "${propName}" at ${jsonPath} is null/undefined/non-object`,
          });
        } else {
          // Recurse into each property's schema
          validateSchemaNode(
            propSchema as Record<string, unknown>,
            `${jsonPath}.properties.${propName}`,
            violations,
          );
        }
      }
    }
  }

  // Rule 3: "required" fields MUST exist in "properties"
  if (
    type === "object" &&
    Array.isArray(node.required) &&
    node.properties &&
    typeof node.properties === "object"
  ) {
    const propNames = Object.keys(node.properties as Record<string, unknown>);
    for (const req of node.required as string[]) {
      if (!propNames.includes(req)) {
        violations.push({
          path: `${jsonPath}.required`,
          rule: "required-field-must-exist-in-properties",
          detail: `Required field "${req}" not found in properties at ${jsonPath}. Available: [${propNames.join(", ")}]`,
        });
      }
    }
  }

  // Rule 4: No empty description fields (must be non-empty string if present)
  if ("description" in node) {
    const desc = node.description;
    if (typeof desc !== "string" || desc.trim() === "") {
      violations.push({
        path: `${jsonPath}.description`,
        rule: "no-empty-description",
        detail: `Empty or non-string description at ${jsonPath}`,
      });
    }
  }
}

// ── Load all app.json files dynamically ──

function loadAllApps(): Array<{ family: string; appJson: Record<string, unknown> }> {
  const apps: Array<{ family: string; appJson: Record<string, unknown> }> = [];
  if (!fs.existsSync(APPS_DIR)) return apps;

  for (const dir of fs.readdirSync(APPS_DIR)) {
    const appJsonPath = path.join(APPS_DIR, dir, "app.json");
    if (fs.existsSync(appJsonPath)) {
      const content = fs.readFileSync(appJsonPath, "utf-8");
      apps.push({ family: dir, appJson: JSON.parse(content) });
    }
  }
  return apps;
}

// ── Tests ──

describe("App Schema Validation", () => {
  const apps = loadAllApps();

  it("should find at least 1 app to validate", () => {
    expect(apps.length).toBeGreaterThan(0);
  });

  for (const { family, appJson } of apps) {
    describe(`${family}/app.json`, () => {
      const spec = appJson.spec as Record<string, unknown> | undefined;
      const tools = (spec?.tools ?? []) as Array<Record<string, unknown>>;

      it("should have a valid spec with tools array", () => {
        expect(spec).toBeDefined();
        expect(Array.isArray(tools)).toBe(true);
        expect(tools.length).toBeGreaterThan(0);
      });

      for (const tool of tools) {
        const suffix = (tool.suffix as string) ?? "unknown";
        const params = tool.parameters as Record<string, unknown> | undefined;

        describe(`tool: ${suffix}`, () => {
          it("should have a parameters object", () => {
            expect(params).toBeDefined();
            expect(typeof params).toBe("object");
          });

          it("should have a non-empty description", () => {
            expect(typeof tool.description).toBe("string");
            expect((tool.description as string).trim().length).toBeGreaterThan(0);
          });

          it("should pass recursive schema validation", () => {
            if (!params) return;
            const violations: SchemaViolation[] = [];
            validateSchemaNode(
              params,
              `${family}.${suffix}.parameters`,
              violations,
            );

            if (violations.length > 0) {
              const report = violations
                .map((v) => `  [${v.rule}] ${v.detail}`)
                .join("\n");
              expect.fail(
                `Schema violations in ${family}/${suffix}:\n${report}`,
              );
            }
          });

          it("should have required fields that exist in properties", () => {
            if (!params) return;
            const required = params.required as string[] | undefined;
            const properties = params.properties as
              | Record<string, unknown>
              | undefined;
            if (!required || required.length === 0) return;

            expect(properties).toBeDefined();
            const propNames = Object.keys(properties ?? {});
            for (const req of required) {
              expect(propNames).toContain(req);
            }
          });
        });
      }
    });
  }
});
