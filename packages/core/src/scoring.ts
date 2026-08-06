import type { ScoredUseCase, UseCase } from "./types.js";

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

/** Clamp a possibly-invalid numeric value into [min, max], with a default. */
export function clampNum(v: unknown, min: number, max: number, dflt: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : dflt;
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

/** Kebab-case slug for hostnames, worker names, and filenames. */
export function slug(s: string | undefined | null): string {
  const out = (s ?? "client")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return out || "client";
}
