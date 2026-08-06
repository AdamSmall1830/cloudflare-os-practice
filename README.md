# Cloudflare OS Practice

The delivery toolkit for our Cloudflare OS implementation business: taking client companies from discovery through design to a deployed, governed AI agent workspace ([Cloudflare OS](https://github.com/cloudflare/cloudflare-os)) in their own Cloudflare account.

## Architecture

```
packages/core       @cfos-practice/core — the typed engine (schema, catalogs, generators)
packages/scaffold   @cfos-practice/scaffold — CLI: Studio export JSON → starter-repo seed
workers/ai-proxy    @cfos-practice/ai-proxy — Worker backing the Studio's AI endpoint mode
studio/             the Studio cockpit — single-file web app, zero build step
playbook/           the client delivery playbook — single-file field manual
```

| Piece | What it is |
|---|---|
| [`packages/core`](packages/core) | The engine: `ClientRecord` schema, system/vertical catalogs, use-case scoring, the design & scope generator (`designModel`, `scopeMarkdown`), the build-guide generator (`buildSteps`, `buildGuideMarkdown`, `deploymentJsonc`), AI-assist prompt + response validation (`aiPrompt`, `parseAiSuggestions`), and the HQ seed record. Pure functions, typed, tested with vitest. |
| [`packages/scaffold`](packages/scaffold) | `cfos-scaffold <export.json>` — reads a Studio client export and emits a starter-repo seed: filled `deployment.jsonc`, per-system gatekeeper scaffolds, skill seeds for the pilot workflows, and a numbered `SETUP.md` with acceptance checks. This is the "deploy a design" path for developers. |
| [`workers/ai-proxy`](workers/ai-proxy) | Deployable Worker for the Studio's direct-endpoint AI mode. Anthropic key in a Worker secret, CORS locked to the Studio origin, Access in front. |
| [`studio/index.html`](studio/index.html) | **Cloudflare OS Studio** — the vendor cockpit. Discovery capture → generated Design & Scope → personalized Build Guide. Deliberately a single self-contained file (zero dependencies, runs anywhere, artifact-hostable); state in `localStorage` with JSON export/import. Preloaded with the **"Our Firm — Cloudflare OS HQ"** record. |
| [`playbook/index.html`](playbook/index.html) | **The Client Delivery Playbook** — platform analysis, reference architecture, the 8-phase roadmap, client setup checklist, vertical playbooks, Wallets track, pricing, IT/security FAQ, and Section 12: the delivery-factory pipeline. |

**Honesty note on duplication:** the Studio currently embeds its own copy of the engine logic inline (that's what keeps it a zero-build single file). `packages/core` is the canonical, tested implementation and the one to build against; the two converge when the Studio is ported to a Cloudflare OS gadget (playbook Section 12), which consumes `core` directly. Until then, behavior changes land in `core` first, with its tests, then get mirrored into the Studio.

## Quickstart

```bash
pnpm install
pnpm check          # build + test everything
```

Generate a deployment seed from a Studio export:

```bash
pnpm scaffold path/to/cfos-client.json
# → out/<client-slug>/{deployment.jsonc, SETUP.md, packages/custom-gatekeeper/src/*.ts, skills/*.md}
```

Run the Studio locally:

```bash
python3 -m http.server 8080
# → http://localhost:8080/studio/
```

Published (private) artifact copies: [Studio](https://claude.ai/code/artifact/3f91850f-1686-4911-9218-41c2809d5917) · [Playbook](https://claude.ai/code/artifact/c62fb867-9d1a-4da1-ba84-3c12644b132f)

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
