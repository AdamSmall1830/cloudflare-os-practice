import type { SystemDef, VerticalDef, RiskTier, VerticalId, SelfHostEngine, SelfHostDriver } from "./types.js";

/** The ten discovery interview questions. */
export const INTERVIEW_QUESTIONS: readonly string[] = [
  "Walk me through yesterday morning, task by task.",
  "What do you redo every week or month that feels identical each time?",
  "What takes a new hire longest to learn?",
  "Which emails or messages do you dread, and why?",
  "What information lives only in one person's head?",
  "What reports do you produce — for whom, from which systems, how often?",
  "Where do you wait on approvals, and how long?",
  "Between which systems do you re-key the same data?",
  "If you got five hours back a week, what would you spend them on?",
  "What should NEVER be automated here?",
];

export const RISK_LABEL: Record<RiskTier, string> = {
  A: "A · read-only",
  B: "B · write + approval",
  C: "C · external side effects",
};

/** Display labels for self-hosted serving engines. vLLM is the practice reference. */
export const SELF_HOST_ENGINES: Record<SelfHostEngine, string> = {
  vllm: "vLLM",
  tgi: "Hugging Face TGI",
  sglang: "SGLang",
  ollama: "Ollama",
  other: "Other (OpenAI-compatible)",
};

/**
 * Each self-hosting driver, with the routing rule it implies. The Design engine
 * turns a model's drivers into "what runs on the client-hosted tier, and why".
 */
export const SELF_HOST_DRIVERS: Record<SelfHostDriver, { label: string; rule: string }> = {
  residency: { label: "Data residency", rule: "PII / residency-bound tasks route here — prompts never leave client infrastructure" },
  compliance: { label: "Compliance mandate", rule: "Regulated-record tasks route here — inference stays inside the audited boundary" },
  cost: { label: "Cost at volume", rule: "High-volume triage / bulk tasks route here — no per-token API fees" },
  latency: { label: "Low latency", rule: "Latency-critical interactive tasks route here — no round-trip to a hosted API" },
  offline: { label: "Offline / air-gapped", rule: "All tasks can route here — operates with no outbound internet" },
};

/** Catalog of gatekeeper targets. `vert` scopes a system to one vertical's UI. */
export const SYSTEMS: readonly SystemDef[] = [
  { id: "google", label: "Google Workspace (mail · calendar · Drive)", kind: "stock", wave: 1, effort: "0.5–1 day" },
  { id: "m365", label: "Microsoft 365 (Graph)", kind: "custom", cls: "Graph", wave: 1, effort: "5–10 days" },
  { id: "slack", label: "Slack", kind: "stock", wave: 1, effort: "0.5 day" },
  { id: "notion", label: "Notion", kind: "stock", wave: 1, effort: "0.5 day" },
  { id: "confluence", label: "Confluence", kind: "stock", wave: 1, effort: "0.5 day" },
  { id: "zoominfo", label: "ZoomInfo", kind: "stock", wave: 1, effort: "0.5 day" },
  { id: "qbo", label: "QuickBooks Online", kind: "custom", cls: "OAuth SaaS REST", wave: 2, effort: "3–7 days" },
  { id: "stripe", label: "Stripe", kind: "custom", cls: "OAuth SaaS REST", wave: 2, effort: "3–7 days" },
  { id: "square", label: "Square", kind: "custom", cls: "OAuth SaaS REST", wave: 2, effort: "3–7 days" },
  { id: "hubspot", label: "HubSpot", kind: "custom", cls: "OAuth SaaS REST", wave: 2, effort: "3–7 days" },
  { id: "ghl", label: "GoHighLevel (CRM · funnels · booking · payments)", kind: "custom", cls: "OAuth SaaS REST", wave: 2, effort: "1–2 weeks" },
  { id: "cfapi", label: "Cloudflare API (client provisioning)", vert: "agency", kind: "stock", wave: 1, effort: "0.5–1 day" },
  { id: "salesforce", label: "Salesforce", kind: "custom", cls: "OAuth SaaS REST", wave: 2, effort: "5–10 days" },
  { id: "netsuite", label: "NetSuite (ERP)", vert: "manufacturing", kind: "custom", cls: "Vertical SaaS", wave: 3, effort: "2–4 weeks" },
  { id: "epicor", label: "Epicor / on-prem ERP", vert: "manufacturing", kind: "custom", cls: "On-prem via Mesh/Tunnel", wave: 3, effort: "3–6 weeks" },
  { id: "cmms", label: "CMMS / maintenance system", vert: "manufacturing", kind: "custom", cls: "Vertical SaaS", wave: 3, effort: "1–3 weeks" },
  { id: "clio", label: "Clio (practice mgmt)", vert: "law", kind: "custom", cls: "OAuth SaaS REST", wave: 3, effort: "1–3 weeks" },
  { id: "imanage", label: "iManage / NetDocuments (DMS)", vert: "law", kind: "custom", cls: "Vertical SaaS", wave: 3, effort: "1–3 weeks" },
  { id: "wealthbox", label: "Wealthbox / Redtail (CRM)", vert: "finserv", kind: "custom", cls: "OAuth SaaS REST", wave: 2, effort: "3–7 days" },
  { id: "orion", label: "Orion / Black Diamond (portfolio)", vert: "finserv", kind: "custom", cls: "Vertical SaaS", wave: 3, effort: "1–3 weeks" },
  { id: "emoney", label: "eMoney / RightCapital (planning)", vert: "finserv", kind: "custom", cls: "Vertical SaaS", wave: 3, effort: "1–3 weeks" },
  { id: "webpt", label: "WebPT / Prompt / Jane (EMR)", vert: "pt", kind: "custom", cls: "Vertical SaaS", wave: 3, effort: "1–3 weeks" },
  { id: "clearing", label: "Eligibility / clearinghouse portal", vert: "pt", kind: "custom", cls: "Vertical SaaS", wave: 3, effort: "1–3 weeks" },
];

