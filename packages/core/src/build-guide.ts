import { SYSTEMS, VERTICALS } from "./catalogs.js";
import { hostnameFor, stagingFor } from "./design.js";
import { slug } from "./scoring.js";
import type { BuildStep, ClientRecord } from "./types.js";

interface SystemStepDef {
  title: string;
  body: string;
  code?: string;
  verify: string;
}

function ph(v: string, placeholder: string): string {
  return v || placeholder;
}

/**
 * Generate the personalized, ordered setup guide for a client record.
 * Bodies and verify criteria are Markdown; `code` blocks are copy-paste
 * commands, config, or scaffolds.
 */
export function buildSteps(c: ClientRecord): BuildStep[] {
  const host = hostnameFor(c);
  const stag = stagingFor(c);
  const sl = slug(c.name);
  const admins = c.adminEmails || "you@yourfirm.com";
  const vertical = VERTICALS[c.vertical];
  const steps: BuildStep[] = [];

  steps.push({
    id: "prereq",
    title: "Prepare your machine",
    body: "Everything installs on your Mac (or the client's designated deploy machine). This machine is only the **deploy workstation** — Cloudflare OS itself runs entirely on Cloudflare's network, so nothing here needs to stay online after a deploy. One block, run in Terminal:",
    code: `# Node 24 via nvm, pnpm 11, and Cloudflare's CLI
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# close & reopen the terminal, then:
nvm install 24
npm install -g pnpm@11 wrangler
wrangler login   # opens a browser — log in to the CLIENT's Cloudflare account`,
    verify:
      "`node -v` shows v24.x, `pnpm -v` shows 11.x, and `wrangler whoami` shows the client's account (not yours).",
  });

  steps.push({
    id: "account",
    title: "Cloudflare account & Workers Paid plan",
    body: `1. Have ${c.itOwner || "the IT owner"} create the account at dash.cloudflare.com/sign-up using a company email (never a personal one). If an account exists, get invited as an admin (scoped; revoked at handoff).
2. In the dashboard: **Workers & Pages → Plans → upgrade to Workers Paid** ($5/mo base).
3. Copy the **Account ID** (right-hand sidebar of any zone page, or the Workers & Pages overview) into the engagement record — it flows into the config below.`,
    verify: `Account ID recorded${c.accountId ? ` (${c.accountId})` : ""}; Workers & Pages shows "Paid plan".`,
  });

  steps.push({
    id: "zone",
    title: `Get ${host} ready`,
    body:
      c.domainOnCf === "yes"
        ? `**${c.domain || "The company domain"}** is already on Cloudflare — nothing to migrate. The deploy attaches Workers to \`${host}\` and \`${stag}\`; you only need the zone active in this account.`
        : `1. In the dashboard: **Add a domain** → enter \`${c.domain || "the company domain"}\` → the free plan is fine for DNS.
2. Cloudflare shows two nameservers. The client's IT owner updates nameservers at their registrar (registrar → domain settings → nameservers → custom).
3. Wait for the zone to show **Active** (minutes to a few hours).
4. *Alternative if IT won't move the apex domain:* delegate just a subdomain (\`os.${c.domain || "acme.com"}\`) as its own zone via NS records.`,
    verify: "The zone shows **Active** in the dashboard.",
  });

  if (c.idp === "access") {
    steps.push({
      id: "access",
      title: "Cloudflare Access application (SSO)",
      body: `1. Dashboard → **Zero Trust** (one.dash.cloudflare.com) → pick a team name if prompted (e.g. \`${sl}\`).
2. **Settings → Authentication → Login methods → Add** — connect the client's IdP (Entra ID / Google Workspace / Okta). The client's IdP admin approves the app on their side.
3. **Access → Applications → Add an application → Self-hosted.** Application domain: \`${host}\`. Policy: Allow → emails ending in \`@${c.domain || "acme.com"}\` (tighten later).
4. Copy the **Application Audience (AUD) tag** from the application's settings into the engagement record.
5. Repeat the application setup for \`${stag}\` (same IdP, a second self-hosted app).`,
      verify: `Visiting https://${host} (even before deploy) bounces to the IdP login instead of a DNS error page.`,
    });
  } else if (c.idp === "google") {
    steps.push({
      id: "gauth",
      title: "Google OAuth sign-in (auth gatekeeper)",
      body: `1. console.cloud.google.com → create a project named \`${sl}-os\`.
2. **APIs & Services → OAuth consent screen**: Internal (requires Google Workspace), app name "${c.name} Workspace", support email = IT owner.
3. **Credentials → Create credentials → OAuth client ID → Web application.** Authorized redirect URI — exactly the block below.
4. Save the client ID and secret for the gatekeeper credential config. In the deployment env set \`AUTH_GATEKEEPERS=google\` and, once sign-in works, \`DISABLE_PASSWORD_AUTH=true\`. Sign-in requests only minimal scopes (openid email profile); identity is keyed to the verified email.`,
      code: `https://${host}/gatekeeper/google/oauth`,
      verify: "OAuth client created; redirect URI matches the block character-for-character.",
    });
  } else {
    steps.push({
      id: "pwwarn",
      title: "Password sign-in (interim only)",
      body: "**Warning:** password auth is acceptable for a first look, wrong for production — no MFA, no central offboarding. Plan the switch to Access or Google OAuth before pilot. Nothing to configure now; the deploy ships with password auth on by default.",
      verify: "The sponsor has been told this is temporary, in writing.",
    });
  }

  steps.push({
    id: "clone",
    title: "Clone the starter and install",
    body: "The starter wraps a **pinned Cloudflare OS release** with the client's config — you never patch upstream code.",
    code: `git clone https://github.com/cloudflare/cloudflare-os-starter.git ${sl}-os
cd ${sl}-os
pnpm install`,
    verify: "`pnpm install` completes without errors and the repo contains `deployment.jsonc`.",
  });

  steps.push({
    id: "config",
    title: "Fill deployment.jsonc",
    body: "Open `deployment.jsonc` in the cloned repo. It ships as a commented template — set these values (match by meaning; exact key names come from the template in your pinned release):",
    code: deploymentJsonc(c),
    verify: "`pnpm check` passes (it validates this file before any deploy).",
  });

  steps.push({
    id: "deploy",
    title: "Deploy production and staging",
    body: "Two deployments from day one — staging is where every future upgrade gets tested first.",
    code: `pnpm check     # validate config
pnpm deploy    # builds and pushes to the client's account

# then repeat with the staging hostname configured:
#   ${stag}`,
    verify: `Open https://${host} → ${c.idp === "access" ? "the IdP login, then " : ""}the workspace. A test doc saves; /admin loads for an admin email.`,
  });

  steps.push({
    id: "gateway",
    title: "AI Gateway — models, budgets, allowance",
    body: `1. Dashboard → **AI → AI Gateway → Create gateway** named \`${sl}-gw\`.
2. Create an API token: **My Profile → API Tokens → Create** with **AI Gateway Run + Read** permissions on this account.
3. ${
      c.provider === "workersai"
        ? "Using Workers AI only — no external provider keys needed."
        : `Add the client's ${c.provider === "mix" ? "provider keys (Anthropic + OpenAI)" : c.provider === "openai" ? "OpenAI key" : "Anthropic key"} — created in the *client's* provider account, on enterprise/no-training terms, stored in the gateway or as Worker secrets. Never your own keys.`
    }
4. Set the platform env (secrets via the starter's secrets flow / \`wrangler secret put\`):`,
    code: `ENABLE_CLOUDFLARE_LIMITS=true
CF_AI_GATEWAY=${sl}-gw
CF_AI_GATEWAY_ACCOUNT_ID=${ph(c.accountId, "<ACCOUNT ID>")}
CF_AI_GATEWAY_API_TOKEN=<secret — use wrangler secret put>
DAILY_LLM_CALL_LIMIT=${c.dailyLimit || 100}`,
    verify:
      "Ask the workspace agent anything; the request appears in AI Gateway logs with attribution. Set a team budget alert at 80%.",
  });

  steps.push({
    id: "brand",
    title: "Branding & announcements",
    body: `1. Open https://${host}/admin as an admin email (${admins}).
2. Set site name ("${c.name} Workspace"), logo, accent color, and a welcome announcement pointing at the pilot workflows.
3. No redeploy needed — this is runtime config.`,
    verify: "A non-admin pilot user sees the client's name and logo on sign-in.",
  });

  steps.push({
    id: "mcpcheck",
    title: "Check for vendor MCP servers before building custom",
    body: `Cloudflare OS connects to external systems two ways: its own Gatekeepers, and **existing MCP servers** governed through **MCP Server Portals** (Cloudflare One AI controls). MCP v2 (spec 2026-07-28) made servers stateless HTTP workloads, and vendors are shipping official remote servers fast — so before each custom build below:
1. Check whether the vendor publishes an official remote MCP server (their developer docs, or the MCP server registries).
2. If yes: Zero Trust dashboard → **AI controls → MCP servers** → add the vendor's server URL and its auth, group servers into a **Portal**, and scope which tools each user group may call. Configuration, not code — and the vendor maintains the integration.
3. Prefer a custom Gatekeeper anyway when you need: your own approval-queue semantics on side-effectful tools, tight typed scoping (per-matter, per-realm, minimum-necessary PHI), or on-prem reach via Tunnel. Rule of thumb: **MCP for reads and vendor-maintained breadth; Gatekeepers for writes, walls, and client-owned audit policy.**`,
    verify:
      "For each system below you can say which path it uses and why; any portal-connected tools appear for a pilot user, disallowed tools are absent, and calls show up in the portal's logs.",
  });

  const sysSteps = systemSteps(c, host);
  for (const s of SYSTEMS.filter((s) => c.systems.includes(s.id)).sort((a, b) => a.wave - b.wave)) {
    const d = sysSteps[s.id];
    if (!d) continue;
    steps.push({ id: `sys-${s.id}`, title: d.title, body: d.body, code: d.code, verify: d.verify });
  }

  steps.push({
    id: "knowledge",
    title: "Load knowledge & skills",
    body: `1. Collect the SOP corpus (playbook Section 05 checklist) into an R2-backed knowledge source; connect the wiki via its gatekeeper.
2. Write the first 10–15 skills files (\`.agents/skills/\`) — one per pilot workflow, in the client's vocabulary, starting from the vertical kit and edited with the champion beside you.
3. Load the ${vertical.label} guardrails into a standing policy skill: *${vertical.guard}*`,
    verify:
      "A champion runs a pilot workflow cold; the agent uses the right terms, process, and sources — confirmed in the observation log.",
  });

  steps.push({
    id: "pilotready",
    title: "Pilot readiness — final gate",
    body: `- All pilot users signed in via ${c.idp === "access" ? "Access/IdP" : c.idp === "google" ? "Google OAuth" : "password (interim!)"}; roster loaded.
- Approval queues route: payments → **${c.approvers.payments || "⚠ unset"}**, sends → **${c.approvers.sends || "⚠ unset"}**, records → **${c.approvers.records || "⚠ unset"}**.
- Red-team pass: an agent asked to exceed scope gets refused, and the refusal is in the observation log.
- Metrics baseline recorded: hours/workflow, spend/user, approval latency.
- Champions briefed; weekly tuning session on the calendar.`,
    verify: "Sponsor signs the pilot charter; day-one pilot session scheduled.",
  });

  return steps;
}

