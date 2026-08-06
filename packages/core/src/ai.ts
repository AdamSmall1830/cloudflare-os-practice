import { INTERVIEW_QUESTIONS, SYSTEMS, VERTICALS, systemsForVertical } from "./catalogs.js";
import { clampNum } from "./scoring.js";
import type { ClientRecord, IngestResult, RiskTier, UseCase } from "./types.js";

/**
 * Build the AI-assist prompt: everything captured in discovery, plus strict
 * output instructions. The model must return ONLY a JSON array of use-case
 * suggestions (see parseAiSuggestions for the accepted schema).
 */
export function aiPrompt(c: ClientRecord): string {
  const allowed = systemsForVertical(c.vertical)
    .map((s) => `${s.id} = ${s.label}`)
    .join("\n");

  const interviews =
    c.interviews
      .map(
        (iv) =>
          `### ${iv.person || "?"} — ${iv.role || "?"}\n` +
          INTERVIEW_QUESTIONS.map((q, i) =>
            iv.answers[i] ? `Q: ${q}\nA: ${iv.answers[i]}` : "",
          )
            .filter(Boolean)
            .join("\n"),
      )
      .join("\n\n") || "(no interviews captured)";

  const inbox =
    c.inbox.map((it) => `- [${it.dept || "?"} · ~${it.freq}/wk] ${it.text}`).join("\n") ||
    "(no inbox items)";

  const existing = c.useCases.map((u) => u.name).join("; ") || "(none)";

  return `You are an AI-workspace deployment consultant. Below is raw discovery data from ${c.name}, a ${VERTICALS[c.vertical].label.toLowerCase()} with ~${c.size || "?"} employees. Synthesize it into candidate automation use cases for an agent workspace (Cloudflare OS) where agents read/write business systems through governed gatekeepers.

## Systems in scope (use ONLY these ids in "systems")
${allowed}

## Interviews
${interviews}

## Routine-work inbox log
${inbox}

## Survey / other notes
${c.surveyNotes || "(none)"}

## Already-registered use cases (do NOT repeat these)
${existing}

## Your task
Propose 5–12 NEW use cases. For each, estimate honestly from the data above:
- freq: times per week it occurs
- minutes: minutes per occurrence today
- people: how many people do this work
- feas: 1–5 API/data feasibility (5 = clean API + verifiable output)
- risk: "A" read-only, "B" writes behind human approval, "C" external side effects (emails to customers, payments, filings)

Respond with ONLY a JSON array, no prose, no markdown fences:
[{"name":"...","dept":"...","freq":N,"minutes":N,"people":N,"feas":N,"risk":"A|B|C","systems":["id",...]}]`;
}

const MAX_SUGGESTIONS = 15;

/**
 * Parse and validate an AI response into use cases. Tolerates markdown fences
 * and surrounding prose; clamps out-of-range numbers; drops rows without a
 * name, rows duplicating an existing use-case name (case-insensitive), and
 * unknown system ids. Pure — returns new rows, does not mutate the record.
 */
export function parseAiSuggestions(raw: string, existing: Pick<UseCase, "name">[]): IngestResult {
  let t = raw.trim().replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "");
  const start = t.indexOf("[");
  const end = t.lastIndexOf("]");
  if (start < 0 || end <= start) {
    return { useCases: [], added: 0, skipped: 0, error: "No JSON array found" };
  }

  let arr: unknown;
  try {
    arr = JSON.parse(t.slice(start, end + 1));
  } catch {
    return { useCases: [], added: 0, skipped: 0, error: "Invalid JSON" };
  }
  if (!Array.isArray(arr)) {
    return { useCases: [], added: 0, skipped: 0, error: "Expected a JSON array" };
  }

  const okIds = new Set(SYSTEMS.map((s) => s.id));
  const seen = new Set(existing.map((u) => u.name.trim().toLowerCase()));
  const out: UseCase[] = [];
  let skipped = 0;

  for (const r of (arr as Record<string, unknown>[]).slice(0, MAX_SUGGESTIONS)) {
    const name = typeof r?.name === "string" ? r.name.trim() : "";
    if (!name || seen.has(name.toLowerCase())) {
      skipped++;
      continue;
    }
    seen.add(name.toLowerCase());
    const risk: RiskTier = r.risk === "A" || r.risk === "B" || r.risk === "C" ? r.risk : "B";
    out.push({
      name: name.slice(0, 120),
      dept: String(r.dept ?? "").slice(0, 40),
      freq: clampNum(r.freq, 0, 500, 1),
      minutes: clampNum(r.minutes, 0, 600, 15),
      people: clampNum(r.people, 1, 500, 1),
      feas: clampNum(r.feas, 1, 5, 3),
      risk,
      systems: Array.isArray(r.systems) ? (r.systems as unknown[]).filter((id): id is string => typeof id === "string" && okIds.has(id)) : [],
      pilot: false,
    });
  }

  return { useCases: out, added: out.length, skipped };
}
