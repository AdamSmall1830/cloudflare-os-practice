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

export interface UseCase extends StarterUseCase {
  /** Selected for the pilot charter. */
  pilot: boolean;
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
  /** Selected system ids from the catalog. */
  systems: string[];
  otherSystems: string;
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
  custom: SystemDef[];
  ranked: ScoredUseCase[];
  /** The pilot charter: manual pilot flags if any, else auto-suggested. */
  pilots: ScoredUseCase[];
  /** True when pilots were auto-suggested rather than manually flagged. */
  autoSuggested: boolean;
  /** Total recoverable hours/month across the pilot set. */
  totalHrs: number;
  /** Estimated engagement length in weeks. */
  weeks: number;
  /** Integration-phase weeks. */
  intWeeks: number;
  /** Discovery weeks (compressed for small orgs). */
  discoveryWeeks: number;
  rolloutWeeks: number;
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

/** Result of parsing an AI-assist response. */
export interface IngestResult {
  useCases: UseCase[];
  added: number;
  skipped: number;
  /** Present when nothing could be parsed at all. */
  error?: string;
}
