import { describe, expect, it } from "vitest";
import { complianceMarkdown, complianceProfiles, complianceSummary } from "../src/compliance.js";
import { blankClient, hqClient } from "../src/seed.js";
import type { VerticalId } from "../src/types.js";

describe("complianceProfiles", () => {
  it("maps each vertical to the right framework", () => {
    const fw = (v: VerticalId) => complianceProfiles({ ...blankClient("X"), vertical: v })[0]!.framework;
    expect(fw("pt")).toContain("HIPAA");
    expect(fw("finserv")).toContain("Investment Advisers Act");
    expect(fw("law")).toContain("Professional Conduct");
    expect(fw("salesmkt")).toContain("consumer privacy");
    expect(fw("manufacturing")).toContain("export control");
    expect(fw("agency")).toContain("processor");
    expect(fw("other")).toContain("Baseline");
  });

  it("every item carries a requirement, a citation, and a concrete control", () => {
    for (const v of ["pt", "finserv", "law", "salesmkt", "manufacturing", "agency", "other"] as VerticalId[]) {
      const p = complianceProfiles({ ...blankClient("X"), vertical: v })[0]!;
      expect(p.items.length).toBeGreaterThanOrEqual(3);
      for (const it of p.items) {
        expect(it.requirement.length).toBeGreaterThan(3);
        expect(it.citation.length).toBeGreaterThan(2);
        expect(it.control.length).toBeGreaterThan(10);
      }
      expect(p.attestations.length).toBeGreaterThan(0);
    }
  });

  it("HIPAA profile cites the real minimum-necessary and audit-controls sections", () => {
    const p = complianceProfiles({ ...blankClient("Clinic"), vertical: "pt" })[0]!;
    const cites = p.items.map((i) => i.citation).join(" ");
    expect(cites).toContain("§164.514"); // minimum necessary
    expect(cites).toContain("§164.312(b)"); // audit controls
    expect(cites).toContain("§164.502(e)"); // BAA
  });
});

describe("complianceSummary", () => {
  it("returns framework, scope, and item count", () => {
    const s = complianceSummary({ ...blankClient("X"), vertical: "pt" });
    expect(s.framework).toContain("HIPAA");
    expect(s.count).toBeGreaterThanOrEqual(6);
  });
});

describe("complianceMarkdown", () => {
  it("leads with the not-legal-advice disclaimer and renders the mapping table", () => {
    const md = complianceMarkdown({ ...hqClient(), vertical: "pt", itOwner: "Dr. Chen", sponsor: "Maria" });
    expect(md).toContain("NOT legal advice");
    expect(md).toContain("| Requirement | Citation | How this deployment satisfies it |");
    expect(md).toContain("Minimum necessary");
    // attestations thread the named owners
    expect(md).toContain("owner: Dr. Chen / Maria");
    expect(md).toContain("Human sign-offs");
  });
});
