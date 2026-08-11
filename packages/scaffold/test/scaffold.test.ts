import { describe, expect, it } from "vitest";
import { hqClient } from "@cfos-practice/core";
import { generateFiles } from "../src/generate.js";

describe("generateFiles", () => {
  const files = generateFiles(hqClient());
  const paths = files.map((f) => f.path);

  it("emits config, guide, gatekeeper scaffolds, skills, evals, ops docs, and a README", () => {
    expect(paths).toContain("deployment.jsonc");
    expect(paths).toContain("SETUP.md");
    expect(paths).toContain("packages/custom-gatekeeper/src/ghl.ts");
    expect(paths).toContain("packages/custom-gatekeeper/src/qbo.ts");
    expect(paths).toContain("skills/draft-personalized-repli.md");
    expect(paths).toContain("evals/platform.json");
    expect(paths).toContain("EVALS.md");
    expect(paths).toContain("METRICS.md");
    expect(paths).toContain("SECURITY-BASELINE.md");
    expect(paths).toContain("README.md");
  });

  it("emits workflow specs for cadenced pilots only", () => {
    const wf = paths.filter((p) => p.startsWith("workflows/"));
    expect(wf.sort()).toEqual(["workflows/draft-personalized-repli.md", "workflows/weekly-engagement-status.md"]);
  });

  it("emits the promptfoo harness alongside the eval suites", () => {
    const pf = files.find((f) => f.path === "evals/promptfooconfig.yaml")!;
    expect(pf).toBeTruthy();
    expect(pf.content).toContain("npx promptfoo eval");
    expect(pf.content).toContain("type: llm-rubric");
  });

  it("emits one eval suite per pilot plus the platform suite, all valid JSON", () => {
    const evalFiles = files.filter((f) => f.path.startsWith("evals/") && f.path.endsWith(".json"));
    expect(evalFiles).toHaveLength(5); // platform + 4 pilots
    for (const f of evalFiles) expect(() => JSON.parse(f.content)).not.toThrow();
  });

  it("security baseline inventories every granted system and names the approvers", () => {
    const sec = files.find((f) => f.path === "SECURITY-BASELINE.md")!;
    expect(sec.content).toContain("GoHighLevel");
    expect(sec.content).toContain("Cloudflare API");
    expect(sec.content).toContain("Payments / refunds | Adam (Principal)");
    expect(sec.content).toContain("Incident runbook");
  });

  it("metrics log carries the hours and dollar anchor", () => {
    const met = files.find((f) => f.path === "METRICS.md")!;
    expect(met.content).toContain("~51 hrs/month ≈ $3,060/month");
    expect(met.content).toContain("at $60/hr loaded");
  });

  it("only scaffolds custom BUILD systems — never stock or MCP-routed ones", () => {
    expect(paths.some((p) => p.includes("google.ts"))).toBe(false);
    expect(paths.some((p) => p.includes("cfapi.ts"))).toBe(false);
    expect(paths.some((p) => p.includes("stripe.ts"))).toBe(false); // HQ routes Stripe via MCP portal
  });

  it("threads approvers into the right scaffolds", () => {
    const qbo = files.find((f) => f.path.endsWith("qbo.ts"))!;
    expect(qbo.content).toContain("Adam (Principal)");
  });

  it("security baseline distinguishes portal-routed credentials", () => {
    const sec = files.find((f) => f.path === "SECURITY-BASELINE.md")!;
    expect(sec.content).toContain("| Stripe | Vendor MCP server OAuth (via MCP Server Portal)");
    expect(sec.content).toContain("Portal configuration (Cloudflare One)");
  });

  it("seeds one skill per pilot use case", () => {
    expect(paths.filter((p) => p.startsWith("skills/"))).toHaveLength(4);
  });

  it("skills come from the pilot set — every workflow spec references an emitted skill, no C-risk skill", () => {
    // Build a record with no manual pilots so skills fall to auto-selection.
    const c = hqClient();
    c.useCases = c.useCases.map((u) => ({ ...u, pilot: false }));
    c.useCases.push({ name: "wire money out", dept: "Fin", freq: 9, minutes: 90, people: 9, feas: 5, risk: "C", systems: [], pilot: false, cadence: "event" });
    const f = generateFiles(c);
    const skillStems = f.filter((x) => x.path.startsWith("skills/")).map((x) => x.path.replace("skills/", "").replace(".md", ""));
    // C-risk use case must NOT get a skill
    expect(skillStems.some((s) => s.startsWith("wire-money-out"))).toBe(false);
    // every workflow spec's referenced skill file exists
    for (const wf of f.filter((x) => x.path.startsWith("workflows/"))) {
      const ref = wf.content.match(/skills\/([a-z0-9-]+)\.md/)?.[1];
      expect(ref && skillStems.includes(ref)).toBeTruthy();
    }
  });

  it("disambiguates colliding slugs instead of overwriting", () => {
    const c = hqClient();
    // two names that slug identically
    c.useCases = [
      { name: "Weekly engagement status digest to active clients", dept: "A", freq: 4, minutes: 30, people: 1, feas: 5, risk: "B", systems: [], pilot: true, cadence: "weekly" },
      { name: "Weekly engagement status report for leadership team", dept: "B", freq: 4, minutes: 30, people: 1, feas: 5, risk: "B", systems: [], pilot: true, cadence: "weekly" },
    ];
    const skills = generateFiles(c).map((x) => x.path).filter((p) => p.startsWith("skills/"));
    expect(new Set(skills).size).toBe(skills.length); // no duplicate paths
    expect(skills.length).toBe(2);
  });

  it("SETUP.md contains the numbered guide with acceptance checks", () => {
    const setup = files.find((f) => f.path === "SETUP.md")!;
    expect(setup.content).toContain("## 1. Prepare your machine");
    expect(setup.content).toContain("**You know it worked when:**");
  });
});
