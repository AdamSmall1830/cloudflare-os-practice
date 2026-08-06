import {
  buildGuideMarkdown,
  deploymentJsonc,
  designModel,
  evalRunMarkdown,
  evalSuites,
  gatekeeperScaffold,
  slug,
  systemById,
  type ClientRecord,
} from "@cfos-practice/core";

export interface GeneratedFile {
  /** Path relative to the output root. */
  path: string;
  content: string;
}

function skillSeed(c: ClientRecord, name: string, dept: string, risk: string, systems: string[]): string {
  const sys = systems.map((id) => systemById(id)?.label ?? id).join(", ") || "none yet";
  return `# Skill: ${name}

**Client:** ${c.name} · **Dept:** ${dept} · **Risk tier:** ${risk} · **Systems:** ${sys}
**Owner (champion):** TODO · **Last reviewed:** TODO

<!-- Anatomy and craft rules: docs/skills-guide.md in the practice repo. -->

## When to use
<!-- One sentence, in the client's own vocabulary, describing the trigger. -->

## Inputs
<!-- What must exist before this runs (record, email, fixture) and where it lives. -->

## Procedure
<!-- Numbered, imperative, in the client's terms. Deterministic steps first.
     Mark judgment calls explicitly: "JUDGMENT: ...". Never restate what the
     platform already enforces. -->
1. TODO — captured from the champion during Phase 4 (knowledge curation).

## Approvals
${risk === "A" ? "Read-only — no approval required." : `Side effects queue for approval (see the policy matrix; approvers: payments → ${c.approvers.payments || "TBD"}, sends → ${c.approvers.sends || "TBD"}, records → ${c.approvers.records || "TBD"}).`}

## Sources of truth
<!-- Which system/document wins when data disagrees, and what to do on conflict. -->

## Known failure modes
<!-- What has gone wrong or predictably will; what the agent should do instead. -->
`;
}

function metricsMarkdown(c: ClientRecord): string {
  const m = designModel(c);
  return `# ${c.name} — Pilot Metrics Log

Anchor from the design: **~${m.totalHrs} hrs/month ≈ $${m.totalValue}/month** across ${m.pilots.length} pilot workflows (at $${c.hourlyRate || 50}/hr loaded). Capture weekly during pilot; review in the weekly tuning session; roll up monthly for the governance council.

## Weekly capture
| Week | Workflow | Runs | Est. hrs saved | Approval latency (median) | Errors / rework | Notes |
|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |

- **Hrs saved:** self-reported by the operator, spot-checked against a timed sample once per week.
- **Approval latency:** queue-entry → decision. If it exceeds ~4 business hours, fix the approver routing before blaming the agent.
- **Spend/user:** pull from AI Gateway (attributed per person/team); log monthly below.

## Monthly rollup
| Month | Hrs saved (sum) | ≈ $ value | Model spend | Net | Weekly active % | Verdict vs anchor |
|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |
`;
}

function securityBaseline(c: ClientRecord): string {
  const rows = c.systems
    .map((id) => systemById(id))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map(
      (s) =>
        `| ${s.label} | ${s.kind === "stock" ? "OAuth/app credential (stock gatekeeper)" : "API credential (custom gatekeeper or MCP portal)"} | Minimum scopes per SETUP.md step | Gatekeeper Worker secret / portal config | 90 days | ${c.itOwner || "IT owner"} |`,
    )
    .join("\n");
  return `# ${c.name} — Security Baseline

Living document: update on every credential, policy, or integration change. Reviewed at handoff and quarterly by the governance council.

## Identity & access
- Sign-in: ${c.idp === "access" ? "Cloudflare Access + IdP" : c.idp === "google" ? "Google OAuth (auth gatekeeper), password auth disabled once verified" : "⚠ password auth — interim only, replace before pilot"}
- Admin emails: ${c.adminEmails || "TODO"}
- Non-admin users hold no elevated permissions through agents (platform principle).

## Credential inventory
| System | Credential type | Scopes | Stored where | Rotation | Owner |
|---|---|---|---|---|---|
${rows || "| (none granted yet) | | | | | |"}

## Approval map
| Side effect class | Approver |
|---|---|
| Payments / refunds | ${c.approvers.payments || "TODO"} |
| Outbound sends | ${c.approvers.sends || "TODO"} |
| Records / filings | ${c.approvers.records || "TODO"} |

## Standing posture
- Agents/apps start with zero access; every capability is an explicit gatekeeper/portal grant.
- App server code runs with outbound networking disabled; reach is capability-only.
- Observation logging on; verify-on-share enforced; data-flow policy per the matrix.
- Vertical guardrail: ${c.vertical !== "other" ? "see policy skill" : "n/a"} — evals (EVALS.md) prove these hold, pre-pilot and on every release bump.

## Incident runbook — suspected agent misbehavior or credential exposure
1. **Contain:** disable the affected gatekeeper Worker route (or portal server) — this severs the capability without touching the rest of the deployment.
2. **Revoke:** rotate the credential at the source system; update the Worker secret.
3. **Investigate:** pull the observation log for the affected workspace(s); establish what was read and what side effects were queued/executed.
4. **Decide & notify:** sponsor (${c.sponsor || "TODO"}) + IT owner (${c.itOwner || "TODO"}); client notifies per their obligations if regulated data is involved.
5. **Learn:** add a red-team eval case reproducing the incident; it must pass before the capability is re-enabled.
`;
}

