import { describe, expect, it } from "vitest";
import { aiPrompt, parseAiSuggestions } from "../src/ai.js";
import { hqClient } from "../src/seed.js";

describe("aiPrompt", () => {
  it("embeds interviews, inbox, allowed system ids, and existing names", () => {
    const p = aiPrompt(hqClient());
    expect(p).toContain("## Interviews");
    expect(p).toContain("ghl = GoHighLevel");
    expect(p).toContain("Draft personalized replies to new GHL leads");
    expect(p).toContain("Respond with ONLY a JSON array");
  });
});

describe("parseAiSuggestions", () => {
  const existing = [{ name: "Weekly engagement status digest to active clients" }];

  it("strips fences and prose, clamps values, filters bad systems, dedupes", () => {
    const raw = `Here you go:\n\`\`\`json\n[
      {"name":"Insurance re-verification batch","dept":"Front desk","freq":6,"minutes":30,"people":2,"feas":4,"risk":"B","systems":["webpt","clearing"]},
      {"name":"Weekly engagement status digest to active clients","dept":"X","freq":1,"minutes":1,"people":1,"feas":1,"risk":"A","systems":[]},
      {"nope":true},
      {"name":"Payer-mix report","dept":"Billing","freq":900,"minutes":-5,"people":0,"feas":9,"risk":"Z","systems":["webpt","notAReal"]}
    ]\n\`\`\``;
    const r = parseAiSuggestions(raw, existing);
    expect(r.added).toBe(2);
    expect(r.skipped).toBe(2);
    const clamped = r.useCases[1]!;
    expect(clamped.freq).toBe(500);
    expect(clamped.minutes).toBe(0);
    expect(clamped.people).toBe(1);
    expect(clamped.feas).toBe(5);
    expect(clamped.risk).toBe("B");
    expect(clamped.systems).toEqual(["webpt"]);
  });

  it("dedupes within a single response too", () => {
    const r = parseAiSuggestions('[{"name":"Same"},{"name":"same"}]', []);
    expect(r.added).toBe(1);
    expect(r.skipped).toBe(1);
  });

  it("reports an error when no array is present", () => {
    expect(parseAiSuggestions("no json here", []).error).toBe("No JSON array found");
    expect(parseAiSuggestions("[{broken", []).error).toBe("No JSON array found"); // no closing bracket
    expect(parseAiSuggestions("[{broken}]", []).error).toBe("Invalid JSON");
  });

  it("caps at 15 suggestions", () => {
    const many = JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ name: `uc-${i}` })));
    expect(parseAiSuggestions(many, []).added).toBe(15);
  });
});
