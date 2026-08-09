import { describe, expect, it } from "vitest";
import { clampNum, hoursPerMonth, rankUseCases, slug } from "../src/scoring.js";
import { designModel } from "../src/design.js";
import { hqClient } from "../src/seed.js";

describe("scoring", () => {
  it("computes hours/month as freq × minutes × people × 4.33 / 60", () => {
    expect(hoursPerMonth({ freq: 10, minutes: 30, people: 2 })).toBeCloseTo(43.3, 1);
  });

  it("the HQ pilot set anchors at ~51 hours/month", () => {
    const m = designModel(hqClient());
    expect(m.pilots).toHaveLength(4);
    expect(m.totalHrs).toBe(51);
  });

  it("ranks by weekly minutes × feasibility, highest first", () => {
    const ranked = rankUseCases([
      { name: "low", dept: "", freq: 1, minutes: 10, people: 1, feas: 1, risk: "A", systems: [], pilot: false },
      { name: "high", dept: "", freq: 10, minutes: 60, people: 3, feas: 5, risk: "A", systems: [], pilot: false },
    ]);
    expect(ranked[0]?.name).toBe("high");
  });

  it("clamps out-of-range values and defaults non-numeric ones", () => {
    expect(clampNum(900, 0, 500, 1)).toBe(500);
    expect(clampNum(-5, 0, 600, 15)).toBe(0);
    expect(clampNum("nope", 1, 5, 3)).toBe(3);
  });

  it("treats null / [] / false / empty-string as the default, not 0", async () => {
    for (const bad of [null, [], false, "", undefined]) {
      expect(clampNum(bad, 1, 500, 7)).toBe(7);
    }
    expect(clampNum("42", 0, 500, 1)).toBe(42); // numeric strings still work
  });

  it("formats numbers deterministically with thousands separators", async () => {
    const { fmtNum } = await import("../src/scoring.js");
    expect(fmtNum(3060)).toBe("3,060");
    expect(fmtNum(999)).toBe("999");
    expect(fmtNum(1234567)).toBe("1,234,567");
  });

  it("slugs names safely, capped at 24 chars with no trailing hyphen", () => {
    expect(slug("Our Firm — Cloudflare OS HQ")).toBe("our-firm-cloudflare-os-h");
    expect(slug("Acme Co.")).toBe("acme-co");
    expect(slug("")).toBe("client");
    // 24th char lands on a word boundary → must not leave a trailing hyphen
    expect(slug("Twenty three char names X!!")).not.toMatch(/-$/);
    expect(slug("aaaaaaaaaaaaaaaaaaaaaaaa next")).toBe("aaaaaaaaaaaaaaaaaaaaaaaa");
  });

  it("effectiveDailyLimit defaults zero/blank/garbage to 100 and keeps valid values", async () => {
    const { effectiveDailyLimit } = await import("../src/scoring.js");
    expect(effectiveDailyLimit(0)).toBe(100);
    expect(effectiveDailyLimit("")).toBe(100);
    expect(effectiveDailyLimit(-4)).toBe(100);
    expect(effectiveDailyLimit(250)).toBe(250);
  });

  it("approverForUseCase classifies by name and honors risk A", async () => {
    const { approverForUseCase } = await import("../src/scoring.js");
    const ap = { payments: "Pat", sends: "Sam", records: "Ray" };
    expect(approverForUseCase("Reconcile bank statements", "B", ap)).toBe("Pat");
    expect(approverForUseCase("Draft outbound email", "B", ap)).toBe("Sam");
    expect(approverForUseCase("Update CRM record", "B", ap)).toBe("Ray");
    expect(approverForUseCase("Read-only digest", "A", ap)).toBe("none (read-only)");
  });
});
