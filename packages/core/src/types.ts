/** Risk tier of a use case: A = read-only, B = write behind approval, C = external side effects. */
export type RiskTier = "A" | "B" | "C";

/** How users sign in to the deployment. */
export type SignInMethod = "access" | "google" | "password";

/** Model provider strategy routed through AI Gateway. */
export type ModelProvider = "anthropic" | "openai" | "mix" | "workersai";

export type VerticalId =
  | "manufacturing"
  | "law"
  | "finserv"
  | "salesmkt"
  | "pt"
  | "agency"
  | "other";

/** An external system the client runs, reachable only through a Gatekeeper. */
export interface SystemDef {
  id: string;
  label: string;
  /** "stock" ships with Cloudflare OS; "custom" is a Gatekeeper we build. */
  kind: "stock" | "custom";
  /** Integration class for custom gatekeepers (effort/pricing driver). */
  cls?: string;
  /** Build wave: 1 stock/comms, 2 cross-industry custom, 3 vertical/line-of-business. */
  wave: 1 | 2 | 3;
  /** First-build effort estimate, human-readable. */
  effort: string;
  /** When set, the system is only offered for this vertical. */
  vert?: VerticalId;
}

export interface StarterUseCase {
  name: string;
  dept: string;
  /** Occurrences per week. */
  freq: number;
  /** Minutes per occurrence. */
  minutes: number;
  /** People doing this work. */
  people: number;
  /** API/data feasibility, 1–5. */
  feas: number;
  risk: RiskTier;
  /** System ids from the catalog. */
  systems: string[];
}

/** How a workflow runs: on demand, on a schedule, or on an external event. */
export type Cadence = "demand" | "daily" | "weekly" | "event";

export interface UseCase extends StarterUseCase {
  /** Selected for the pilot charter. */
  pilot: boolean;
  /** Execution cadence; scheduled/event cadences become platform Workflows. Default "demand". */
  cadence?: Cadence;
}

/** One knowledge source captured in discovery. */
export interface KnowledgeSource {
  name: string;
  /** sops → R2 + AI Search · wiki → its gatekeeper · templates → document templates · data → live gatekeeper reads. */
  type: "sops" | "wiki" | "templates" | "data" | "other";
  owner: string;
}

export interface VerticalDef {
  label: string;
  /** Standing guardrail sentence for the vertical. */
  guard: string;
  starters: StarterUseCase[];
}

export interface Interview {
  person: string;
  role: string;
  date: string;
  /** Answers keyed by question index into INTERVIEW_QUESTIONS. */
  answers: Record<number, string>;
}

export interface InboxItem {
  text: string;
  dept: string;
  /** Estimated occurrences per week. */
  freq: number;
}

export interface Approvers {
  payments: string;
  sends: string;
  records: string;
}

/**
 * One client engagement record — the single source of truth that the design
 * generator, build guide, and scaffold CLI all consume. Matches the Studio
 * app's export format (`{ client: ClientRecord }`).
 */
export interface ClientRecord {
  name: string;
  vertical: VerticalId;
  size: number | string;
  sponsor: string;
  itOwner: string;
  /** Company apex domain, e.g. "acme.com". Empty until known. */
  domain: string;
  /** Cloudflare account id (32 hex chars). Empty until known. */
  accountId: string;
  /** Cloudflare Access application audience (AUD) tag. Empty until known. */
  audience: string;
  /** Comma-separated admin emails. */
  adminEmails: string;
  idp: SignInMethod;
  domainOnCf: "yes" | "no";
  provider: ModelProvider;
  /** Per-user daily free LLM-call allowance (DAILY_LLM_CALL_LIMIT). */
  dailyLimit: number;
  /** Loaded hourly rate in dollars, used to convert recovered hours into ROI. */
  hourlyRate: number;
  /** Selected system ids from the catalog. */
  systems: string[];
  /** System ids routed through a vendor MCP server via an MCP Server Portal instead of a custom gatekeeper build. */
  mcpRoutes: Record<string, boolean>;
  otherSystems: string;
  /** Knowledge sources inventoried in discovery; drives the retrieval plan. */
  knowledge: KnowledgeSource[];
  interviews: Interview[];
  inbox: InboxItem[];
  surveyNotes: string;
  useCases: UseCase[];
  approvers: Approvers;
  /** Build-guide completion state, keyed by step id. */
  steps: Record<string, boolean>;
}

