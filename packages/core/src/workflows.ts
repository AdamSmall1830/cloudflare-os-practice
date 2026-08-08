import { systemById } from "./catalogs.js";
import { designModel } from "./design.js";
import { slug } from "./scoring.js";
import type { Cadence, ClientRecord, ScoredUseCase } from "./types.js";

/**
 * Workflow spec generation: every pilot use case with a scheduled or event
 * cadence gets a pattern-instantiated spec, completed with the champion
 * before implementation. Patterns are defined in docs/workflow-patterns.md.
 */

export interface WorkflowSpecTarget {
  name: string;
  file: string;
  markdown: string;
}

/** Suggested pattern for a cadence (confirm against the pattern library). */
export function suggestedPattern(cadence: Cadence): string {
  switch (cadence) {
    case "event":
      return "Event-triggered kickoff (pattern 5) — or Inbox triage (pattern 2) if the event is an incoming item to classify";
    case "daily":
      return "Chase / reminder loop (pattern 4) — or Scheduled digest (pattern 1) if it reports rather than nudges";
    case "weekly":
      return "Scheduled digest (pattern 1) — or Record sync (pattern 3) if it reconciles systems";
    default:
      return "On-demand agent workflow — no Workflow needed unless it later gains a schedule or trigger";
  }
}

function approverFor(c: ClientRecord, u: Pick<ScoredUseCase, "name" | "risk">): string {
  if (u.risk === "A") return "none (read-only)";
  const n = u.name.toLowerCase();
  if (/refund|payment|invoice|bill|reconcil/.test(n)) return c.approvers.payments || "TBD (payments approver)";
  if (/note|chart|record|filing|crm/.test(n)) return c.approvers.records || "TBD (records approver)";
  return c.approvers.sends || "TBD (sends approver)";
}

/** The spec markdown for one cadenced workflow. */
export function workflowSpecMarkdown(c: ClientRecord, u: ScoredUseCase): string {
  const cadence = u.cadence ?? "demand";
  const systems = u.systems.map((id) => systemById(id)?.label ?? id).join(", ") || "TBD";
  const trigger =
    cadence === "event"
      ? "External event → webhook → a dedicated Worker route starts this Workflow. Define the event source and payload; design for idempotency (duplicate deliveries must be no-ops)."
      : `Schedule: ${cadence}. Pick the exact time with the champion (when is the data fresh AND the approver available?).`;

  return `# Workflow: ${u.name}

**Client:** ${c.name} · **Dept:** ${u.dept} · **Cadence:** ${cadence} · **Risk tier:** ${u.risk}
**Systems (via gatekeepers/portals):** ${systems}
**Suggested pattern:** ${suggestedPattern(cadence)} — confirm against \`docs/workflow-patterns.md\`, then delete the alternatives.

## Trigger
${trigger}

## Steps
<!-- Deterministic steps first; mark model steps "MODEL:" and tie them to the workflow's skill. -->
1. TODO — draft with the champion from the skill's procedure (skills/${slug(u.name)}.md).

## Approval points
- Side effects queue for: **${approverFor(c, u)}**
- Batch vs. per-item approvals: TODO (default: batch for syncs, per-item for external sends)

## Stop & failure behavior
- On missing/unavailable source: degrade loudly (ship with a "⚠ source unavailable" note or stop and alert) — never silent, never invented data.
- ${cadence === "event" ? "Idempotency: same event id twice → second is a no-op." : "If the run's condition is already satisfied: do nothing, log it."}
- TODO: stop rules / escalation (mandatory for chase loops: max nudges, reply-detected, escalate-to).

## Metrics (feed METRICS.md weekly)
- Runs, outcome (ok / degraded / failed), approval latency, human corrections.

## Evals (pin in evals/${slug(u.name)}.json)
- Golden: fixture input → exact expected output.
- Edge: the degradation case above behaves as specified.
${u.risk !== "A" ? "- Approval routing: the side effect waits for the named approver (blocker)." : ""}
`;
}

/** All spec targets for a client: cadenced pilot workflows only. */
export function workflowSpecs(c: ClientRecord): WorkflowSpecTarget[] {
  return designModel(c).workflows.map((u) => ({
    name: u.name,
    file: `workflows/${slug(u.name)}.md`,
    markdown: workflowSpecMarkdown(c, u),
  }));
}
