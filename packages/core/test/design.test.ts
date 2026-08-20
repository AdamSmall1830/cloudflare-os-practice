import { describe, expect, it } from "vitest";
import { designModel, ecosystemModel, hostnameFor, inferencePlan, scopeMarkdown, stagingFor } from "../src/design.js";
import { blankClient, hqClient } from "../src/seed.js";
import type { SelfHostedModel } from "../src/types.js";

describe("designModel", () => {
  it("uses manual pilot flags when present", () => {
    const m = designModel(hqClient());
    expect(m.autoSuggested).toBe(false);
    expect(m.pilots.every((u) => u.pilot)).toBe(true);
  });

  it("auto-suggests top 5 by score with C-risk excluded when nothing is flagged", () => {
    const c = hqClient();
    c.useCases = c.useCases.map((u) => ({ ...u, pilot: false }));
    c.useCases.push({ name: "danger", dept: "", freq: 99, minutes: 99, people: 9, feas: 5, risk: "C", systems: [], pilot: false });
    const m = designModel(c);
    expect(m.autoSuggested).toBe(true);
    expect(m.pilots).toHaveLength(5);
    expect(m.pilots.some((u) => u.risk === "C")).toBe(false);
    expect(m.noEligiblePilots).toBe(false);
  });

  it("flags noEligiblePilots and warns in the scope doc when every use case is tier C", () => {
    const c = blankClient("All Risk Co");
    c.useCases = [
      { name: "wire funds", dept: "Fin", freq: 5, minutes: 20, people: 1, feas: 4, risk: "C", systems: [], pilot: false },
      { name: "file filing", dept: "Legal", freq: 2, minutes: 40, people: 1, feas: 3, risk: "C", systems: [], pilot: false },
    ];
    const m = designModel(c);
    expect(m.pilots).toHaveLength(0);
    expect(m.noEligiblePilots).toBe(true);
    expect(scopeMarkdown(m, { date: "2026-08-09" })).toContain("No eligible pilot workflows");
  });

  it("classifies chosen systems into stock and custom", () => {
    const m = designModel(hqClient());
    expect(m.stock.map((s) => s.id).sort()).toEqual(["cfapi", "google"]);
    expect(m.custom.map((s) => s.id).sort()).toEqual(["ghl", "qbo", "stripe"]);
  });

  it("compresses discovery for small orgs and scales integration weeks with the BUILD count", () => {
    const m = designModel(hqClient()); // size 3; 3 custom systems but Stripe is MCP-routed → 2 builds
    expect(m.discoveryWeeks).toBe(2);
    expect(m.intWeeks).toBe(3); // ceil(2 × 1.5)
    expect(m.weeks).toBe(2 + 1 + 3 + 3 + 3 + 2);
  });

  it("splits custom systems into MCP-routed and custom-build", () => {
    const m = designModel(hqClient());
    expect(m.mcpRouted.map((s) => s.id)).toEqual(["stripe"]);
    expect(m.customBuild.map((s) => s.id).sort()).toEqual(["ghl", "qbo"]);
    const unrouted = designModel({ ...hqClient(), mcpRoutes: {} });
    expect(unrouted.mcpRouted).toHaveLength(0);
    expect(unrouted.intWeeks).toBe(5); // all 3 back to builds → ceil(3 × 1.5)
  });

  it("collects scheduled/event pilots into the Workflows plan", () => {
    const m = designModel(hqClient());
    expect(m.workflows.map((u) => u.cadence).sort()).toEqual(["event", "weekly"]);
  });

  it("derives hostnames with a placeholder until the domain is known", () => {
    expect(hostnameFor({ domain: "" })).toBe("os.CLIENT-DOMAIN.com");
    expect(hostnameFor({ domain: "acme.com" })).toBe("os.acme.com");
    expect(stagingFor({ domain: "acme.com" })).toBe("os-staging.acme.com");
  });
});

describe("scopeMarkdown", () => {
  it("renders a deterministic proposal document", () => {
    const md = scopeMarkdown(designModel(hqClient()), { date: "2026-08-06" });
    expect(md).toContain("# Our Firm — Cloudflare OS HQ — Cloudflare OS Deployment: Proposed Scope");
    expect(md).toContain("~51 hours/month ≈ $3,060/month** at a $60/hr loaded rate");
    expect(md).toContain("| GoHighLevel (CRM · funnels · booking · payments) | Custom gatekeeper (OAuth SaaS REST) | 2 | 1–2 weeks |");
    expect(md).toContain("| Stripe | Vendor MCP server via MCP Server Portal | 2 | 0.5–1 day (portal config) |");
    expect(md).toContain("## Automation (platform Workflows)");
    expect(md).toContain("## Knowledge & retrieval plan");
    expect(md).toContain("R2 + AI Search");
    expect(md).toContain("payments → Adam (Principal)");
  });

  it("marks unset approvers as TBD", () => {
    const c = blankClient("X Co");
    const md = scopeMarkdown(designModel(c), { date: "2026-08-06" });
    expect(md).toContain("payments → TBD");
  });

  it("includes the assembled AI-ecosystem summary", () => {
    const md = scopeMarkdown(designModel(hqClient()), { date: "2026-08-06" });
    expect(md).toContain("## Your AI ecosystem");
    expect(md).toContain("**Your methods**");
    expect(md).toContain("**Your knowledge**");
    expect(md).toContain("**Your live systems**");
    expect(md).toContain("an agent + workspace for every person");
  });
});

