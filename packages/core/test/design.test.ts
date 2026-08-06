import { describe, expect, it } from "vitest";
import { designModel, hostnameFor, scopeMarkdown, stagingFor } from "../src/design.js";
import { blankClient, hqClient } from "../src/seed.js";

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
  });

  it("classifies chosen systems into stock and custom", () => {
    const m = designModel(hqClient());
    expect(m.stock.map((s) => s.id).sort()).toEqual(["cfapi", "google"]);
    expect(m.custom.map((s) => s.id).sort()).toEqual(["ghl", "qbo", "stripe"]);
  });

  it("compresses discovery for small orgs and scales integration weeks with custom count", () => {
    const m = designModel(hqClient()); // size 3, 3 custom systems
    expect(m.discoveryWeeks).toBe(2);
    expect(m.intWeeks).toBe(5); // ceil(3 × 1.5)
    expect(m.weeks).toBe(2 + 1 + 5 + 3 + 3 + 2);
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
    expect(md).toContain("~51 hours/month");
    expect(md).toContain("| GoHighLevel (CRM · funnels · booking · payments) | Custom gatekeeper (OAuth SaaS REST) | 2 | 1–2 weeks |");
    expect(md).toContain("payments → Adam (Principal)");
  });

  it("marks unset approvers as TBD", () => {
    const c = blankClient("X Co");
    const md = scopeMarkdown(designModel(c), { date: "2026-08-06" });
    expect(md).toContain("payments → TBD");
  });
});