/** The generated deployment.jsonc contents for a client. */
export function deploymentJsonc(c: ClientRecord): string {
  const host = hostnameFor(c);
  const stag = stagingFor(c);
  const sl = slug(c.name);
  const admins = (c.adminEmails || "you@yourfirm.com")
    .split(",")
    .map((e) => `"${e.trim()}"`)
    .join(", ");
  const accessLine =
    c.idp === "access"
      ? `"accessAudience": "${ph(c.audience, "<PASTE AUD TAG — Access step>")}",`
      : `// no Access audience — sign-in via ${c.idp === "google" ? "AUTH_GATEKEEPERS=google" : "password auth"}`;

  return `{
  // ---- ${c.name} · generated by @cfos-practice/core ----
  "accountId": "${ph(c.accountId, "<PASTE ACCOUNT ID>")}",
  "hostname": "${host}",
  // staging deployment (second copy of this file or env-specific block):
  //   "hostname": "${stag}",
  "workerName": "${sl}-os",
  ${accessLine}
  "adminEmails": [${admins}]
  // KV namespaces + R2 bucket auto-provision on first deploy;
  // pin them here afterwards if the template asks for explicit IDs.
}`;
}

function systemSteps(c: ClientRecord, host: string): Record<string, SystemStepDef> {
  const payments = c.approvers.payments || "APPROVER";
  const sends = c.approvers.sends || "APPROVER";
  return {
    google: {
      title: "Connect Google Workspace (stock gatekeeper)",
      body: `1. In console.cloud.google.com (same project as sign-in if you made one): enable the Gmail, Calendar, and Drive APIs.
2. Create an OAuth client (Web application) with redirect URI \`https://${host}/gatekeeper/google/oauth\`.
3. Put the client ID/secret into the Google gatekeeper's credential config (per that gatekeeper's doc page in the repo — credentials live on the gatekeeper Worker, never in agent-visible code).
4. A pilot user clicks Connect and grants the fuller scopes; policy starts **read-only**: no send scope until pilot week 2.`,
      verify:
        "A pilot user's agent can summarize their inbox, but a send attempt lands in the approval queue (or is refused) — never in Sent.",
    },
    slack: {
      title: "Connect Slack (stock gatekeeper)",
      body: `1. api.slack.com/apps → Create app → from scratch, in the client's workspace.
2. Add the scopes the gatekeeper's doc page lists (start read-only: channels:history, channels:read).
3. Install to workspace; tokens into the gatekeeper credential config.
4. Route approval-queue notifications to a private #os-approvals channel.`,
      verify: "Agent can summarize a channel; posting requires approval.",
    },
    notion: {
      title: "Connect Notion (stock gatekeeper)",
      body: `1. notion.so/my-integrations → New integration in the client's workspace, read-only capabilities first.
2. Share only the SOP/wiki pages that belong in agent context with the integration.
3. Token into the gatekeeper credential config.`,
      verify: "Agent answers a question citing a wiki page it could only know from Notion.",
    },
    confluence: {
      title: "Connect Confluence (stock gatekeeper)",
      body: `1. Create an API token in the client's Atlassian admin.
2. Scope the gatekeeper to the specific spaces that belong in agent context.
3. Token into the gatekeeper credential config.`,
      verify: "Agent cites a Confluence page correctly.",
    },
    zoominfo: {
      title: "Connect ZoomInfo (stock gatekeeper)",
      body: `1. Get API credentials from the client's ZoomInfo admin portal.
2. Configure per the gatekeeper's doc page; set a per-day lookup cap in policy.`,
      verify: "Agent enriches a test company; the lookup appears in the observation log.",
    },
    ghl: {
      title: "Build the GoHighLevel gatekeeper (custom)",
      body: `1. In GHL: **Settings → Private Integrations → Create** (or a Marketplace app if you need OAuth across locations). Scopes: contacts read, opportunities read, calendars read, conversations read. **No send scope yet** — drafts queue for approval first.
2. Configure GHL **webhooks** for the pipeline triggers: payment received and document signed → a dedicated Worker route that starts your OS kickoff/build Workflows.
3. Leave campaigns and bulk sends in GHL — the gatekeeper is for agent reads, approved one-off drafts, and inbound events.
4. Scaffold:`,
      code: gatekeeperScaffold("ghl", sends),
      verify:
        "A test lead created in GHL shows up in a workspace digest; a drafted reply waits in the approval queue; a test payment webhook fires the kickoff Workflow.",
    },
    cfapi: {
      title: "Configure the Cloudflare API gatekeeper (client provisioning)",
      body: `1. The factory's provisioning arm — lets agents create resources in *client* accounts, governed. A stock Cloudflare API gatekeeper ships with the platform.
2. Per engagement, the **client** creates a scoped API token in their account (Workers Scripts:Edit, KV:Edit, R2:Edit, AI Gateway:Edit — never a Global API Key).
3. Store each token in the gatekeeper keyed to that engagement; policy: **every provisioning action lands in your approval queue** showing the exact API call before it runs.
4. Rotate/revoke the token at handoff — it's on the acceptance checklist.`,
      verify:
        "A dry-run provisioning action against a sandbox account appears in the approval queue with the exact call listed, and executes only after approval.",
    },
    qbo: {
      title: "Build the QuickBooks Online gatekeeper (custom)",
      body: `1. developer.intuit.com → sign in with the client's Intuit developer account (create one owned by them) → Create an app → QuickBooks Online and Payments → scope com.intuit.quickbooks.accounting.
2. Redirect URI: \`https://${host}/gatekeeper/qbo/oauth\`. Note client ID/secret.
3. Connect the **sandbox company first**; production consent only after the pilot works in sandbox.
4. Scaffold:`,
      code: gatekeeperScaffold("qbo", payments),
      verify:
        "AR aging digest renders in a workspace doc from sandbox data; invoice creation waits in the approval queue.",
    },
    stripe: {
      title: "Build the Stripe gatekeeper (custom)",
      body: `1. Client's Stripe dashboard → Developers → API keys → **Create restricted key**: read on Charges/Payouts/Disputes; write on Refunds ONLY.
2. Never accept the full secret key — if offered, decline and create the restricted key together.
3. Scaffold:`,
      code: gatekeeperScaffold("stripe", payments),
      verify:
        "Revenue digest matches the Stripe dashboard for the same day; a test refund sits in the queue until approved.",
    },
    square: {
      title: "Build the Square gatekeeper (custom)",
      body: `1. developer.squareup.com → client-owned app → OAuth with read scopes on Payments/Orders; refunds write only.
2. Same pattern as Stripe: reads free, refunds behind ${payments}.`,
      verify: "Settlement digest matches the Square dashboard; refunds queue.",
    },
    hubspot: {
      title: "Build the HubSpot gatekeeper (custom)",
      body: `1. Client's HubSpot → Settings → Integrations → **Private Apps** → Create. Scopes: crm.objects.contacts.read, crm.objects.deals.read (writes later).
2. Token into the gatekeeper credential config.
3. Scaffold:`,
      code: gatekeeperScaffold("hubspot", sends),
      verify: "Call-prep brief for a real account is accurate; CRM writes appear only after approval.",
    },
    salesforce: {
      title: "Build the Salesforce gatekeeper (custom)",
      body: `1. Setup → App Manager → New Connected App; OAuth scopes api, refresh_token; callback \`https://${host}/gatekeeper/sfdc/oauth\`.
2. Use a dedicated integration user with a read-mostly profile — never an admin user.`,
      verify: "Brief generation works; writes require approval.",
    },
    m365: {
      title: "Build the Microsoft 365 gatekeeper (custom · Graph)",
      body: `1. entra.microsoft.com → App registrations → New. Single tenant. Redirect URI: \`https://${host}/gatekeeper/m365/oauth\`.
2. API permissions (delegated, admin consent): start with Mail.Read, Calendars.Read. Add write scopes only after pilot proves reads.
3. Client secret → gatekeeper credential config.
4. Scaffold in \`packages/custom-gatekeeper\` (crib the class shape from a stock gatekeeper in the upstream repo):`,
      code: gatekeeperScaffold("m365", sends),
      verify: "Agent summarizes a mailbox; drafts appear in Outlook Drafts, nothing sends.",
    },
    wealthbox: {
      title: "Build the Wealthbox/Redtail gatekeeper (custom)",
      body: `1. API token from the client's CRM admin settings.
2. Read: contacts, notes, tasks. Write (notes/tasks) behind advisor approval per the policy matrix.`,
      verify: "Meeting-prep brief pulls real CRM history; note-writes queue for the advisor.",
    },
    orion: {
      title: "Connect the portfolio platform (custom)",
      body: `1. Request API credentials through the client's Orion/Black Diamond rep (takes days — start early).
2. Read-only holdings/performance. No trading endpoints, ever.`,
      verify: "Review-deck numbers match the portfolio platform's own report.",
    },
    emoney: {
      title: "Connect planning software (custom)",
      body: "1. API access via the vendor; read-only plan summaries.",
      verify: "Plan facts in briefs match the planning tool.",
    },
    netsuite: {
      title: "Build the NetSuite gatekeeper (custom)",
      body: `1. Setup → Integration → Manage Integrations → New; token-based auth; a role limited to the records in scope (quotes, POs, items).
2. Read-only first; PO/quote writes behind ${payments}.`,
      verify: "Quote-history lookups match NetSuite saved searches.",
    },
    epicor: {
      title: "Reach the on-prem ERP (custom via Tunnel)",
      body: `1. Install cloudflared on a server that can reach the ERP's API/DB (IT does this with you).
2. Create a Tunnel; expose only the specific API endpoints needed, protected by Access service auth.
3. Gatekeeper calls through the tunnel; **read-only, always**, for anything near OT/MES.`,
      verify: "Downtime digest matches the ERP report; the tunnel dashboard shows only expected traffic.",
    },
    cmms: {
      title: "Connect the CMMS (custom)",
      body: "1. API token from the CMMS admin; read tickets/assets, write (new ticket drafts) behind approval.",
      verify: "Maintenance summaries cite real tickets.",
    },
    clio: {
      title: "Build the Clio gatekeeper (custom)",
      body: `1. app.clio.com → Settings → Developer Applications → New; redirect \`https://${host}/gatekeeper/clio/oauth\`.
2. Read matters/contacts/calendars; time-entry and document writes behind attorney approval.`,
      verify: "Docket digest matches Clio's calendar; nothing writes without approval.",
    },
    imanage: {
      title: "Connect the DMS (custom)",
      body: `1. API access via the client's DMS admin (iManage Control Center / NetDocuments admin).
2. **Scope per matter** — the gatekeeper enforces ethical walls; verify a walled user cannot pull a walled matter.`,
      verify: "Red-team check: an agent for a walled user gets a refusal, logged in observations.",
    },
    webpt: {
      title: "Connect the EMR (custom · PHI)",
      body: `**STOP unless BAAs are signed** — Cloudflare (enterprise) and the model provider. No PHI flows before paperwork.
1. API credentials via the EMR's integration program (WebPT/Prompt/Jane each have one; lead time days–weeks).
2. Minimum-necessary scoping per role; therapists see their patients only.
3. Data-flow policy: PHI reads block external sends.`,
      verify:
        "Chart-prep worksheet renders for a test patient; an attempted external send after a PHI read is blocked and logged.",
    },
    clearing: {
      title: "Connect eligibility/clearinghouse (custom · PHI)",
      body: `1. API credentials from the clearinghouse account.
2. Per-check logging; benefits worksheets only — no claim submission in phase one.`,
      verify: "Benefits check for a test patient matches the portal's answer.",
    },
  };
}

