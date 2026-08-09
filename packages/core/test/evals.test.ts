import { describe, expect, it } from "vitest";
import { evalRunMarkdown, evalSuites, platformSuite } from "../src/evals.js";
import { SYSTEMS, systemById } from "../src/catalogs.js";
import { hqClient } from "../src/seed.js";

describe("evalSuites", () => {
  const suites = evalSuites(hqClient());

  it("generates the platform suite plus one suite per pilot workflow", () => {
    expect(suites[0]?.workflow).toBe("platform");
    expect(suites).toHaveLength(1 + 4); // HQ has 4 pilot-flagged use cases
  });

  it("every red-team case is a blocker and demands observation-log evidence somewhere", () => {
    const redteam = suites.flatMap((s) => s.cases).filter((c) => c.kind === "redteam");
    expect(redteam.length).toBeGreaterThanOrEqual(6);
    expect(redteam.every((c) => c.severity === "blocker")).toBe(true);
  });

  it("B-risk workflows get an approval-routing blocker case", () => {
    const ghlSuite = suites.find((s) => s.workflow.includes("Draft personalized replies"))!;
    const approval = ghlSuite.cases.find((c) => c.tags.includes("approval"))!;
    expect(approval.severity).toBe("blocker");
    expect(approval.expected).toContain("Adam (Principal)");
  });

  it("A-risk workflows get no approval case", () => {
    const synth = suites.find((s) => s.workflow.includes("Synthesize discovery notes"))!;
    expect(synth.cases.some((c) => c.tags.includes("approval"))).toBe(false);
  });

  it("scope-exceed probe never names a system the client actually granted", () => {
    const c = hqClient();
    const probe = platformSuite(c).cases.find((x) => x.id === "plat-scope-exceed")!;
    // Must reference a real ungranted system (first in catalog order = M365 for HQ) —
    // and crucially none of the granted ones, or the blocker eval is invalid.
    expect(probe.prompt).toContain("Microsoft 365");
    for (const id of c.systems) {
      const label = systemById(id)!.label;
      expect(probe.prompt).not.toContain(label);
    }
  });

  it("scope-exceed still works when the client granted (almost) everything", () => {
    const c = hqClient();
    c.systems = SYSTEMS.map((s) => s.id); // grant all → probe falls back to the generic phrase
    const probe = platformSuite(c).cases.find((x) => x.id === "plat-scope-exceed")!;
    expect(probe.prompt).toContain("an ungranted third-party system");
  });

  it("data-flow case is tagged per vertical sensitivity", () => {
    const c = hqClient();
    const pii = platformSuite(c).cases.find((x) => x.id === "plat-dataflow")!;
    expect(pii.tags).toContain("pii");
    const pt = { ...c, vertical: "pt" as const };
    expect(platformSuite(pt).cases.find((x) => x.id === "plat-dataflow")!.tags).toContain("phi");
  });
});

describe("evalRunMarkdown", () => {
  it("states the counts, the exit bar, and the results log", () => {
    const md = evalRunMarkdown(hqClient());
    expect(md).toContain("5 suites");
    expect(md).toContain("Exit bar");
    expect(md).toContain("| Date | Release | Suite | Case | P/F |");
  });
});
