import { describe, expect, it } from "vitest";
import { buildGuideMarkdown, buildSteps, deploymentJsonc } from "../src/build-guide.js";
import { blankClient, hqClient } from "../src/seed.js";
import type { ClientRecord } from "../src/types.js";

function hybridClient(): ClientRecord {
  const c = hqClient();
  c.inferenceMode = "hybrid";
  c.selfHosted = [{ name: "Llama-3.3-70B — client DC", engine: "vllm", drivers: ["residency", "cost"], existing: false }];
  return c;
}

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
      "email",
      "webhooks", // HQ has GHL + event-cadence workflows → webhook ingress step
      "hardening",
      "mcpcheck",
      "sys-google",
      "sys-cfapi",
      "sys-qbo",
      "mcp-stripe", // HQ routes Stripe through an MCP Server Portal — config step, not a build
      "sys-ghl",
      "aisearch", // HQ inventories SOP-type knowledge → AI Search instance step
      "knowledge",
      "pilotready",
    ]);
  });

  it("webhooks and aisearch steps are conditional; email and hardening are always present", () => {
    const bare = buildSteps(blankClient("X")).map((s) => s.id);
    expect(bare).toContain("email");
    expect(bare).toContain("hardening");
    expect(bare).not.toContain("webhooks");
    expect(bare).not.toContain("aisearch");
  });

  it("hardening escalates log retention to REQUIRED for regulated verticals", () => {
    const pt = { ...hqClient(), vertical: "pt" as const };
    expect(buildSteps(pt).find((s) => s.id === "hardening")!.body).toContain("REQUIRED for this vertical");
    const agency = buildSteps(hqClient()).find((s) => s.id === "hardening")!;
    expect(agency.body).toContain("recommended; regulated clients treat it as required");
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
    expect(md).toContain("## 21. Pilot readiness — final gate");
    expect(md.match(/> \*\*You know it worked when:\*\*/g)).toHaveLength(21);
  });
});

describe("self-hosted inference build steps", () => {
  it("adds serve/tunnel/route steps only for hybrid clients, right after the gateway step", () => {
    const cloud = buildSteps(hqClient()).map((s) => s.id);
    expect(cloud).not.toContain("selfhost");

    const ids = buildSteps(hybridClient()).map((s) => s.id);
    expect(ids).toContain("selfhost");
    expect(ids).toContain("selfhost-tunnel");
    expect(ids).toContain("selfhost-route");
    expect(ids.indexOf("selfhost")).toBe(ids.indexOf("gateway") + 1);
  });

  it("emits the vLLM serve command + LMCache note and driver-derived routing", () => {
    const steps = buildSteps(hybridClient());
    const serve = steps.find((s) => s.id === "selfhost");
    expect(serve?.code).toContain("vllm serve");
    expect(serve?.code).toContain("LMCache");
    const route = steps.find((s) => s.id === "selfhost-route");
    expect(route?.body).toContain("no per-token API fees"); // cost driver → routing rule
    expect(route?.body).toContain("dynamic/"); // wired into the same Dynamic Route
  });

  it("skips the stand-up command when the endpoint already exists", () => {
    const c = hybridClient();
    c.selfHosted = [{ name: "Client vLLM", engine: "vllm", drivers: ["residency"], existing: true }];
    const serve = buildSteps(c).find((s) => s.id === "selfhost");
    expect(serve?.code).toBeUndefined();
    expect(serve?.body).toContain("Confirm the existing endpoint");
  });
});
