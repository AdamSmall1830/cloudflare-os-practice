import type { Approvers, RiskTier, ScoredUseCase, UseCase } from "./types.js";

/** Weeks per month used across all value math. */
export const WEEKS_PER_MONTH = 4.33;

/** Recoverable hours per month for a use case. */
export function hoursPerMonth(u: Pick<UseCase, "freq" | "minutes" | "people">): number {
  return (u.freq * u.minutes * u.people * WEEKS_PER_MONTH) / 60;
}

/** Ranking score: weekly minutes of work × feasibility. */
export function rankScore(u: Pick<UseCase, "freq" | "minutes" | "people" | "feas">): number {
  return u.freq * u.minutes * u.people * u.feas;
}

/** Score and rank use cases, highest value first. Does not mutate input. */
export function rankUseCases(useCases: UseCase[]): ScoredUseCase[] {
  return useCases
    .map((u) => ({ ...u, hrsMo: hoursPerMonth(u), score: rankScore(u) }))
    .sort((a, b) => b.score - a.score);
}

/** Clamp a possibly-invalid numeric value into [min, max], with a default.
 *  Only real numbers and non-empty numeric strings are accepted — null, [],
 *  false, and "" fall through to the default rather than coercing to 0. */
export function clampNum(v: unknown, min: number, max: number, dflt: number): number {
  const n =
    typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : dflt;
}

/** Effective per-user daily LLM-call allowance (invalid/zero → 100 default). */
export function effectiveDailyLimit(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 100;
}

/** Deterministic thousands separators (locale-independent): 3060 → "3,060". */
export function fmtNum(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Effective hourly rate: finite and positive wins (rounded); anything else → $50 default. */
export function effectiveRate(rate: unknown): number {
  const n = Number(rate);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 50;
}

/** The single source of truth for "which named human approves this workflow's
 *  side effect", by use-case name. Used by the policy matrix, workflow specs,
 *  eval approval cases, and the Studio — they must all agree. A-risk = none. */
export function approverForUseCase(name: string, risk: RiskTier, approvers: Approvers): string {
  if (risk === "A") return "none (read-only)";
  const n = name.toLowerCase();
  if (/refund|payment|invoice|bill|reconcil/.test(n)) return approvers.payments || "TBD (payments approver)";
  if (/note|chart|record|filing|crm/.test(n)) return approvers.records || "TBD (records approver)";
  return approvers.sends || "TBD (sends approver)";
}

/** Systems whose writes are financial → routed to the payments approver in
 *  gatekeeper scaffolds and system build steps. */
export const PAYMENT_SYSTEMS: ReadonlySet<string> = new Set(["qbo", "stripe", "square", "netsuite"]);

/** Kebab-case slug for hostnames, worker names, and filenames. */
export function slug(s: string | undefined | null): string {
  const out = (s ?? "client")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24)
    .replace(/-+$/, ""); // re-strip: the 24-char cut can land on a hyphen
  return out || "client";
}