/**
 * Generate the starter-repo seed files for a client record. Pure — returns
 * file descriptors; the CLI is responsible for writing them to disk.
 */
export function generateFiles(c: ClientRecord): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  files.push({ path: "deployment.jsonc", content: deploymentJsonc(c) + "\n" });
  files.push({ path: "SETUP.md", content: buildGuideMarkdown(c) });

  const custom = c.systems
    .map((id) => systemById(id))
    .filter((s): s is NonNullable<typeof s> => !!s && s.kind === "custom");
  for (const s of custom) {
    const approver =
      s.id === "qbo" || s.id === "stripe" || s.id === "square"
        ? c.approvers.payments || "APPROVER"
        : c.approvers.sends || "APPROVER";
    files.push({
      path: `packages/custom-gatekeeper/src/${s.id}.ts`,
      content: gatekeeperScaffold(s.id, approver) + "\n",
    });
  }

  const pilots = c.useCases.filter((u) => u.pilot);
  const seeds = pilots.length ? pilots : c.useCases.slice(0, 5);
  for (const u of seeds) {
    files.push({
      path: `skills/${slug(u.name)}.md`,
      content: skillSeed(c, u.name, u.dept, u.risk, u.systems),
    });
  }

  for (const suite of evalSuites(c)) {
    files.push({
      path: `evals/${slug(suite.workflow)}.json`,
      content: JSON.stringify(suite, null, 2) + "\n",
    });
  }
  files.push({ path: "EVALS.md", content: evalRunMarkdown(c) });
  files.push({ path: "METRICS.md", content: metricsMarkdown(c) });
  files.push({ path: "SECURITY-BASELINE.md", content: securityBaseline(c) });

  files.push({
    path: "README.md",
    content: `# ${c.name} — Cloudflare OS deployment seed

Generated by \`@cfos-practice/scaffold\` from the Studio engagement record.

- \`SETUP.md\` — the full ordered setup guide with acceptance checks
- \`deployment.jsonc\` — values for the cloudflare-os-starter template (reconcile key names against the pinned release you clone)
- \`packages/custom-gatekeeper/src/\` — gatekeeper scaffolds for the ${custom.length} custom system(s); align each class with the gatekeeper interface in the pinned release before shipping
- \`skills/\` — skill seeds for the pilot workflows, to be completed with the client's champion in Phase 4 (craft rules: the practice repo's docs/skills-guide.md)
- \`evals/\` + \`EVALS.md\` — the evaluation suites (golden + red-team) and run protocol; pre-pilot gate and release-bump regression net
- \`METRICS.md\` — the pilot ROI capture log, anchored to the design's hours/$ estimate
- \`SECURITY-BASELINE.md\` — credential inventory, approval map, posture, and the incident runbook

These files are a **seed to copy into a fresh clone of** [cloudflare/cloudflare-os-starter](https://github.com/cloudflare/cloudflare-os-starter) — not a standalone project.
`,
  });

  return files;
}
