import { describe, expect, it } from "vitest";
import { suggestedPattern, workflowSpecMarkdown, workflowSpecs } from "../src/workflows.js";
import { designModel } from "../src/design.js";
import { hqClient } from "../src/seed.js";

describe("workflowSpecs", () => {
  const specs = workflowSpecs(hqClient());

  it("emits one spec per cadenced pilot (HQ: event lead-replies + weekly digest)", () => {
    expect(specs.map((s) => s.file).sort()).toEqual([
      "workflows/draft-personalized-repli.md",
      "workflows/weekly-engagement-status.md",
    ]);
  });

  it("event specs carry the webhook trigger and idempotency rule", () => {
    const ev = specs.find((s) => s.file.includes("draft-personalized"))!;
    expect(ev.markdown).toContain("webhook");
    expect(ev.markdown).toContain("Idempotency: same event id twice");
    expect(ev.markdown).toContain("Event-triggered kickoff (pattern 5)");
  });

  it("scheduled specs carry the cadence and digest pattern suggestion", () => {
    const wk = specs.find((s) => s.file.includes("weekly-engagement"))!;
    expect(wk.markdown).toContain("Schedule: weekly");
    expect(wk.markdown).toContain("Scheduled digest (pattern 1)");
  });

  it("threads the named approver by side-effect class", () => {
    const ev = specs.find((s) => s.file.includes("draft-personalized"))!;
    expect(ev.markdown).toContain("**Adam (Principal)**");
  });

  it("A-risk workflows state no approval and skip the approval eval line", () => {
    const c = hqClient();
    const scaffoldUc = designModel({ ...c, useCases: c.useCases.map((u) => ({ ...u, pilot: u.name.includes("Scaffold") })) }).pilots[0]!;
    const md = workflowSpecMarkdown(c, scaffoldUc);
    expect(md).toContain("none (read-only)");
    expect(md).not.toContain("Approval routing: the side effect waits");
  });
});

describe("suggestedPattern", () => {
  it("maps cadences to the pattern library", () => {
    expect(suggestedPattern("event")).toContain("pattern 5");
    expect(suggestedPattern("daily")).toContain("pattern 4");
    expect(suggestedPattern("weekly")).toContain("pattern 1");
    expect(suggestedPattern("demand")).toContain("no Workflow needed");
  });
});
