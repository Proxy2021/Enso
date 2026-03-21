import { describe, expect, it } from "vitest";
import { getDomainEvolutionJob, getDomainEvolutionJobs, reportDomainGap } from "./domain-evolution.js";
import { inferToolTemplate } from "./native-tools/registry.js";

async function waitForJob(jobId: string, timeoutMs = 3000): Promise<NonNullable<ReturnType<typeof getDomainEvolutionJob>>> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = getDomainEvolutionJob(jobId);
    if (job && job.status !== "queued" && job.status !== "generating_blueprint") {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for domain evolution job: ${jobId}`);
}

describe("domain evolution pipeline", () => {
  it("dedupes matching domain gaps by fingerprint", () => {
    const signal = {
      cardId: "card-a",
      userMessage: "show me customer support tickets by priority",
      assistantText: "Support tickets grouped by severity.",
      data: { tickets: [], summary: { open: 3 } },
    };
    const id1 = reportDomainGap(signal);
    const id2 = reportDomainGap({ ...signal, cardId: "card-b" });
    expect(id2).toBe(id1);
  });

  it("auto-registers synthesized signatures and enables future inference", async () => {
    const id = reportDomainGap({
      cardId: "card-c",
      userMessage: "build me a travel itinerary planner app",
      assistantText: "Here is your itinerary overview.",
      data: {
        itinerary: [{ day: 1, city: "Tokyo" }],
        tripName: "Japan Spring",
        budget: 3200,
      },
    });
    const job = await waitForJob(id);
    expect(job.status).toBe("registered");
    expect(job.blueprint).toBeDefined();

    const inferred = inferToolTemplate({
      data: {
        itinerary: [{ day: 1, city: "Tokyo" }],
        tripName: "Japan Spring",
        budget: 3200,
      },
    });
    expect(inferred).toBeDefined();
    const matchesBlueprint = inferred?.toolFamily === job.blueprint?.toolFamily
      && inferred?.signatureId === job.blueprint?.signatureId;
    const matchesCanonical = inferred?.toolFamily === "travel_planner"
      && inferred?.signatureId === "itinerary_board";
    expect(matchesBlueprint || matchesCanonical).toBe(true);
  });

  it("exposes jobs through in-memory store", () => {
    const jobs = getDomainEvolutionJobs();
    expect(Array.isArray(jobs)).toBe(true);
    expect(jobs.length).toBeGreaterThan(0);
  });
});

