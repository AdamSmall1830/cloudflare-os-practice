import { VERTICALS } from "./catalogs.js";
import type { ClientRecord, VerticalId } from "./types.js";

/**
 * Compliance pre-flight: maps the controls this deployment ships to the
 * specific regulatory requirement each one addresses, per vertical. The output
 * is a structuring aid for the compliance conversation — NOT legal advice.
 * Citations reflect the drafter's understanding and must be verified with the
 * client's counsel/compliance officer against their specific facts.
 */

export interface ComplianceItem {
  /** What the requirement obliges. */
  requirement: string;
  /** The rule/section it comes from. */
  citation: string;
  /** How THIS deployment's controls satisfy it. */
  control: string;
}

export interface ComplianceProfile {
  framework: string;
  /** One line on why/whether it applies. */
  scope: string;
  items: ComplianceItem[];
  /** Human sign-offs that the mapping cannot assert on its own. */
  attestations: string[];
}

const PROFILES: Record<VerticalId, (c: ClientRecord) => ComplianceProfile> = {
  pt: () => ({
    framework: "HIPAA (45 CFR Parts 160 & 164)",
    scope: "Applies because the deployment touches Protected Health Information (PHI) as a covered entity and/or business associate.",
    items: [
      { requirement: "Minimum necessary use/disclosure of PHI", citation: "45 CFR §164.502(b), §164.514(d)", control: "Gatekeeper scoping limits each role/agent to the minimum PHI needed (therapists see only their patients); agents start with zero access, granted explicitly." },
      { requirement: "Access controls & unique user identification", citation: "45 CFR §164.312(a)(1)", control: "Cloudflare Access SSO bound to the client IdP; per-identity sign-in; joiner/leaver revocation verified in the hardening step." },
      { requirement: "Audit controls", citation: "45 CFR §164.312(b)", control: "Observation logs record every resource an agent reads; retained via Workers Logpush → R2 per the retention policy (required for this vertical)." },
      { requirement: "Transmission security", citation: "45 CFR §164.312(e)(1)", control: "Data-flow policy blocks PHI sends to any non-BAA destination; TLS Full (strict); app-server outbound networking disabled." },
      { requirement: "Integrity — no improper alteration of records", citation: "45 CFR §164.312(c)(1)", control: "Chart/record writes queue for the named approver; the therapist reviews and signs all clinical notes." },
      { requirement: "Business Associate Agreements", citation: "45 CFR §164.502(e), §164.308(b)(1)", control: "BAA with Cloudflare (enterprise) AND each model provider via AI Gateway (zero-retention endpoints) BEFORE any PHI flows; flow-down to subprocessors." },
      { requirement: "Security risk management (safeguards)", citation: "45 CFR §164.308(a)(1)", control: "AI Gateway Guardrails inspect prompts/responses for PII and prompt injection (blocking on); red-team evals prove the guardrails pre-pilot and on every release bump." },
      { requirement: "Breach notification readiness", citation: "45 CFR §164.400–414", control: "Incident runbook (SECURITY-BASELINE.md): contain the gatekeeper → revoke credential → investigate via observation logs → notify sponsor/IT and per obligations." },
    ],
    attestations: ["BAAs signed with Cloudflare and every model provider before PHI flows", "Compliance owner has reviewed the minimum-necessary role scoping", "Retention period set to meet the practice's records obligations"],
  }),
  finserv: () => ({
    framework: "SEC — Investment Advisers Act of 1940",
    scope: "Applies to the registered investment adviser. Trading and money movement are kept entirely outside the OS by design.",
    items: [
      { requirement: "Advertising / Marketing Rule compliance", citation: "Rule 206(4)-1", control: "Compliance pre-review of outbound client-facing content against the Marketing Rule skill; nothing client-facing leaves without advisor + compliance sign-off." },
      { requirement: "Books & records retention", citation: "Rule 204-2", control: "Observation logs plus archived outputs (documents, communications) support the records obligation; Logpush → R2 retention configured in the hardening step." },
      { requirement: "Privacy of consumer financial information (Reg S-P safeguards)", citation: "17 CFR §248.30", control: "PII data-flow policy blocks external sends after sensitive reads; Access SSO; Guardrails PII detection; no personal data placed in URLs." },
      { requirement: "Custody", citation: "Rule 206(4)-2", control: "The deployment holds no custody and initiates no transactions — trading and money movement stay outside the OS entirely." },
      { requirement: "Code of ethics / recordkeeping supervision", citation: "Rule 204A-1", control: "Named approvers per side-effect class; the observation log is the supervisory audit trail." },
      { requirement: "Fiduciary duty — advice supervision", citation: "Advisers Act §206 / fiduciary standard", control: "No client-facing advice leaves without advisor sign-off; agents draft, advisors approve." },
    ],
    attestations: ["CCO has reviewed the Marketing-Rule pre-review workflow", "Retention meets the firm's 204-2 schedule", "No workflow initiates trades or money movement"],
  }),
  law: () => ({
    framework: "Rules of Professional Conduct (ABA Model Rules — verify your jurisdiction's adopted version)",
    scope: "Applies under the state bar's professional-conduct rules; ABA Model Rules are cited as the template.",
    items: [
      { requirement: "Confidentiality of client information", citation: "Model Rule 1.6", control: "Ethical walls implemented as per-matter gatekeeper scoping; verify-on-share blocks privileged data in shared work; model routing to no-training enterprise endpoints only." },
      { requirement: "Technology competence", citation: "Model Rule 1.1, cmt. [8]", control: "Deployment and its limits documented; attorneys trained; the design and its controls are auditable." },
      { requirement: "Supervision of nonlawyer assistance", citation: "Model Rule 5.3", control: "The agent is supervised like a nonlawyer assistant — nothing is filed or sent externally without attorney approval." },
      { requirement: "Conflicts of interest", citation: "Model Rules 1.7 / 1.9", control: "Intake conflicts pre-check surfaces hits; a human attorney clears them before the matter proceeds." },
      { requirement: "Communication with clients", citation: "Model Rule 1.4", control: "Client communications are drafted by agents, reviewed and sent by the responsible attorney." },
      { requirement: "Reasonable safeguards for client data", citation: "Model Rule 1.6(c)", control: "Access SSO, observation logs, Guardrails PII detection, and the retention policy." },
    ],
    attestations: ["Ethical-wall scoping verified against a walled test matter", "Responsible attorney approves all external outputs", "Model endpoints confirmed no-training"],
  }),
  salesmkt: () => ({
    framework: "Commercial communications & consumer privacy",
    scope: "Applies to outbound commercial messaging and handling of prospect/customer personal data.",
    items: [
      { requirement: "Commercial email compliance", citation: "CAN-SPAM Act, 15 U.S.C. §7704", control: "Outbound email stays behind approval until deliverability/tone are proven; the sending domain's SPF/DKIM/DMARC are verified in the email step." },
      { requirement: "Telephone/SMS consent (if used)", citation: "TCPA, 47 U.S.C. §227", control: "Any texting/calling stays out of scope unless consent management is in place first." },
      { requirement: "Consumer data privacy", citation: "CCPA (Cal. Civ. Code §1798.100) / GDPR Arts. 5–6", control: "PII scoped by role; no personal data in URLs; data-flow policy limits external sends; enrichment vendors allowlisted." },
    ],
    attestations: ["Outbound approval routing confirmed", "Data-processing terms in place with enrichment vendors"],
  }),
  manufacturing: () => ({
    framework: "Quality records & (where applicable) export control",
    scope: "Applies to quality-system records and, if the client handles ITAR/EAR-controlled technical data, export-control obligations.",
    items: [
      { requirement: "Control of documented information (quality records)", citation: "ISO 9001:2015 §7.5", control: "Quality-manual/CAPA sources connected read-mostly; the observation log serves as an access record." },
      { requirement: "Export-controlled technical data (if applicable)", citation: "ITAR (22 CFR) / EAR (15 CFR)", control: "MES/technical data is read-only and role-scoped; no controlled data leaves via agent sends — confirm applicability with counsel." },
      { requirement: "General data protection", citation: "Applicable privacy law", control: "PII scoped by role; pricing/quote data scoped to estimating; OT/MES strictly read-only." },
    ],
    attestations: ["Export-control applicability confirmed with counsel", "OT/MES access confirmed read-only"],
  }),
  agency: () => ({
    framework: "Service-provider / processor obligations (the firm's own posture)",
    scope: "The firm acts as a service provider / processor for clients, and a business associate where it touches client PHI.",
    items: [
      { requirement: "Data Processing Agreements", citation: "GDPR Art. 28 / CCPA service-provider terms", control: "DPA with each client; the firm processes personal data only on documented instructions; data stays in the client's own Cloudflare account." },
      { requirement: "Business Associate obligations", citation: "45 CFR §164.308(b)", control: "BAA with any healthcare client before touching PHI, with flow-down to subprocessors (Cloudflare, model providers)." },
      { requirement: "Security posture", citation: "SOC 2 Trust Services Criteria (direction)", control: "The practice runs its own deployment on the same controls it sells: Access, Guardrails, observation logs, retention, incident runbook." },
    ],
    attestations: ["DPA signed with each client", "BAA in place before any PHI engagement"],
  }),
  other: () => ({
    framework: "Baseline data protection & security",
    scope: "Baseline controls applicable to any deployment handling business or personal data.",
    items: [
      { requirement: "Data processing terms", citation: "GDPR Art. 28 / general", control: "DPA in place; data remains in the client's own Cloudflare account; no cross-tenant storage." },
      { requirement: "Access & audit", citation: "SOC 2 CC6 / CC7", control: "Access SSO; observation logs; retention policy; approval queues on all side effects." },
      { requirement: "Content safety", citation: "Internal policy", control: "Guardrails inspect prompts/responses; red-team evals run pre-pilot and on release bumps." },
    ],
    attestations: ["DPA signed", "Approvers named for each side-effect class"],
  }),
};