/** TypeScript scaffold for a custom gatekeeper. Clearly a template: align the
 * class shape with the gatekeeper interface in the pinned release. */
export function gatekeeperScaffold(id: string, approver: string): string {
  const cls = id.charAt(0).toUpperCase() + id.slice(1);
  const bodies: Record<string, string> = {
    ghl: `  async newLeads(since: string)        { /* GET /contacts, filter by created date */ }
  async engagementPipeline()           { /* opportunities by pipeline stage */ }
  async draftReply(contactId: string, body: string) {
    /* create draft only — enqueue for approval by: ${approver} */
  }
  // Inbound: a webhook route receives payment + document-signed events
  // and triggers the kickoff / build Workflows.`,
    qbo: `  async arAging(realmId: string)              { /* read: AgedReceivables report */ }
  async recentTransactions(realmId: string)   { /* read-only queries */ }
  async draftInvoice(realmId: string, data: unknown) {
    /* create as DRAFT + enqueue for approval by: ${approver} */
  }`,
    stripe: `  async dailyRevenue()                     { /* read: charges + payouts */ }
  async disputeEvidence(disputeId: string) { /* read + assemble evidence doc */ }
  async refund(chargeId: string, amountCents: number) {
    /* HARD GATE: enqueue for ${approver}; execute only on approval */
  }`,
    hubspot: `  async accountBrief(companyId: string)  { /* contacts + deals + notes for call prep */ }
  async pipelineDigest(ownerId: string)  { /* open deals by stage, stale flags */ }
  async logActivity(dealId: string, note: string) { /* write behind approval or auto per policy */ }`,
    m365: `  async summarizeInbox(userId: string, since: string) { /* Graph: GET /me/messages */ }
  async listEvents(userId: string, range: string)     { /* Graph: GET /me/calendarView */ }
  async draftReply(messageId: string, body: string)   { /* create draft only — never send */ }`,
  };
  const body =
    bodies[id] ??
    `  // Expose narrow, typed capabilities only; reads first, writes behind approval.
  async read(resource: string)  { /* scoped read */ }
  async draft(action: string)   { /* enqueue for approval by: ${approver} */ }`;

  return `// packages/custom-gatekeeper/src/${id}.ts — SCAFFOLD: align with your
// pinned release's gatekeeper interface before shipping.
export class ${cls}Gatekeeper {
  // Credentials live here, injected as Worker secrets — never visible to agents.
${body}
}`;
}

/** Render the full build guide as a Markdown document (used for SETUP.md). */
export function buildGuideMarkdown(c: ClientRecord): string {
  const steps = buildSteps(c);
  const head = `# ${c.name} — Cloudflare OS Setup Guide
Generated from the engagement record by @cfos-practice/core. Follow top to bottom; each step ends with its acceptance check.
`;
  const body = steps
    .map((s, i) => {
      const code = s.code ? `\n\n\`\`\`\n${s.code}\n\`\`\`` : "";
      return `## ${i + 1}. ${s.title}\n\n${s.body}${code}\n\n> **You know it worked when:** ${s.verify}`;
    })
    .join("\n\n");
  return `${head}\n${body}\n`;
}
