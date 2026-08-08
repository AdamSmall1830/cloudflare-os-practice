# @cfos-practice/scaffold

CLI that turns a Studio client export into a **deployment seed** — the files you copy into a
fresh clone of [cloudflare/cloudflare-os-starter](https://github.com/cloudflare/cloudflare-os-starter)
to begin a build. This is the bridge from "design captured" to "repo ready".

## Usage

```bash
# from the repo root (the script builds its dependencies first):
pnpm scaffold examples/hq-export.json            # bundled example → out/our-firm-cloudflare-os-h/
pnpm scaffold path/to/cfos-client.json           # → out/<client-slug>/
pnpm scaffold path/to/cfos-client.json -o mydir  # explicit output dir
```

Input: a Studio **Export** file — `{"client": {...}}` — or a bare `ClientRecord` JSON.

## What it generates

```
out/<slug>/
├── deployment.jsonc                    # starter-template values, client's real hostname/account
├── SETUP.md                            # the full numbered build guide with acceptance checks
├── EVALS.md                            # eval run protocol: pre-pilot gate + release-bump regression
├── METRICS.md                          # pilot ROI log, anchored to the design's hours/$ estimate
├── SECURITY-BASELINE.md                # credential inventory, approval map, incident runbook
├── README.md                           # what this seed is and how to use it
├── evals/
│   ├── platform.json                   # universal red-team suite (all blockers)
│   └── <use-case>.json                 # golden + approval cases per pilot workflow
├── workflows/
│   └── <use-case>.md                   # pattern-instantiated spec per scheduled/event pilot
│                                       # (patterns: docs/workflow-patterns.md)
├── packages/custom-gatekeeper/src/
│   ├── ghl.ts                          # one scaffold per *custom* system in the record
│   └── …                               # (stock systems need config, not code — none emitted)
└── skills/
    └── <use-case>.md                   # one 7-part skill seed per pilot use case
                                        # (craft rules: docs/skills-guide.md)
```

Approver names from the record are threaded into the gatekeeper scaffolds (payment approver into
QBO/Stripe/Square, send approver elsewhere). Missing profile values surface as explicit
`<PASTE …>` placeholders in `deployment.jsonc`, mirroring the Studio's Build Guide.

## Honest limits

- The seed targets the starter **template**; reconcile `deployment.jsonc` key names against the
  pinned release you actually clone (upstream is early-access and moving).
- Gatekeeper files are **scaffolds** — class shape must be aligned with the gatekeeper interface
  in your pinned release before shipping.
- Generation is pure (`src/generate.ts` returns file descriptors); only `src/cli.ts` touches disk.
  Import `generateFiles(client)` directly if you want the files without the filesystem.