/** The compliance profile(s) for a client's vertical. */
export function complianceProfiles(c: ClientRecord): ComplianceProfile[] {
  return [PROFILES[c.vertical](c)];
}

/** Lightweight summary for surfaces that don't render the full tables. */
export function complianceSummary(c: ClientRecord): { framework: string; scope: string; count: number } {
  const p = complianceProfiles(c)[0]!;
  return { framework: p.framework, scope: p.scope, count: p.items.length };
}

/** COMPLIANCE.md — the control-to-requirement mapping for a deployment. */
export function complianceMarkdown(c: ClientRecord): string {
  const profiles = complianceProfiles(c);
  const head = `# ${c.name} — Compliance Pre-Flight
_${VERTICALS[c.vertical].label} · generated by @cfos-practice/core_

> **This is a control-to-requirement MAPPING to structure the compliance conversation — it is NOT legal advice.** Citations reflect the drafter's understanding at authoring time and must be verified with the client's counsel or compliance officer against the client's specific facts and current regulations. Requirement applicability depends on the client's circumstances.
`;
  const body = profiles
    .map((p) => {
      const rows = p.items
        .map((it) => `| ${it.requirement} | ${it.citation} | ${it.control} |`)
        .join("\n");
      const atts = p.attestations.map((a) => `- [ ] ${a} — owner: ${c.itOwner || "TODO"} / ${c.sponsor || "sponsor"}`).join("\n");
      return `## ${p.framework}

${p.scope}

| Requirement | Citation | How this deployment satisfies it |
|---|---|---|
${rows}

### Human sign-offs (the mapping cannot assert these)
${atts}`;
    })
    .join("\n\n");
  return `${head}\n${body}\n\n---\nReview this mapping with the client's counsel/compliance owner before the pilot. Update it whenever a control or the applicable regulation changes; treat it as a living document alongside SECURITY-BASELINE.md.\n`;
}
