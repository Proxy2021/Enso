import { describe, it, expect } from "vitest";
import { quickClassify, qualityGate } from "./task-router.js";

describe("quickClassify", () => {
  // QC-01: Short greeting → simple
  it("classifies short greeting as simple", () => {
    const result = quickClassify("hi there");
    expect(result).not.toBeNull();
    expect(result!.complexity).toBe("simple");
  });

  // QC-02: Short neutral → simple
  it("classifies short neutral message as simple", () => {
    const result = quickClassify("cool thanks");
    expect(result).not.toBeNull();
    expect(result!.complexity).toBe("simple");
  });

  // QC-03: Short action → null (defer to LLM)
  it("defers short action command to LLM", () => {
    const result = quickClassify("fix the server");
    expect(result).toBeNull();
  });

  // QC-04: Short question → null (defer to LLM)
  it("defers short question to LLM", () => {
    const result = quickClassify("how does DNS work");
    expect(result).toBeNull();
  });

  // QC-05: Explicit research keyword → research
  it("classifies explicit research keyword as research", () => {
    const result = quickClassify("research quantum computing");
    expect(result).not.toBeNull();
    expect(result!.complexity).toBe("research");
    expect(result!.researchTopic).toBe("quantum computing");
  });

  // QC-06: VS comparison → research
  it("classifies short vs comparison as research", () => {
    const result = quickClassify("React vs Vue");
    expect(result).not.toBeNull();
    expect(result!.complexity).toBe("research");
    expect(result!.researchDepth).toBe("quick");
  });

  // QC-07: Longer greeting → simple
  it("classifies longer greeting as simple", () => {
    const result = quickClassify("hello how are you doing today");
    expect(result).not.toBeNull();
    expect(result!.complexity).toBe("simple");
  });

  // QC-08: Compare query → defers to LLM (content creation signal detected)
  it("defers compare query to LLM", () => {
    const result = quickClassify("compare AWS Lambda with Azure Functions");
    // "compare" matches contentCreationSignals, no execution signals → null (LLM decides)
    expect(result).toBeNull();
  });

  // QC-09: Creative generation → simple
  it("classifies creative generation as simple", () => {
    const result = quickClassify("generate 10 tagline ideas for a sustainability brand");
    expect(result).not.toBeNull();
    expect(result!.complexity).toBe("simple");
  });

  // QC-10: Technical explanation → defers to LLM (question-word prefix detected)
  it("defers technical explanation to LLM", () => {
    const result = quickClassify("explain how React hooks work");
    // "explain" matches question-word check → null (LLM decides, likely simple)
    expect(result).toBeNull();
  });

  // QC-11: CJK text with research keyword → research
  it("classifies CJK research text as research", () => {
    const result = quickClassify("研究人工智能");
    expect(result).not.toBeNull();
    expect(result!.complexity).toBe("research");
  });

  // QC-12: Best-of query → research
  it("classifies best-of query as research", () => {
    const result = quickClassify("the best project management tools for remote teams");
    expect(result).not.toBeNull();
    expect(result!.complexity).toBe("research");
  });
});

describe("qualityGate", () => {
  it("passes a well-structured answer", () => {
    const answer = "## React Hooks Overview\n\nReact hooks are functions that let you use state and lifecycle features in functional components.\n\n- **useState** — manages component state\n- **useEffect** — handles side effects\n- **useContext** — accesses context values\n\nHooks were introduced in React 16.8 and have become the standard way to write React components.";
    const result = qualityGate(answer, "explain React hooks");
    expect(result.pass).toBe(true);
  });

  it("fails a too-short answer", () => {
    const result = qualityGate("React hooks are functions.", "explain how React hooks work in detail");
    expect(result.pass).toBe(false);
    expect(result.reason).toBe("too_short");
  });

  it("fails template output with placeholders", () => {
    const answer = "## Q1 Report\n\nRevenue grew by [X]% compared to last quarter. The team delivered strong results across all key performance indicators and strategic initiatives. Our customer acquisition cost decreased significantly while retention rates improved across all segments.\n\n- Initiative: [NAME OF INITIATIVE]\n- Target: [INSERT TARGET HERE]\n\nOverall performance was strong with several key wins across the organization.";
    const result = qualityGate(answer, "write executive summary");
    expect(result.pass).toBe(false);
    expect(result.reason).toBe("template_detected");
  });

  it("fails unstructured answer to complex question", () => {
    const answer = "There are many options to consider when choosing a CRM platform for your startup. Each platform has its own strengths and weaknesses depending on your specific needs and budget. You should evaluate them based on pricing, features, integrations, ease of use, and scalability to find the best fit for your team.";
    const result = qualityGate(answer, "compare Salesforce vs HubSpot vs Pipedrive for a small startup team");
    expect(result.pass).toBe(false);
    expect(result.reason).toBe("no_substance");
  });

  it("passes a long structured comparison", () => {
    const answer = "## CRM Comparison\n\n| Feature | Salesforce | HubSpot | Pipedrive |\n|---------|-----------|---------|----------|\n| Pricing | $25/user | Free tier | $15/user |\n| Ease of Use | Complex | Easy | Easy |\n| Integrations | 3000+ | 1000+ | 400+ |\n| Best For | Enterprise | SMB | Sales teams |\n\n### Recommendation\nFor a small startup, HubSpot offers the best value with its free tier and easy setup.";
    const result = qualityGate(answer, "compare CRM platforms");
    expect(result.pass).toBe(true);
  });
});
