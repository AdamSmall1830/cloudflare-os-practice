# @cfos-practice/core

The engine behind Cloudflare OS Studio and the scaffold CLI. Pure, typed functions over one
data structure — the **`ClientRecord`** (a client engagement) — with no I/O, no DOM, and no
side effects, so everything is trivially testable and reusable from any runtime (Node, Workers,
browser, a future Cloudflare OS gadget).

```
src/types.ts        ClientRecord, UseCase, SystemDef, BuildStep, DesignModel …
src/catalogs.ts     SYSTEMS (gatekeeper targets), VERTICALS (+ starter use cases), INTERVIEW_QUESTIONS
src/scoring.ts      hoursPerMonth, rankUseCases, clampNum, slug
src/design.ts       designModel, scopeMarkdown, hostnameFor, stagingFor
src/build-guide.ts  buildSteps, buildGuideMarkdown, deploymentJsonc, gatekeeperScaffold
src/ai.ts           aiPrompt, parseAiSuggestions
src/seed.ts         blankClient, hqClient (the firm's own HQ record)
```

## Usage

```ts
import {
  hqClient, blankClient,          // records
  designModel, scopeMarkdown,     // design & proposal
  buildSteps, buildGuideMarkdown, // setup guide
  aiPrompt, parseAiSuggestions,   // AI assist round-trip
} from "@cfos-practice/core";

const client = hqClient();

// Design: pilot charter (manual flags win; else top-5 by score, C-risk excluded),
// integration map (stock vs custom, waves), and a computed timeline.
const design = designModel(client);
design.totalHrs;                  // value anchor: recoverable hours/month across the pilot set

// Proposal-ready markdown (pass a date for deterministic output):
scopeMarkdown(design, { date: "2026-08-06" });

// The ordered, personalized setup guide. Bodies/verify are Markdown; `code`
// blocks are commands/config. Branches on idp, domainOnCf, provider, systems.
for (const step of buildSteps(client)) step.id; // "prereq" … "sys-ghl" … "pilotready"

// AI assist: build the prompt from captured discovery, then validate whatever
// the model returns (fence-stripping, clamping, dedupe, unknown-system filter, 15-row cap).
const prompt = aiPrompt(client);
const { useCases, added, skipped, error } = parseAiSuggestions(modelResponse, client.useCases);
```

## Invariants worth knowing

- **Scoring:** `hrsMo = freq × minutes × people × 4.33 ÷ 60`; ranking score multiplies by feasibility.
- **Risk tiers:** A read-only · B write-behind-approval · C external side effects. C is never auto-piloted.
- **Slugs** are capped at 24 chars (hostcandidate/worker-name safety).
- **Placeholders, not lies:** unknown domain/account/audience render as explicit `<PASTE …>` / `CLIENT-DOMAIN.com` markers, never invented values.
- `ClientRecord` matches the Studio's export format (`{ client: ClientRecord }` or bare).

## Relationship to the Studio

`studio/index.html` embeds its own inline copy of this logic to remain a zero-build single file.
**This package is canonical** — change behavior here first (with tests), then mirror to the Studio.
The duplication ends when the Studio becomes a Cloudflare OS gadget importing this package.

```bash
pnpm --filter @cfos-practice/core build
pnpm --filter @cfos-practice/core test   # 23 tests
```
