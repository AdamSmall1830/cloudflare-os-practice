import { describe, expect, it } from "vitest";
import { buildGuideMarkdown, buildSteps, deploymentJsonc } from "../src/build-guide.js";
import { blankClient, hqClient } from "../src/seed.js";

describe("buildSteps", () => {
  it("generates the HQ guide with system steps in wave order", () => {
    const ids = buildSteps(hqClient()).map((s) => s.id);
    expect(ids).toEqual([
      "prereq",
      "account",
      "zone",
      "access",
      "clone",
      "config",
      "deploy",
      "gateway",
      "brand",
      "mcpcheck",
      "sys-google",
      "sys-cfapi",
      "sys-qbo",
      "mcp-stripe", // HQ routes Stripe through an MCP Server Portal — config step, not a build
      "sys-ghl",
      "knowledge",
      "pilotready",
    ]);
  });

  it("MCP-routed systems get a portal step instead of a gatekeeper build", () => {
    const step = buildSteps(hqClient()).find((s) => s.id === "mcp-stripe")!;
    expect(step.title).toBe("Connect Stripe via MCP Server Portal");
    expect(step.body).toContain("AI controls → MCP servers");
    expect(step.code).toBeUndefined();
    const unrouted = { ...hqClient(), mcpRoutes: {} };
    expect(buildSteps(unrouted).map((s) => s.id)).toContain("sys-stripe");
  });

  it("knowledge step enumerates the inventoried sources with routing", () => {
    const step = buildSteps(hqClient()).find((s) => s.id === "knowledge")!;
    expect(step.body).toContain("Delivery playbook (12 sections)");
    expect(step.body).toContain("R2 + AI Search");
    expect(step.body).toContain("load as document/slide templates");
  });

  it("branches the sign-in step by idp choice", () => {
    const google = { ...hqClient(), idp: "google" as const };
    expect(buildSteps(google).map((s) => s.id)).toContain("gauth");
    const pw = { ...hqClient(), idp: "password" as const };
    expect(buildSteps(pw).map((s) => s.id)).toContain("pwwarn");
  });

  it("threads the domain into hostnames, and placeholders when unset", () => {
    const c = { ...hqClient(), domain: "smallfamilyllc.com" };
    const zone = buildSteps(c).find((s) => s.id === "zone")!;
    expect(zone.title).toContain("os.smallfamilyllc.com");
    const bare = buildSteps(blankClient("X")).find((s) => s.id === "zone")!;
    expect(bare.title).toContain("os.CLIENT-DOMAIN.com");
  });

  it("threads approvers into gatekeeper scaffolds", () => {
    const qbo = buildSteps(hqClient()).find((s) => s.id === "sys-qbo")!;
    expect(qbo.code).toContain("Adam (Principal)");
  });
});

describe("deploymentJsonc", () => {
  it("fills known values and placeholders for unknown ones", () => {
    const c = { ...hqClient(), domain: "smallfamilyllc.com", accountId: "abc123" };
    const j = deploymentJsonc(c);
    expect(j).toContain('"accountId": "abc123"');
    expect(j).toContain('"hostname": "os.smallfamilyllc.com"');
    expect(j).toContain('"workerName": "our-firm-cloudflare-os-h-os"'); // slug caps at 24 chars
    expect(j).toContain("<PASTE AUD TAG — Access step>");
  });
});

describe("buildGuideMarkdown", () => {
  it("renders every step with numbering and acceptance checks", () => {
    const md = buildGuideMarkdown(hqClient());
    expect(md).toContain("## 1. Prepare your machine");
    expect(md).toContain("## 17. Pilot readiness — final gate");
    expect(md.match(/> \*\*You know it worked when:\*\*/g)).toHaveLength(17);
  });
});
