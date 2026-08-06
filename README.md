# Cloudflare OS Practice

The delivery toolkit for our Cloudflare OS implementation business: taking client companies from discovery through design to a deployed, governed AI agent workspace ([Cloudflare OS](https://github.com/cloudflare/cloudflare-os)) in their own Cloudflare account.

## What's here

| Path | What it is |
|---|---|
| [`studio/index.html`](studio/index.html) | **Cloudflare OS Studio** — the vendor cockpit web app. Phase 1 Discovery (client profile, systems inventory, interviews, magic-inbox log, scored use-case register, AI-assisted synthesis) → Phase 2 auto-generated Design & Scope (pilot charter, integration map, policy matrix, copyable scope doc) → Phase 3 personalized step-by-step Build Guide with copy-paste commands and config. Single file, no build step, state in `localStorage` (per-client, with JSON export/import). Preloaded with the **"Our Firm — Cloudflare OS HQ"** record so the Build Guide walks through standing up our own OS first. |
| [`playbook/index.html`](playbook/index.html) | **The Client Delivery Playbook** — the practice field manual. Platform analysis, reference architecture, practice build-out, the 8-phase delivery roadmap with discovery instruments, client setup checklist, vertical playbooks (manufacturing, law, financial services, sales/marketing, PT clinics), Cloudflare Wallets track, training & acceptance, pricing, IT/security FAQ, risks, and Section 12: the delivery-factory pipeline (GoHighLevel → discovery → design → e-sign → build). |

Published (private) artifact copies:
- Studio: https://claude.ai/code/artifact/3f91850f-1686-4911-9218-41c2809d5917
- Playbook: https://claude.ai/code/artifact/c62fb867-9d1a-4da1-ba84-3c12644b132f

## Running the Studio locally

It's a single self-contained file — either open `studio/index.html` directly in a browser, or serve the repo (nicer, and required for the AI endpoint option):

```bash
python3 -m http.server 8080
```

then visit `http://localhost:8080/studio/`.

Notes:
- Data is stored in the browser's `localStorage` per origin — use the in-app **Export/Import** for backup or moving machines.
- The **AI assist** section has two modes: copy-prompt/paste-JSON (works anywhere, including the claude.ai artifact) and a direct HTTPS endpoint (self-hosted only; the in-app Deploy notes include a Cloudflare Worker AI-proxy snippet — the provider key lives in a Worker secret, never in the browser).
- The playbook's mermaid diagrams render in the claude.ai artifact viewer; a plain static server shows them as text unless you add a mermaid renderer.

## Where this repo is headed

Per playbook Section 03, this grows into the practice monorepo:

- `packages/gatekeepers/` — reusable custom Gatekeepers (GoHighLevel, QuickBooks Online, Stripe, HubSpot, Microsoft Graph, vertical systems), instantiated per client with client-specific policy
- `skills/` — per-vertical skills starter kits and the Codex template
- `scripts/` — the JSON→scaffold codegen: read a Studio client export, emit a filled starter-repo config
- Eventually: the Studio ported to a Cloudflare OS **gadget** running in our own deployment (playbook Section 12)

## Status

Early practice tooling, built 2026-08-05 against Cloudflare OS v2 (early access). The Build Guide's platform facts (env vars, portal steps, starter behavior) should be re-verified against each pinned Cloudflare OS release we adopt.