describe("ecosystemModel", () => {
  it("assembles three layers from captured methods, knowledge, and systems", () => {
    const eco = ecosystemModel(designModel(hqClient()));
    expect(eco.layers.map((l) => l.id)).toEqual(["methods", "knowledge", "systems"]);
    const [methods, knowledge, systems] = eco.layers;
    expect(methods.items.length).toBeGreaterThan(0); // pilot workflows → Skills
    expect(knowledge.items).toContain("Delivery playbook (12 sections)");
    expect(knowledge.route).toContain("R2 + AI Search"); // has SOPs → indexed retrieval
    expect(systems.items).toContain("GoHighLevel"); // label head, "(CRM …)" stripped
  });

  it("frames governance from the client's account, sign-in, and approvers", () => {
    const eco = ecosystemModel(designModel(hqClient()));
    const gov = eco.governance.join(" ");
    expect(gov).toContain("own Cloudflare account");
    expect(gov).toContain("observation trail");
    expect(gov).toContain("payments → Adam (Principal)");
    expect(eco.outputs).toContain("in your voice, from your facts");
  });

  it("stays honest about gaps: flags empty layers, and curation once a hoard exists", () => {
    const blank = ecosystemModel(designModel(blankClient("X Co")));
    expect(blank.gaps.some((g) => g.includes("No pilot methods"))).toBe(true);
    expect(blank.gaps.some((g) => g.includes("No knowledge sources"))).toBe(true);
    expect(blank.gaps.some((g) => g.includes("No live systems"))).toBe(true);

    const hq = ecosystemModel(designModel(hqClient()));
    expect(hq.gaps.some((g) => g.includes("No knowledge sources"))).toBe(false);
    expect(hq.gaps.some((g) => g.toLowerCase().includes("curation"))).toBe(true);
  });

  it("adds a self-hosted governance bullet when inference is hybrid", () => {
    const c = hqClient();
    c.inferenceMode = "hybrid";
    c.selfHosted = [{ name: "Local-70B", engine: "vllm", drivers: ["residency"], existing: false }];
    const gov = ecosystemModel(designModel(c)).governance.join(" ");
    expect(gov).toContain("sensitive inference stays on client-operated models");
    expect(gov).toContain("Local-70B");
  });
});

describe("inferencePlan", () => {
  const withSelfHost = (mode: "hybrid" | "self-hosted", selfHosted: SelfHostedModel[]) => {
    const c = hqClient();
    c.inferenceMode = mode;
    c.selfHosted = selfHosted;
    return c;
  };

  it("is pure-cloud by default", () => {
    const inf = inferencePlan(hqClient());
    expect(inf.hybrid).toBe(false);
    expect(inf.cloudTier).toBe(true);
    expect(inf.routing).toHaveLength(0);
    expect(inf.selfHosted).toHaveLength(0);
  });

  it("derives one routing rule per driver, keeping the cloud tier in hybrid mode", () => {
    const inf = inferencePlan(withSelfHost("hybrid", [{ name: "Local-70B", engine: "vllm", drivers: ["residency", "cost"], existing: false }]));
    expect(inf.hybrid).toBe(true);
    expect(inf.cloudTier).toBe(true);
    expect(inf.routing.map((r) => r.model)).toEqual(["Local-70B", "Local-70B"]);
    expect(inf.routing.some((r) => r.rule.includes("never leave client infrastructure"))).toBe(true);
    expect(inf.routing.some((r) => r.rule.includes("no per-token API fees"))).toBe(true);
  });

  it("drops the cloud tier and warns to size for peak when fully self-hosted", () => {
    const inf = inferencePlan(withSelfHost("self-hosted", [{ name: "Local", engine: "vllm", drivers: ["offline"], existing: false }]));
    expect(inf.cloudTier).toBe(false);
    expect(inf.notes.some((n) => n.includes("no burst-to-cloud"))).toBe(true);
  });

  it("notes an unspecified endpoint and Ollama's throughput ceiling", () => {
    expect(inferencePlan(withSelfHost("hybrid", [])).notes.some((n) => n.includes("no client-hosted endpoint"))).toBe(true);
    const ollama = inferencePlan(withSelfHost("hybrid", [{ name: "Ollama box", engine: "ollama", drivers: ["latency"], existing: true }]));
    expect(ollama.notes.some((n) => n.includes("vLLM"))).toBe(true);
  });

  it("surfaces the topology in the scope document", () => {
    const c = withSelfHost("hybrid", [{ name: "Local-70B", engine: "vllm", drivers: ["residency"], existing: false }]);
    const md = scopeMarkdown(designModel(c), { date: "2026-08-20" });
    expect(md).toContain("## Inference topology");
    expect(md).toContain("Local-70B");
    expect(md).toContain("AI Gateway");
  });
});

describe("ROI rate handling", () => {
  it("computes totalValue = totalHrs × rate on the HQ record", () => {
    const m = designModel(hqClient());
    expect(m.hourlyRate).toBe(60);
    expect(m.totalValue).toBe(m.totalHrs * 60);
  });

  it("falls back to $50 for zero, negative, missing, or garbage rates", () => {
    for (const bad of [0, -20, undefined, NaN, "nope"]) {
      const c = { ...hqClient(), hourlyRate: bad as number };
      const m = designModel(c);
      expect(m.hourlyRate).toBe(50);
      expect(m.totalValue).toBe(m.totalHrs * 50);
    }
  });

  it("rounds fractional rates and keeps values non-negative", () => {
    const m = designModel({ ...hqClient(), hourlyRate: 62.5 });
    expect(m.hourlyRate).toBe(63);
    expect(m.totalValue).toBeGreaterThan(0);
  });
});
