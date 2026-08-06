import { SYSTEMS, VERTICALS } from "./catalogs.js";
import { rankUseCases } from "./scoring.js";
import type { ClientRecord, DesignModel } from "./types.js";

/** Hostname for the production workspace ("os.<domain>", placeholder when unknown). */
export function hostnameFor(c: Pick<ClientRecord, "domain">): string {
  return c.domain ? `os.${c.domain.trim()}` : "os.CLIENT-DOMAIN.com";
}

/** Hostname for the staging workspace. */
export function stagingFor(c: Pick<ClientRecord, "domain">): string {
  return c.domain ? `os-staging.${c.domain.trim()}` : "os-staging.CLIENT-DOMAIN.com";
}

/**
 * Derive the full design model from a client record: pilot charter,
 * integration map, and timeline. Pure — does not mutate the record.
 *
 * Pilot selection: manually flagged use cases win; otherwise the top 5 by
 * score with C-risk excluded are auto-suggested.
 */
export function designModel(client: ClientRecord): DesignModel {
  const chosen = SYSTEMS.filter((s) => client.systems.includes(s.id));
  const stock = chosen.filter((s) => s.kind === "stock");
  const custom = chosen.filter((s) => s.kind === "custom");

  const ranked = rankUseCases(client.useCases);
  const manual = ranked.filter((u) => u.pilot);
  const suggested = ranked.filter((u) => u.risk !== "C").slice(0, 5);
  const autoSuggested = manual.length === 0;
  const pilots = autoSuggested ? suggested : manual;

  const totalHrs = Math.round(pilots.reduce((a, u) => a + u.hrsMo, 0));

  const size = Number(client.size || 0);
  const small = size > 0 && size <= 30;
  const discoveryWeeks = small ? 2 : 3;
  const intWeeks = Math.max(2, Math.ceil(custom.length * 1.5));
  const rolloutWeeks = size > 100 ? 4 : 3;
  const weeks = discoveryWeeks + 1 + intWeeks + 3 + rolloutWeeks + 2;

  return {
    client,
    chosen,
    stock,
    custom,
    ranked,
    pilots,
    autoSuggested,
    totalHrs,
    weeks,
    intWeeks,
    discoveryWeeks,
    rolloutWeeks,
  };
}

/** Render the proposal-ready scope document as Markdown. */
export function scopeMarkdown(m: DesignModel, opts?: { date?: string }): string {
  const c = m.client;
  const date = opts?.date ?? new Date().toISOString().slice(0, 10);
  const signIn =
    c.idp === "access"
      ? "Cloudflare Access + client IdP"
      : c.idp === "google"
        ? "Google OAuth (auth gatekeeper)"
        : "Password (interim)";

  return `# ${c.name} — Cloudflare OS Deployment: Proposed Scope
_Prepared ${date} · ${VERTICALS[c.vertical].label} · ~${c.size || "?"} employees_

## Objective
Deploy Cloudflare OS as a governed AI agent workspace in ${c.name}'s own Cloudflare account: every employee gets an agent grounded in company knowledge, with all external actions mediated by credential-holding Gatekeepers, audit logging, and human approval queues.

## Pilot workflows (${m.pilots.length})
${m.pilots.map((u) => `- **${u.name}** (${u.dept}) — est. ${Math.round(u.hrsMo)} hrs/month recovered · risk tier ${u.risk}`).join("\n")}

Estimated recoverable time across pilot: **~${m.totalHrs} hours/month**.

## Integrations
| System | Type | Wave | Build effort |
|---|---|---|---|
${m.chosen
  .map(
    (s) =>
      `| ${s.label} | ${s.kind === "stock" ? "Stock gatekeeper" : `Custom gatekeeper (${s.cls})`} | ${s.wave} | ${s.effort} |`,
  )
  .join("\n")}

## Governance
- Sign-in: ${signIn}
- Models: ${c.provider} via AI Gateway; ${c.dailyLimit} calls/user/day allowance; per-team budgets
- Approvals: payments → ${c.approvers.payments || "TBD"}; outbound sends → ${c.approvers.sends || "TBD"}; records/filings → ${c.approvers.records || "TBD"}
- Vertical guardrails: ${VERTICALS[c.vertical].guard}

## Timeline
~${m.weeks} weeks: Discovery ${m.discoveryWeeks}w → Foundation 1w → Integrations ${m.intWeeks}w (knowledge curation in parallel) → Pilot 3w → Rollout ${m.rolloutWeeks}w → Handoff 2w.

## Handoff
Admin training, staging-tested upgrade runbook, governance council, signed acceptance checklist. Client owns account, data, credentials, and deployment config.`;
}
