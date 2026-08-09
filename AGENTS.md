# AGENTS.md — operating manual for AI agents

You are working in the **Cloudflare OS Practice** repo: the delivery toolkit a consulting practice uses to take a client business from discovery → design → a deployed, governed [Cloudflare OS](https://github.com/cloudflare/cloudflare-os) agent workspace in the client's own Cloudflare account. This file tells you — an AI agent — how the system fits together, how to operate it for your user, and the rules that keep your output correct.

## The mental model (read this first)

```
Studio (web app, planning cockpit)          ← captures discovery, generates design + build guide
   │  Export → cfos-<client>.json           ← ONE data structure: the ClientRecord
   ▼
cfos-scaffold CLI                           ← ClientRecord → 20-file deployment kit
   │  deployment.jsonc · SETUP.md · gatekeeper scaffolds · skills · evals · workflows · metrics · security baseline
   ▼
cloudflare/cloudflare-os-starter (clone)    ← the kit is copied into this; pnpm deploy pushes it
   ▼
Cloudflare OS — live at https://os.<client-domain> behind Cloudflare Access
```

Three facts agents most often get wrong — don't:

1. **The Studio never touches any Cloudflare account.** It holds no credentials and calls no APIs. The account connection happens only when the human runs `wrangler login` (browser OAuth on their machine) and `pnpm deploy` (step 1 and 7 of the generated guide).
2. **Cloudflare OS is not in this repo.** This repo *plans, generates, and seeds* deployments of the upstream open-source platform. The deployed OS is a website at the client's hostname; users log in there daily. This repo's Studio remains the vendor's planning cockpit outside it.
3. **The engine is duplicated on purpose.** `packages/core` (TypeScript, tested) is **canonical**; `studio/index.html` embeds a mirrored copy inline to stay a zero-build single file. Behavior changes land in `core` first *with tests*, then get mirrored into the Studio by hand. Never change one without the other.

## Repo map

```
packages/core/        @cfos-practice/core — the canonical engine (schema, catalogs, generators). Start here.
packages/scaffold/    cfos-scaffold CLI — ClientRecord JSON in, deployment kit out (src/generate.ts is pure).
workers/ai-proxy/     Multi-provider BYOK AI proxy (anthropic/openai/openai-compatible/workers-ai; keys pass through, never stored).
workers/studio-service/  Hosted multi-user Studio: serves the app + per-identity record sync/submissions (verified Access JWTs, KV).
studio/index.html     The Studio web app — single file, no build, localStorage state, embeds engine mirror.
playbook/index.html   The delivery-method field manual (12 sections) — open in a browser.
docs/                 Human guides: getting-started, studio-guide, skills-guide, workflow-patterns,
                      fleet, training-outlines, forking.
examples/hq-export.json   A complete ClientRecord fixture (the firm's own HQ record).
```

## Commands

```bash
pnpm install                     # Node >= 20, pnpm 9 (pinned via packageManager)
pnpm check                       # build all packages + run all tests — must pass before any commit
pnpm scaffold <export.json>      # generate a deployment kit (builds deps first; try examples/hq-export.json)
python3 -m http.server 8080      # serve the repo → Studio at /studio/, playbook at /playbook/
```

CI (`.github/workflows/ci.yml`) runs install → build → test on every push.

## The data model: ClientRecord

One JSON structure drives everything (full types: `packages/core/src/types.ts`). Studio export format is `{"client": ClientRecord}`; a bare record is also accepted.

Key fields and what they drive:

| Field | Drives |
|---|---|
| `name`, `domain` | Titles, slugs, worker names, hostnames (`os.<domain>`), OAuth redirect URIs |
| `vertical` | Which systems appear, starter use cases, guardrail policy (`manufacturing · law · finserv · salesmkt · pt · agency · other`) |
| `idp` (`access`/`google`/`password`), `domainOnCf` | Which sign-in and DNS steps the build guide emits |
| `provider`, `dailyLimit`, `hourlyRate` | AI Gateway env block; ROI dollar anchor (`hourlyRate` invalid → $50 fallback) |
| `systems[]` | Integration map + one build-guide step per system (catalog: `catalogs.ts` SYSTEMS) |
| `mcpRoutes{id:bool}` | Routes a custom system through an MCP Server Portal: portal step instead of gatekeeper build, no code stub, portal-held credential in the baseline |
| `knowledge[]` (`{name,type,owner}`) | Retrieval plan: `sops`→R2+AI Search · `wiki`→its gatekeeper · `templates`→doc templates · `data`→live gatekeeper reads |
| `useCases[]` | The register. Scoring: `hrsMo = freq × minutes × people × 4.33 ÷ 60`; risk `A` read-only / `B` write-behind-approval / `C` external side effects |
| `useCases[].pilot`, `.cadence` | Pilot charter (manual flags win; else top-5 by score, C excluded). `cadence` ≠ `demand` → a platform Workflow spec |
| `approvers{payments,sends,records}` | Threaded into policy matrix, gatekeeper scaffolds, workflow specs, security baseline — always named humans |

## Engine API (import from `@cfos-practice/core`)

```ts
designModel(client)        // → pilots, integration split (stock/mcpRouted/customBuild), workflows, totalHrs/totalValue, timeline
scopeMarkdown(model, {date}) // → proposal-ready markdown (pass date for deterministic output)
buildSteps(client)         // → ordered BuildStep[] (17 for the HQ record); buildGuideMarkdown() renders SETUP.md
deploymentJsonc(client)    // → starter-template config with real values or explicit <PASTE …> placeholders
aiPrompt(client)           // → pass-1 draft prompt: evidence corpus + vertical guardrail/exemplars + schema:
                           //    [{"name","dept","freq","minutes","people","feas","risk":"A|B|C",
                           //      "cadence":"demand|daily|weekly|event","systems":["id"],"evidence":"..."}]
aiCritiquePrompt(client, draftJson) // → pass-2 skeptical evidence check; returns the corrected array, same schema
parseAiSuggestions(raw, existing) // → validated use cases (fence-stripping, clamping, cadence/risk whitelists, dedupe, 15 cap)
evalSuites(client)         // → platform red-team suite (6 blockers) + golden suites per pilot; evalRunMarkdown() = protocol
workflowSpecs(client)      // → pattern-instantiated specs for cadenced pilots (patterns: docs/workflow-patterns.md)
hqClient() / blankClient(name)  // seeds; hqClient() is the firm's own record and the main test fixture
```

Invariants you must preserve: slugs cap at 24 chars; unknown values render as explicit placeholders (never invented); C-risk never auto-pilots; every red-team eval is a blocker; approvers are named humans, not roles.

## Helping a user build a Cloudflare OS system, end to end

1. **Discovery:** work in the Studio (or edit a ClientRecord directly). Capture profile + domain first — everything regenerates from it. Seed vertical starters, add use cases from interviews/inbox. You can run `aiPrompt()`'s output through yourself and feed the JSON back via the Studio's paste box or `parseAiSuggestions`.
2. **Integration paths:** for each custom system, check whether the vendor publishes an official remote MCP server (their docs — verify at build time, surfaces change). If yes and the need is reads/breadth → set `mcpRoutes[id]=true` (portal, config-only). Writes, ethical walls, PHI scoping, on-prem → keep the gatekeeper build.
3. **Design review:** `designModel` + the Studio's tab 2. The dollar anchor (`totalValue`) is the pricing conversation.
4. **Generate the kit:** `pnpm scaffold export.json`. Walk the human through `SETUP.md` top to bottom — every step has a "you know it worked when" check.
5. **Know what only the human can do:** `wrangler login`, creating accounts, granting OAuth consents, IdP/BAA paperwork, approving queued side effects, signing contracts. Never claim you can do these; never ask the user to paste credentials into you.
6. **Before pilot:** complete the skills (`docs/skills-guide.md` — seven-part anatomy, client vocabulary verbatim, judgment marked), pin the eval `EDIT` placeholders to real fixtures, run the full eval protocol (`EVALS.md`): all blockers + ≥90% golden.
7. **Operate:** metrics weekly (`METRICS.md`), security baseline current, upgrades via the fleet sweep (`docs/fleet.md`): staging → evals → promote, HQ instance first.

## Extending the system (recipes)

All extensions: edit `packages/core` first → update/add tests → `pnpm check` → mirror the same change into `studio/index.html`'s inline copy → verify the Studio in a browser.

- **New vertical:** `catalogs.ts` VERTICALS (label, guard sentence, 4–7 starters) + any vertical-scoped systems.
- **New system:** `catalogs.ts` SYSTEMS entry (`kind`, `cls`, `wave`, `effort`, optional `vert`) + a step def in `build-guide.ts` `systemSteps()` (+ scaffold hints in `gatekeeperScaffold()` if custom).
- **New build step:** `build-guide.ts` — keep the id stable, update the expected-ids test.
- **New eval case:** `evals.ts` — red-team cases are always `severity: "blocker"`.
- Regenerate the fixture after seed/schema changes:
  `node --input-type=module -e "import{hqClient}from'./packages/core/dist/index.js';import{writeFileSync}from'node:fs';const c=hqClient();c.domain='example-firm.com';writeFileSync('examples/hq-export.json',JSON.stringify({client:c},null,2)+'\n')"`

## Hard rules for agents in this repo

1. **Truth over fluency.** Platform facts (env vars, portal click-paths, starter config keys) were verified August 2026 against Cloudflare OS v2 early-access — an actively moving target. When you state a platform fact, prefer "per the pinned release" phrasing; when generating configs, keep the explicit `<PASTE …>` placeholder style rather than inventing values.
2. **No credentials anywhere in this repo or in chat.** Keys live in Worker secrets, gatekeeper config, or portal config — never in code, docs, exports, or your context.
3. **Keep the Studio a single self-contained file** — no external dependencies, no build step; it must run from `file://` and inside a sandboxed iframe (external network calls are blocked there; that's why AI assist has the copy-paste mode).
4. **`pnpm check` green before any commit.** Tests are behavior pins, not decoration — when you change behavior, change the test *deliberately* and say so.
5. **Human approval gates are the product**, not friction to optimize away: outbound sends, payments, deploys to client accounts, and anything a regulator would ask about stay behind named-human approval queues.

## Where the human docs live

`README.md` (index) · `docs/getting-started.md` (operator/developer/deployer paths) · `docs/studio-guide.md` (full UI walkthrough) · `docs/skills-guide.md` · `docs/workflow-patterns.md` · `docs/fleet.md` · `docs/training-outlines.md` · `docs/forking.md` (make-it-yours) · `playbook/index.html` (the delivery method itself — pricing, verticals, the delivery-factory pipeline).
