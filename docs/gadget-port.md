# Gadget port — the Studio inside Cloudflare OS

The end-state from the operating model: the Studio runs as a **gadget** in our own Cloudflare OS deployment — multi-user by construction, agent-readable, shareable to client deployments as a `.gadget` blueprint. This document is the executable port plan.

> **Why this is a plan and not code:** gadget code targets the platform's runtime interfaces (Dynamic Workers, Durable Object facets/SQLite, Cap'n Web RPC, model/gatekeeper bindings) in whatever release we've pinned — and this repo's standing rule is that we don't write against interfaces we can't verify (AGENTS.md, hard rule 1). Everything below is sequenced so the port is executed *against a live deployment with its pinned release's docs and examples in hand* — ideally with the platform's own in-workspace coding agent doing the mechanical parts, since it knows the current interfaces natively.

## Why the codebase is already port-ready

- **The engine is runtime-agnostic:** `@cfos-practice/core` is pure ESM TypeScript with zero I/O — it runs unchanged in a gadget's server or client.
- **Storage is behind a seam:** the Studio touches persistence only via `load()/save()` plus the `SYNC` layer (`syncInit/syncPush`, added in the Studio-service phase). The port swaps exactly that seam for gadget RPC — nothing else in the UI knows where records live.
- **BYOK/AI is behind a seam too:** `aiViaEndpoint()` is one function; in a gadget it becomes a call through the gadget's **AI model binding** (each collaborator's own model account, per platform semantics) and the proxy Worker retires.
- **The record format is the contract:** the Studio-service KV blob, the Export JSON, and the scaffold input are the same shape — migration is data copy, not transformation.

## Target architecture

| Piece | Today (Studio service) | As a gadget |
|---|---|---|
| UI | Single-file HTML served by the service Worker | Same HTML as the gadget client (sandboxed frame) |
| State | KV blob per Access identity | Durable Object SQLite: `clients(id TEXT PRIMARY KEY, doc TEXT, updated_at TEXT)` + `meta(k,v)` |
| Identity | Access JWT | Platform identity — free |
| Multi-user | Last-write-wins per user | Real-time collaboration on shared state — free |
| AI assist | ai-proxy Worker (BYOK) | AI model binding (collaborator's own account) |
| Sharing | n/a | Share the app (live, `use`/`build` roles) or its **Blueprint** |
| Distribution | Deploy per host | Export `.gadget` archive → import into client deployments → curate on their Explore page |

Governance note: engagement records contain client-sensitive discovery data — the platform's observation/verify-on-share semantics apply to anything an agent reads from the gadget, which is a *feature* (a collaborator without access to a source can't see derived content), but plan the sharing model deliberately: one gadget per engagement, or per-client access via collaborator roles.

## The port, step by step

1. **Prerequisite:** our own OS deployment live (HQ Build Guide), pinned release noted.
2. **Read the pinned release's gadget material** — the upstream `docs/` (sharing, blueprints, observers) and a stock gadget's source in `packages/` — from inside the workspace, where the platform agent can be asked to explain current interfaces.
3. **Scaffold the gadget in-workspace:** ask the platform's coding agent for a minimal gadget with a static client + a server exposing `listRecords/getRecord/putRecord` over the current RPC interface, backed by the SQLite schema above. Verify it round-trips before any Studio code moves.
4. **Drop in the engine:** vendor `@cfos-practice/core`'s built ESM into the gadget (it has no dependencies); wire the server methods to store the same record blobs.
5. **Port the UI:** copy `studio/index.html`; replace the `SYNC` seam with the gadget RPC calls and delete localStorage persistence (keep Export/Import — they're the interchange with the scaffold CLI).
6. **Swap AI assist** to the model binding; remove the endpoint/BYOK fields (the platform owns model routing and budgets now).
7. **Evals before use:** run the platform red-team suite against the gadget's workspace (scope-exceed, share-verify) — engagement data is confidential.
8. **Blueprint it:** export the `.gadget` archive; import into a client deployment; confirm independent storage/bindings; curate on the Explore page.
9. **Migrate records:** pull KV blobs from the Studio service (`rec:*`) and import per user — same JSON shape end to end.
10. **Retire** the Studio-service Worker for internal use (keep it if prospects still need the public, pre-purchase discovery flow — the two coexist: public funnel outside, gadget inside).

## Effort, honestly

Steps 3–6 are the build: roughly **2–3 weeks** part-time against a stable pinned release, most of it interface-learning rather than logic (the logic is `core`, already tested). Step 10's nuance matters commercially: the public funnel (Access + OTP + service) and the internal gadget serve different audiences — expect to run both.