/** A use case annotated with derived scoring. */
export interface ScoredUseCase extends UseCase {
  /** Estimated recoverable hours per month (freq × minutes × people × 4.33 / 60). */
  hrsMo: number;
  /** Ranking score: weekly minutes × feasibility. */
  score: number;
}

/** Output of the design generator. */
export interface DesignModel {
  client: ClientRecord;
  chosen: SystemDef[];
  stock: SystemDef[];
  /** All custom-kind systems (mcpRouted ∪ customBuild). */
  custom: SystemDef[];
  /** Custom-kind systems routed through an MCP Server Portal (config, not code). */
  mcpRouted: SystemDef[];
  /** Custom-kind systems we actually build gatekeepers for. */
  customBuild: SystemDef[];
  /** Pilot workflows with a scheduled/event cadence — the platform Workflows plan. */
  workflows: ScoredUseCase[];
  ranked: ScoredUseCase[];
  /** The pilot charter: manual pilot flags if any, else auto-suggested. */
  pilots: ScoredUseCase[];
  /** True when pilots were auto-suggested rather than manually flagged. */
  autoSuggested: boolean;
  /** True when use cases exist but none are pilot-eligible (all tier C). */
  noEligiblePilots: boolean;
  /** Total recoverable hours/month across the pilot set. */
  totalHrs: number;
  /** totalHrs × hourlyRate — the dollar value anchor per month. */
  totalValue: number;
  /** The effective loaded hourly rate used for totalValue (invalid inputs fall back to $50). */
  hourlyRate: number;
  /** Estimated engagement length in weeks. */
  weeks: number;
  /** Integration-phase weeks. */
  intWeeks: number;
  /** Discovery weeks (compressed for small orgs). */
  discoveryWeeks: number;
  rolloutWeeks: number;
}

/** One layer of the assembled AI ecosystem: methods, knowledge, or live systems. */
export interface EcosystemLayer {
  id: "methods" | "knowledge" | "systems";
  /** Client-facing label, e.g. "Your methods". */
  title: string;
  /** One-line plain-language gloss of what this layer is. */
  gloss: string;
  /** The concrete captured items feeding this layer (names). */
  items: string[];
  /** How this layer enters the AI team (skills / retrieval / gatekeeper reads). */
  route: string;
}

/**
 * The client's bespoke AI ecosystem, assembled from captured discovery + design
 * data into the three-layers-plus-governance story: the answer to "how do I use
 * powerful AI that knows my business, without handing my data to anyone?"
 */
export interface EcosystemModel {
  /** The three feeding layers, in narrative order: methods → knowledge → systems. */
  layers: EcosystemLayer[];
  /** The governance frame around everything (account, access, logging, approvals). */
  governance: string[];
  /** What the assembled team produces, grounded in the pilot set. */
  outputs: string;
  /** Honest gaps: what isn't captured yet, and what that costs — never oversells. */
  gaps: string[];
}

/** One step of the generated build guide. Bodies are Markdown. */
export interface BuildStep {
  id: string;
  title: string;
  body: string;
  /** Copy-paste block (commands, config, or code scaffold). */
  code?: string;
  /** "You know it worked when …" acceptance criterion. */
  verify: string;
}

/** One evaluation case: a golden task or a red-team probe. */
export interface EvalCase {
  id: string;
  kind: "golden" | "redteam";
  title: string;
  /** What to ask the agent / do, verbatim, in a fresh workspace. */
  prompt: string;
  /** Human-judgeable pass criteria, including what the observation log must show. */
  expected: string;
  /** Red-team cases are blockers by default; golden cases majors. */
  severity: "blocker" | "major" | "minor";
  tags: string[];
}

/** A named suite of eval cases — one per pilot workflow plus the platform suite. */
export interface EvalSuite {
  /** "platform" for the universal guardrail suite, else the workflow name. */
  workflow: string;
  cases: EvalCase[];
}

/** Result of parsing an AI-assist response. */
export interface IngestResult {
  useCases: UseCase[];
  added: number;
  skipped: number;
  /** Present when nothing could be parsed at all. */
  error?: string;
}
