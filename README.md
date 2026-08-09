# Cloudflare OS Practice

[![CI](https://github.com/AdamSmall1830/cloudflare-os-practice/actions/workflows/ci.yml/badge.svg)](https://github.com/AdamSmall1830/cloudflare-os-practice/actions/workflows/ci.yml)

The delivery toolkit for our Cloudflare OS implementation business: taking client companies from discovery through design to a deployed, governed AI agent workspace ([Cloudflare OS](https://github.com/cloudflare/cloudflare-os)) in their own Cloudflare account.

## Documentation

| Read this | If you want to |
|---|---|
| [AGENTS.md](AGENTS.md) | **Give this repo to an AI agent** — the machine-readable operating manual: mental model, ClientRecord schema, engine API, extension recipes, and the hard rules (also loaded automatically by Claude Code via CLAUDE.md) |
| [docs/getting-started.md](docs/getting-started.md) | Set up — as an **operator** (run engagements in the Studio), a **developer** (build with the engine/CLI), or a **deployer** (host the Studio + AI endpoint) |
| [docs/studio-guide.md](docs/studio-guide.md) | Learn the Studio's UI/UX — every tab, field, scoring rule, AI-assist mode, and data-handling behavior |
| [playbook/index.html](playbook/index.html) | The delivery method itself — the 12-section field manual (open in a browser) |
| [packages/core/README.md](packages/core/README.md) | The engine's API, invariants, and its relationship to the Studio |
| [packages/scaffold/README.md](packages/scaffold/README.md) | The `cfos-scaffold` CLI — input format and generated files |
| [workers/ai-proxy/README.md](workers/ai-proxy/README.md) | Deploying the AI endpoint securely |
| [docs/skills-guide.md](docs/skills-guide.md) | The craft of writing skills — anatomy, voice rules, testing against the observation log, lifecycle |
| [docs/workflow-patterns.md](docs/workflow-patterns.md) | The five automation shapes (digest, triage, sync, chase loop, event kickoff) — structure, approval points, failure behavior, eval hooks |
| [docs/fleet.md](docs/fleet.md) | Fleet operations — the multi-client tracker and the monthly upgrade sweep protocol |
| [docs/training-outlines.md](docs/training-outlines.md) | Session-by-session curricula for the four training tracks (end user, champion, admin, builder) |
| [docs/gadget-port.md](docs/gadget-port.md) | The executable plan for porting the Studio into Cloudflare OS as a gadget — architecture mapping, the ten steps, and why the engine is already port-ready |
| [docs/forking.md](docs/forking.md) | **Fork this repo and make it your own practice** — the full make-it-yours checklist and the honest ledger of what's included |

## Architecture

```
packages/core       @cfos-practice/core — the typed engine (schema, catalogs, generators)
packages/scaffold   @cfos-practice/scaffold — CLI: Studio export JSON → starter-repo seed
workers/ai-proxy    @cfos-practice/ai-proxy — multi-provider BYOK AI proxy for the Studio's endpoint mode
workers/studio-service  @cfos-practice/studio-service — hosted multi-user Studio (record sync + submissions, Access JWT auth)
studio/             the Studio cockpit — single-file web app, zero build step
playbook/           the client delivery playbook — single-file field manual
scripts/check-app.mjs   CI guard for the HTML apps, the fixture, and core↔Studio mirror pins
```

| Piece | What it is |
|---|---|
| [`packages/core`](packages/core) | The engine: `ClientRecord` schema, system/vertical catalogs, use-case scoring + ROI, the design & scope generator (with MCP-routing split and the Workflows plan), the build-guide generator, AI-assist prompt + response validation, **eval-suite generation**, **workflow-spec generation**, and the HQ seed record. Pure functions, typed, tested with vitest. |
| [`packages/scaffold`](packages/scaffold) | `cfos-scaffold <export.json>` — reads a Studio client export and emits the full deployment kit: filled `deployment.jsonc`, numbered `SETUP.md`, gatekeeper scaffolds (custom builds only — MCP-routed systems become portal steps), skill seeds, **eval suites + run protocol**, **workflow specs for cadenced pilots**, the pilot **metrics/ROI log**, and the **security baseline with incident runbook**. This is the "deploy a design" path for developers. |
| [`workers/ai-proxy`](workers/ai-proxy) | Deployable Worker for the Studio's direct-endpoint AI mode — multi-provider **BYOK** (Anthropic, OpenAI, OpenAI-compatible, Workers AI); user keys pass through per-request, never stored. |
| [`workers/studio-service`](workers/studio-service) | The hosted multi-user Studio: serves the app + a per-identity API (record sync in KV, submissions with webhook forwarding), authenticated by **cryptographically verified Access JWTs**. Tested with vitest. |
| [`studio/index.html`](studio/index.html) | **Cloudflare OS Studio** — the vendor cockpit. Discovery capture → generated Design & Scope → personalized Build Guide. Deliberately a single self-contained file (zero dependencies, runs anywhere, artifact-hostable); state in `localStorage` with JSON export/import. Preloaded with the **"Our Firm — Cloudflare OS HQ"** record. |
| [`playbook/index.html`](playbook/index.html) | **The Client Delivery Playbook** — platform analysis, reference architecture, the 8-phase roadmap, client setup checklist, vertical playbooks, Wallets track, pricing, IT/security FAQ, and Section 12: the delivery-factory pipeline. |

**Honesty note on duplication:** the Studio currently embeds its own copy of the engine logic inline (that's what keeps it a zero-build single file). `packages/core` is the canonical, tested implementation and the one to build against; the two converge when the Studio is ported to a Cloudflare OS gadget (playbook Section 12), which consumes `core` directly. Until then, behavior changes land in `core` first, with its tests, then get mirrored into the Studio.

## Quickstart

```bash
pnpm install
pnpm check          # build + test everything
```

Generate a deployment seed from a Studio export (an example export ships in `examples/`):

```bash
pnpm scaffold examples/hq-export.json
# → out/<client-slug>/{deployment.jsonc, SETUP.md, packages/custom-gatekeeper/src/*.ts, skills/*.md}
```

Run the Studio locally:

```bash
python3 -m http.server 8080
# → http://localhost:8080/studio/
```

Published (internal — our private hosted copies; forkers host their own, see [docs/forking.md](docs/forking.md)): [Studio](https://claude.ai/code/artifact/3f91850f-1686-4911-9218-41c2809d5917) · [Playbook](https://claude.ai/code/artifact/c62fb867-9d1a-4da1-ba84-3c12644b132f)

## Using the engine

```ts
import { hqClient, designModel, scopeMarkdown, buildSteps, parseAiSuggestions } from "@cfos-practice/core";

const client = hqClient();                    // or load a Studio export
const design = designModel(client);           // pilot charter, integration map, timeline
const proposal = scopeMarkdown(design);       // markdown scope doc
const guide = buildSteps(client);             // ordered, personalized setup steps
```

## Where this is headed

- `packages/gatekeepers/*` — real, reusable custom Gatekeepers (GoHighLevel, QuickBooks Online, Stripe, HubSpot, Microsoft Graph, vertical systems) as Workers projects with tests, instantiated per client with client-specific policy
- The Studio ported to a Cloudflare OS **gadget** in our own deployment, consuming `@cfos-practice/core` directly (multi-user state, agent-readable records, Blueprint sharing)
- Actuals feedback: recording real per-gatekeeper build hours and per-workflow savings back into the catalogs

## Status

Early practice tooling, built August 2026 against Cloudflare OS v2 (early access). The build guide's platform facts (env vars, portal steps, starter behavior) are re-verified against each pinned Cloudflare OS release we adopt.