export function systemById(id: string): SystemDef | undefined {
  return SYSTEMS.find((s) => s.id === id);
}

/** Systems offered for a given vertical (unscoped systems plus that vertical's own). */
export function systemsForVertical(vertical: VerticalId): SystemDef[] {
  return SYSTEMS.filter((s) => !s.vert || s.vert === vertical);
}

export const VERTICALS: Record<VerticalId, VerticalDef> = {
  manufacturing: {
    label: "Manufacturing",
    guard:
      "OT/MES strictly read-only; PO issuance and quote sends behind approval; pricing data scoped to estimating roles.",
    starters: [
      { name: "RFQ triage → draft quote from cost history", dept: "Sales/Estimating", freq: 10, minutes: 45, people: 2, feas: 4, risk: "B", systems: ["netsuite", "google"] },
      { name: "Daily production & downtime digest", dept: "Ops", freq: 5, minutes: 30, people: 3, feas: 4, risk: "A", systems: ["epicor"] },
      { name: "Supplier email triage → PO status answers", dept: "Purchasing", freq: 25, minutes: 10, people: 2, feas: 4, risk: "B", systems: ["google", "netsuite"] },
      { name: "Maintenance ticket summarization + CAPA drafts", dept: "Quality", freq: 8, minutes: 25, people: 2, feas: 3, risk: "A", systems: ["cmms"] },
    ],
  },
  law: {
    label: "Law firm",
    guard:
      "Ethical walls via per-matter gatekeeper scoping; nothing filed or sent without attorney approval; no-training model endpoints only.",
    starters: [
      { name: "Intake triage + conflicts pre-check", dept: "Intake", freq: 15, minutes: 20, people: 2, feas: 4, risk: "B", systems: ["clio", "google"] },
      { name: "Matter chronology builder", dept: "Attorneys", freq: 6, minutes: 60, people: 4, feas: 3, risk: "A", systems: ["imanage"] },
      { name: "Prebill narrative scrub", dept: "Billing", freq: 4, minutes: 90, people: 1, feas: 4, risk: "B", systems: ["clio"] },
      { name: "Deadline / docket digest", dept: "All", freq: 5, minutes: 15, people: 6, feas: 5, risk: "A", systems: ["google", "clio"] },
    ],
  },
  finserv: {
    label: "Financial services (RIA)",
    guard:
      "No client-facing advice without advisor sign-off; PII reads block external sends; trading & money movement stay outside the OS.",
    starters: [
      { name: "Meeting-prep brief (CRM + holdings + notes)", dept: "Advisors", freq: 12, minutes: 40, people: 3, feas: 4, risk: "A", systems: ["wealthbox", "orion", "google"] },
      { name: "Post-meeting summary → CRM notes/tasks", dept: "Advisors", freq: 12, minutes: 25, people: 3, feas: 4, risk: "B", systems: ["wealthbox"] },
      { name: "Client review decks on live data", dept: "Advisors", freq: 6, minutes: 75, people: 2, feas: 3, risk: "A", systems: ["orion"] },
      { name: "Marketing-rule pre-review of outbound content", dept: "Compliance", freq: 5, minutes: 30, people: 1, feas: 4, risk: "B", systems: ["google"] },
    ],
  },
  salesmkt: {
    label: "Sales & marketing org",
    guard:
      "Outbound email behind approval until tone/deliverability proven; discount data scoped by role; brand-voice skill on all client-facing drafts.",
    starters: [
      { name: "Account research brief + call prep", dept: "Sales", freq: 20, minutes: 30, people: 4, feas: 5, risk: "A", systems: ["hubspot", "zoominfo", "google"] },
      { name: "Proposal generation from CRM context", dept: "Sales", freq: 8, minutes: 60, people: 3, feas: 4, risk: "B", systems: ["hubspot", "google"] },
      { name: "Lead triage + enrichment → CRM hygiene", dept: "Sales/Mktg", freq: 30, minutes: 8, people: 2, feas: 4, risk: "B", systems: ["hubspot", "zoominfo"] },
      { name: "Pipeline review digest", dept: "Leadership", freq: 5, minutes: 20, people: 3, feas: 5, risk: "A", systems: ["hubspot"] },
    ],
  },
  pt: {
    label: "Physical therapy clinic",
    guard:
      "HIPAA: BAAs before PHI flows; minimum-necessary gatekeeper scoping; PHI reads block sends to non-BAA destinations; therapist signs all clinical notes.",
    starters: [
      { name: "Referral intake → chart prep + benefits worksheet", dept: "Front desk", freq: 20, minutes: 25, people: 2, feas: 4, risk: "B", systems: ["webpt", "clearing", "google"] },
      { name: "Progress-note first drafts (therapist signs)", dept: "Clinical", freq: 40, minutes: 12, people: 5, feas: 3, risk: "B", systems: ["webpt"] },
      { name: "No-show / waitlist backfill workflow", dept: "Front desk", freq: 15, minutes: 10, people: 2, feas: 4, risk: "B", systems: ["webpt", "google"] },
      { name: "Denial triage + appeal-letter drafts", dept: "Billing", freq: 8, minutes: 35, people: 1, feas: 4, risk: "B", systems: ["webpt", "clearing"] },
    ],
  },
  agency: {
    label: "AI implementation agency (our firm)",
    guard:
      "Nothing reaches a prospect or client without approval; engagement data segregated per client workspace; provisioning into client accounts only via scoped tokens behind the approval queue.",
    starters: [
      { name: "Draft personalized replies to new GHL leads", dept: "Sales", freq: 15, minutes: 15, people: 1, feas: 4, risk: "B", systems: ["ghl", "google"] },
      { name: "Synthesize discovery notes into scored use-case register", dept: "Delivery", freq: 3, minutes: 60, people: 1, feas: 4, risk: "A", systems: ["google"] },
      { name: "Generate client proposal deck from Studio design", dept: "Delivery", freq: 2, minutes: 90, people: 1, feas: 4, risk: "B", systems: ["ghl", "google"] },
      { name: "Weekly engagement status digest to active clients", dept: "Delivery", freq: 4, minutes: 30, people: 1, feas: 5, risk: "B", systems: ["ghl", "google"] },
      { name: "Chase client prerequisites (credentials, consents, IdP)", dept: "Delivery", freq: 6, minutes: 20, people: 1, feas: 4, risk: "B", systems: ["ghl", "google"] },
      { name: "Scaffold starter repo from signed engagement record", dept: "Engineering", freq: 1, minutes: 120, people: 1, feas: 3, risk: "A", systems: ["cfapi"] },
      { name: "Invoice + payment reconciliation GHL ↔ QBO ↔ Stripe", dept: "Ops", freq: 2, minutes: 30, people: 1, feas: 4, risk: "B", systems: ["qbo", "stripe", "ghl"] },
    ],
  },
  other: {
    label: "Other / general",
    guard: "Start read-only; add writes behind approval queues after the pilot proves the read path.",
    starters: [],
  },
};
