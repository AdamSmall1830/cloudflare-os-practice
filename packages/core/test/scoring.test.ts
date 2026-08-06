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

  it("slugs names safely, capped at 24 chars", () => {
    expect(slug("Our Firm — Cloudflare OS HQ")).toBe("our-firm-cloudflare-os-h");
    expect(slug("Acme Co.")).toBe("acme-co");
    expect(slug("")).toBe("client");
  });
});
