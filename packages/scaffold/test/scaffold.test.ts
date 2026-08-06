import { describe, expect, it } from "vitest";
import { hqClient } from "@cfos-practice/core";
import { generateFiles } from "../src/generate.js";

describe("generateFiles", () => {
  const files = generateFiles(hqClient());
  const paths = files.map((f) => f.path);

  it("emits config, guide, gatekeeper scaffolds, skills, and a README", () => {
    expect(paths).toContain("deployment.jsonc");
    expect(paths).toContain("SETUP.md");
    expect(paths).toContain("packages/custom-gatekeeper/src/ghl.ts");
    expect(paths).toContain("packages/custom-gatekeeper/src/qbo.ts");
    expect(paths).toContain("packages/custom-gatekeeper/src/stripe.ts");
    expect(paths).toContain("skills/draft-personalized-repli.md");
    expect(paths).toContain("README.md");
  });

  it("only scaffolds custom systems, never stock ones", () => {
    expect(paths.some((p) => p.includes("google.ts"))).toBe(false);
    expect(paths.some((p) => p.includes("cfapi.ts"))).toBe(false);
  });

  it("threads approvers into the right scaffolds", () => {
    const stripe = files.find((f) => f.path.endsWith("stripe.ts"))!;
    expect(stripe.content).toContain("Adam (Principal)");
  });

  it("seeds one skill per pilot use case", () => {
    expect(paths.filter((p) => p.startsWith("skills/"))).toHaveLength(4);
  });

  it("SETUP.md contains the numbered guide with acceptance checks", () => {
    const setup = files.find((f) => f.path === "SETUP.md")!;
    expect(setup.content).toContain("## 1. Prepare your machine");
    expect(setup.content).toContain("**You know it worked when:**");
  });
});
