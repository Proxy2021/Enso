import { describe, expect, it } from "vitest";
import {
  detectToolTemplateForToolName,
  getToolTemplateCode,
  getToolTemplate,
  inferToolTemplate,
  isToolActionCovered,
  normalizeDataForToolTemplate,
} from "./native-tools/registry";

describe("tool-driven follow-up path", () => {
  it("detects known tool-family signatures", () => {
    const signature = detectToolTemplateForToolName("alpharank_latest_predictions");
    expect(signature?.toolFamily).toBe("alpharank");
    expect(signature?.signatureId).toBe("ranked_predictions_table");
  });

  it("maps AlphaRank regime and portfolio tools to dedicated signatures", () => {
    const regime = detectToolTemplateForToolName("alpharank_market_regime");
    const portfolio = detectToolTemplateForToolName("alpharank_portfolio_checkin");
    expect(regime?.signatureId).toBe("market_regime_snapshot");
    expect(portfolio?.signatureId).toBe("portfolio_health");
  });

  it("infers tool template from data when tool name is absent", () => {
    const signature = inferToolTemplate({ data: {
      items: [
        { name: "Github", type: "directory" },
        { name: "notes.txt", type: "file" },
      ],
    } });
    expect(signature?.toolFamily).toBe("filesystem");
    expect(signature?.signatureId).toBe("directory_listing");
  });

  it("infers filesystem template from desktop-style files payload", () => {
    const signature = inferToolTemplate({
      data: {
        files: [
          { name: "Github", type: "directory" },
          { name: "fingerprint.jpg", type: "file", extension: "jpg" },
        ],
      },
    });
    expect(signature?.toolFamily).toBe("filesystem");
    expect(signature?.signatureId).toBe("directory_listing");
  });

  it("reports action coverage and normalizes data shape", () => {
    const signature = getToolTemplate("plugin_discovery", "plugin_catalog_list");
    expect(signature).toBeDefined();
    expect(isToolActionCovered(signature!, "search_plugins")).toBe(true);
    expect(isToolActionCovered(signature!, "unknown_action")).toBe(false);

    const normalized = normalizeDataForToolTemplate(signature!, {
      plugins: [{ pluginId: "alpharank", tools: ["alpharank_latest_predictions"] }],
    });
    expect(Array.isArray(normalized.rows)).toBe(true);
    expect(normalized.totalPlugins).toBe(1);
  });

  it("normalizes filesystem files payload into template rows", () => {
    const signature = getToolTemplate("filesystem", "directory_listing");
    expect(signature).toBeDefined();
    const normalized = normalizeDataForToolTemplate(signature!, {
      files: [{ name: "Desktop", type: "directory" }],
    });
    expect(Array.isArray(normalized.rows)).toBe(true);
    expect((normalized.rows as Array<unknown>).length).toBe(1);
  });

  it("renders deterministic template code for covered signatures", () => {
    const signature = getToolTemplate("tool_inspector", "tool_run_summary");
    expect(signature).toBeDefined();
    const code = getToolTemplateCode(signature!);
    expect(code).toContain("export default function GeneratedUI");
    expect(code).toContain("Tool mode");
  });

  it("renders dedicated AlphaRank predictions template", () => {
    const signature = getToolTemplate("alpharank", "ranked_predictions_table");
    expect(signature).toBeDefined();
    const code = getToolTemplateCode(signature!);
    expect(code).toContain("Prediction Command Center");
    expect(code).toContain("ticker_detail");
  });

  it("renders dedicated workspace and media templates", () => {
    const workspaceSig = getToolTemplate("code_workspace", "workspace_inventory");
    const mediaSig = getToolTemplate("multimedia", "media_gallery");
    expect(workspaceSig).toBeDefined();
    expect(mediaSig).toBeDefined();
    const workspaceCode = getToolTemplateCode(workspaceSig!);
    const mediaCode = getToolTemplateCode(mediaSig!);
    expect(workspaceCode).toContain("Workspace Studio");
    expect(mediaCode).toContain("Media Library Explorer");
  });

  it("maps travel and meal tools to dedicated templates", () => {
    const travel = detectToolTemplateForToolName("enso_travel_plan_trip");
    const meal = detectToolTemplateForToolName("enso_meal_plan_week");
    expect(travel?.toolFamily).toBe("travel_planner");
    expect(meal?.toolFamily).toBe("meal_planner");

    const travelCode = getToolTemplateCode(travel!);
    const mealCode = getToolTemplateCode(meal!);
    expect(travelCode).toContain("Travel Planner Studio");
    expect(mealCode).toContain("Meal Planning Lab");
  });

  it("auto-registers generic templates for unknown runtime tool families", () => {
    const key = Symbol.for("openclaw.pluginRegistryState");
    const globalRecord = globalThis as Record<symbol, unknown>;
    const previous = globalRecord[key];
    globalRecord[key] = {
      registry: {
        tools: [
          {
            pluginId: "official_mail",
            names: ["official_mail_list_threads", "official_mail_read_thread", "official_mail_archive_thread"],
            optional: false,
            source: "test",
            factory: () => [
              {
                name: "official_mail_list_threads",
                description: "List mail threads.",
                parameters: { type: "object", properties: {} },
                execute: async () => ({ content: [{ type: "text", text: "{}" }] }),
              },
              {
                name: "official_mail_read_thread",
                description: "Read a thread by id.",
                parameters: { type: "object", properties: { id: { type: "string" } } },
                execute: async () => ({ content: [{ type: "text", text: "{}" }] }),
              },
              {
                name: "official_mail_archive_thread",
                description: "Archive one thread by id.",
                parameters: { type: "object", properties: { id: { type: "string" } } },
                execute: async () => ({ content: [{ type: "text", text: "{}" }] }),
              },
            ],
          },
        ],
      },
    };

    const signature = detectToolTemplateForToolName("official_mail_read_thread");
    expect(signature).toBeDefined();
    expect(signature?.toolFamily).toBe("system_official_mail");
    expect(signature?.signatureId.startsWith("system_auto_")).toBe(true);
    expect(isToolActionCovered(signature!, "read_thread")).toBe(true);
    const code = getToolTemplateCode(signature!);
    expect(code).toContain("System Toolkit");

    globalRecord[key] = previous;
  });
});
