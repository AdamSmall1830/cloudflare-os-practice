import { VERTICALS } from "./catalogs.js";
import type { ClientRecord } from "./types.js";

/** A fresh, empty client record. */
export function blankClient(name: string): ClientRecord {
  return {
    name,
    vertical: "other",
    size: "",
    sponsor: "",
    itOwner: "",
    domain: "",
    accountId: "",
    audience: "",
    adminEmails: "",
    idp: "access",
    domainOnCf: "yes",
    provider: "anthropic",
    dailyLimit: 100,
    hourlyRate: 50,
    systems: [],
    otherSystems: "",
    interviews: [],
    inbox: [],
    surveyNotes: "",
    useCases: [],
    approvers: { payments: "", sends: "", records: "" },
    steps: {},
  };
}

/**
 * The firm's own HQ engagement record — the seed the Studio preloads so the
 * Build Guide walks through standing up our own Cloudflare OS (the delivery
 * factory, playbook Section 12) before any client build.
 */
export function hqClient(): ClientRecord {
  const starters = VERTICALS.agency.starters;
  return {
    ...blankClient("Our Firm — Cloudflare OS HQ"),
    vertical: "agency",
    size: 3,
    sponsor: "Adam (Principal)",
    itOwner: "Adam (Principal)",
    idp: "access",
    domainOnCf: "no",
    provider: "anthropic",
    dailyLimit: 200,
    hourlyRate: 60,
    systems: ["ghl", "google", "qbo", "stripe", "cfapi"],
    otherSystems: "E-signature via GoHighLevel Documents",
    approvers: {
      payments: "Adam (Principal)",
      sends: "Adam (Principal)",
      records: "Adam (Principal)",
    },
    interviews: [
      {
        person: "Adam",
        role: "Principal",
        date: "",
        answers: {
          0: "Checked GHL for overnight leads and wrote three near-identical intro replies; updated the proposal template for a PT-clinic prospect; chased a client for their Stripe key; hand-assembled a weekly status update.",
          1: "Lead intro/follow-up emails, proposal assembly from the same building blocks, weekly engagement status updates, and re-keying GHL contact data into documents.",
          2: "How our discovery → design → build delivery method works end to end — it currently lives in one head and the playbook.",
          3: "'Just checking in' prospect replies, and clients asking where their build stands — both deserve fast, good answers without me drafting each one.",
          4: "The delivery method, effort estimates, and per-vertical patterns — the playbook and this Studio are the start of externalizing it.",
          5: "Weekly engagement status per active client (from email, repo activity, and GHL) and a monthly P&L view from QuickBooks.",
          7: "GHL ↔ proposal documents ↔ QuickBooks invoices — the same client data gets re-keyed three times.",
          9: "Final proposal pricing, anything sent to a prospect or client, and any deploy into a client's Cloudflare account.",
        },
      },
    ],
    inbox: [
      { text: "New lead asked for a PT-clinic case study — third time writing this reply from scratch", dept: "Sales", freq: 3 },
      { text: "Re-keyed GHL contact + deal data into the proposal doc again", dept: "Delivery", freq: 2 },
      { text: "Client hasn't sent their IdP admin contact — third chase email this week", dept: "Delivery", freq: 2 },
      { text: "Assembled the weekly status update by hand from email threads + commit log", dept: "Delivery", freq: 4 },
    ],
    surveyNotes:
      "Small-team firm. Recurring themes: lead-reply drafting, proposal assembly, prerequisite chasing, and status reporting — all flowing through GoHighLevel + Google Workspace, invoiced via QBO/Stripe. Target architecture is the delivery-factory pipeline in playbook Section 12; this HQ deployment is its foundation.",
    useCases: starters.map((s, i) => ({ ...s, systems: [...s.systems], pilot: i < 4 })),
  };
}
