import { INTERVIEW_QUESTIONS, SYSTEMS, VERTICALS, systemsForVertical } from "./catalogs.js";
import { clampNum } from "./scoring.js";
import type { ClientRecord, IngestResult, RiskTier, UseCase } from "./types.js";

/** The discovery evidence corpus, shared by the draft and evidence-check prompts. */
export function discoveryCorpus(c: ClientRecord): string {
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

  return `## Interviews
${interviews}

## Routine-work inbox log
${inbox}

## Survey / other notes
${c.surveyNotes || "(none)"}`;
}

const SUGGESTION_SCHEMA = `[{"name":"...","dept":"...","freq":N,"minutes":N,"people":N,"feas":N,"risk":"A|B|C","cadence":"demand|daily|weekly|event","systems":["id",...],"evidence":"short quote/pointer from the corpus"}]`;

/**
 * Pass 1 — draft. Everything captured in discovery, the practice's own
 * knowledge for this vertical (guardrail + exemplar patterns), and strict
 * output instructions. The model must return ONLY a JSON array
 * (see parseAiSuggestions for the accepted schema).
 */
export function aiPrompt(c: ClientRecord): string {
  const allowed = systemsForVertical(c.vertical)
    .map((s) => `${s.id} = ${s.label}`)
    .join("\n");
  const v = VERTICALS[c.vertical];
  const exemplars = v.starters.map((s) => `- ${s.name}`).join("\n") || "(none)";
  const existing = c.useCases.map((u) => u.name).join("; ") || "(none)";

  return `You are an AI-workspace deployment consultant. Below is raw discovery data from ${c.name}, a ${v.label.toLowerCase()} with ~${c.size || "?"} employees. Synthesize it into candidate automation use cases for an agent workspace (Cloudflare OS) where agents read/write business systems through governed gatekeepers.

## Systems in scope (use ONLY these ids in "systems")
${allowed}

${discoveryCorpus(c)}

## Practice guardrail for this vertical (constrains what may be proposed)
${v.guard}

## Known winning patterns in this vertical (exemplars only — propose ONLY if independently evidenced above; never duplicate the registered list)
${exemplars}

## Already-registered use cases (do NOT repeat these)
${existing}

## Your task
Propose 5–12 NEW use cases. For each, estimate honestly from the evidence above:
- freq: times per week it occurs
- minutes: minutes per occurrence today
- people: how many people do this work
- feas: 1–5 API/data feasibility (5 = clean API + verifiable output)
- risk: "A" read-only, "B" writes behind human approval, "C" external side effects (emails to customers, payments, filings)
- cadence: "demand" (run when asked) · "daily"/"weekly" (evidenced recurring digests, syncs, chase loops) · "event" (an explicit external trigger appears in the evidence)
- evidence: REQUIRED — a short quote or pointer from the corpus above that motivated this use case. Propose nothing you cannot evidence.

Respond with ONLY a JSON array, no prose, no markdown fences:
${SUGGESTION_SCHEMA}`;
}

/**
 * Pass 2 — evidence check. Takes the pass-1 draft (raw JSON text) and the
 * same corpus, and instructs a skeptical review: drop invention, tighten
 * estimates, correct risk tiers and cadences. Returns the same schema.
 */
export function aiCritiquePrompt(c: ClientRecord, draftJson: string): string {
  return `You are performing a skeptical evidence check (pass 2) on AI-drafted automation use cases for ${c.name}. Your job is to remove invention and tighten estimates — a shorter, evidenced list beats an impressive one.

## The evidence corpus (the ONLY ground truth)
${discoveryCorpus(c)}

## The draft to verify
${draftJson}

## Rules
1. DROP any use case whose evidence is missing, vague, or not actually supported by the corpus.
2. When in doubt, adjust freq/minutes/people DOWN to what the evidence supports.
3. Risk tier: "A" only if purely read-only; anything writing to a system is "B"; anything reaching customers, regulators, or money externally is "C".
4. Cadence: "event" only when an external trigger is explicit in the evidence; "daily"/"weekly" only when recurrence is evidenced; otherwise "demand".
5. Keep "systems" ids only from the draft's own ids; correct evidence quotes if misattributed.

Respond with ONLY the corrected JSON array, same schema, no prose, no markdown fences:
${SUGGESTION_SCHEMA}`;
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

  // Validate/dedupe the whole response FIRST, then cap the accepted rows — so a
  // run of leading duplicates can't crowd out genuinely new later suggestions.
  for (const r of arr as Record<string, unknown>[]) {
    if (out.length >= MAX_SUGGESTIONS) break;
    const name = typeof r?.name === "string" ? r.name.trim() : "";
    if (!name || seen.has(name.toLowerCase())) {
      skipped++;
      continue;
    }
    seen.add(name.toLowerCase());
    const risk: RiskTier = r.risk === "A" || r.risk === "B" || r.risk === "C" ? r.risk : "B";
    const cadence =
      r.cadence === "daily" || r.cadence === "weekly" || r.cadence === "event" ? r.cadence : "demand";
    out.push({
      name: name.slice(0, 120),
      dept: String(r.dept ?? "").slice(0, 40),
      freq: clampNum(r.freq, 0, 500, 1),
      minutes: clampNum(r.minutes, 0, 600, 15),
      people: clampNum(r.people, 1, 500, 1),
      feas: clampNum(r.feas, 1, 5, 3),
      risk,
      cadence,
      systems: Array.isArray(r.systems) ? (r.systems as unknown[]).filter((id): id is string => typeof id === "string" && okIds.has(id)) : [],
      pilot: false,
    });
  }

  return { useCases: out, added: out.length, skipped };
}
