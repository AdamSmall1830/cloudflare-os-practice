import { SYSTEMS, VERTICALS } from "./catalogs.js";
import { effectiveRate, fmtNum, rankUseCases } from "./scoring.js";
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
  const routes = client.mcpRoutes ?? {};
  const mcpRouted = custom.filter((s) => routes[s.id]);
  const customBuild = custom.filter((s) => !routes[s.id]);

  const ranked = rankUseCases(client.useCases);
  const manual = ranked.filter((u) => u.pilot);
  const suggested = ranked.filter((u) => u.risk !== "C").slice(0, 5);
  const autoSuggested = manual.length === 0;
  const pilots = autoSuggested ? suggested : manual;

  const totalHrs = Math.round(pilots.reduce((a, u) => a + u.hrsMo, 0));
  const hourlyRate = effectiveRate(client.hourlyRate);
  const totalValue = totalHrs * hourlyRate;
  const workflows = pilots.filter((u) => u.cadence && u.cadence !== "demand");

  const size = Number(client.size || 0);
  const small = size > 0 && size <= 30;
  const discoveryWeeks = small ? 2 : 3;
  // MCP-routed systems are portal config, not builds — they don't drive integration weeks.
  const intWeeks = Math.max(2, Math.ceil(customBuild.length * 1.5));
  const rolloutWeeks = size > 100 ? 4 : 3;
  const weeks = discoveryWeeks + 1 + intWeeks + 3 + rolloutWeeks + 2;

  return {
    client,
    chosen,
    stock,
    custom,
    mcpRouted,
    customBuild,
    workflows,
    ranked,
    pilots,
    autoSuggested,
    totalHrs,
    totalValue,
    hourlyRate,
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

Estimated recoverable time across pilot: **~${m.totalHrs} hours/month ≈ $${fmtNum(m.totalValue)}/month** at a $${m.hourlyRate}/hr loaded rate.

## Integrations
| System | Path | Wave | Effort |
|---|---|---|---|
${m.chosen
  .map((s) => {
    const routed = m.mcpRouted.some((r) => r.id === s.id);
    const path = s.kind === "stock" ? "Stock gatekeeper" : routed ? "Vendor MCP server via MCP Server Portal" : `Custom gatekeeper (${s.cls})`;
    const effort = routed ? "0.5–1 day (portal config)" : s.effort;
    return `| ${s.label} | ${path} | ${s.wave} | ${effort} |`;
  })
  .join("\n")}
${
  m.workflows.length
    ? `
## Automation (platform Workflows)
${m.workflows.map((u) => `- **${u.name}** — runs ${u.cadence === "event" ? "on external events (webhook-triggered)" : u.cadence}`).join("\n")}
`
    : ""
}${
  (m.client.knowledge ?? []).length
    ? `
## Knowledge & retrieval plan
${(m.client.knowledge ?? [])
  .map((k) => {
    const route =
      k.type === "wiki"
        ? "connected live via its gatekeeper"
        : k.type === "templates"
          ? "loaded as document/slide templates"
          : k.type === "data"
            ? "read live through gatekeepers (never copied)"
            : "ingested to R2 + AI Search (hybrid retrieval)";
    return `- **${k.name}** (${k.owner || "owner TBD"}) — ${route}`;
  })
  .join("\n")}
`
    : ""
}

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
