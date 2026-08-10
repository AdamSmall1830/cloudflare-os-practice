# Getting started

Three ways in, depending on who you are.

## 1. I'm the operator — I want to run engagements

You only need the Studio. No install, no build.

1. Open the Studio: either the hosted artifact copy, or serve it locally:
   ```bash
   python3 -m http.server 8080
   # → http://localhost:8080/studio/
   ```
2. The app opens on the preloaded **"Our Firm — Cloudflare OS HQ"** record — your own firm. Rename it, enter your real domain, and work through the three tabs (full walkthrough: [studio-guide.md](studio-guide.md)).
3. For each new client engagement, hit **+ New client** and start at Discovery.
4. **Back up your work:** data lives only in the browser you're using. Use **Export** (top right) after every working session — it downloads a `cfos-<client>.json` file. **Import** restores it on any machine.

The delivery method itself — phases, instruments, pricing, vertical playbooks — is the [playbook](../playbook/index.html) (open it in a browser; it's the field manual the Studio operationalizes).

## 2. I'm a developer — I want to build with the engine

Requirements: Node ≥ 20, pnpm ≥ 9.

```bash
git clone https://github.com/AdamSmall1830/cloudflare-os-practice.git   # or your fork
cd cloudflare-os-practice
pnpm install
pnpm check        # builds all packages, runs all tests
```

(Forking to run your own practice? The make-it-yours checklist is [forking.md](forking.md).)

The canonical logic lives in [`packages/core`](../packages/core) — typed, pure, tested. Start there:

```ts
import { hqClient, designModel, scopeMarkdown, buildSteps } from "@cfos-practice/core";

const client = hqClient();               // or JSON.parse a Studio export
const design = designModel(client);      // pilot charter, integration map, timeline
console.log(scopeMarkdown(design));      // proposal-ready markdown
console.log(buildSteps(client).length);  // ordered setup steps with acceptance checks
```

To turn a Studio export into a full deployment kit — filled `deployment.jsonc`, the numbered `SETUP.md`, gatekeeper scaffolds (custom builds only; MCP-routed systems get portal steps instead), skill seeds, eval suites + run protocol, workflow specs for cadenced pilots, the pilot metrics log, and the security baseline:

```bash
pnpm scaffold examples/hq-export.json    # try it immediately with the bundled example
pnpm scaffold path/to/cfos-client.json   # or a real Studio export
# → out/<client-slug>/
```

(The `scaffold` script builds its dependencies first, so it works on a fresh clone.)

Details: [packages/core/README.md](../packages/core/README.md) · [packages/scaffold/README.md](../packages/scaffold/README.md)

> **Where do I make changes?** `packages/core` first — it's the tested, canonical implementation. The Studio (`studio/index.html`) embeds its own inline copy of the same logic to stay a zero-build single file; mirror behavior changes into it afterwards. This duplication is deliberate and documented in the root README; it ends when the Studio is ported to a Cloudflare OS gadget consuming `core` directly.

## 3. I'm deploying — I want a hosted Studio with sign-in and the AI endpoint

**The hosting + sign-in recipe** (all Cloudflare, no app code):

1. **Host:** Cloudflare Pages from this repo (no build command, output `/`) → Studio at `https://<project>.pages.dev/studio/`, or a custom hostname.
2. **Sign-in:** put a **Cloudflare Access** self-hosted app in front of that hostname. For external users the simplest login is Access's **One-Time PIN via email** (no IdP or account needed — they enter their email, get a code); add Google/GitHub login methods alongside if you like. Allow rules by email or domain; free tier covers 50 users; every sign-in is logged.
3. **Protect the proxy the same way** (Access on the Worker's route) so only signed-in users can spend AI calls.

A note on "Cloudflare OAuth": Cloudflare isn't a general public identity provider you can add to your own app the way you add Google — *inside deployed Cloudflare OS instances*, Cloudflare login exists as an auth gatekeeper, but for the Studio the equivalent simplicity is Access with OTP/social login. The benefit you'd want from a Cloudflare login (knowing the user's account/zone) arrives at deploy time anyway, via `wrangler login` and scoped tokens.

**The Studio service (multi-user records + submissions).** For cross-device sync and a "Submit to vendor" flow, deploy [`workers/studio-service`](../workers/studio-service) instead of bare Pages — it serves the same app *and* a per-identity API:

```bash
cd workers/studio-service
wrangler kv namespace create RECORDS        # paste the id into wrangler.jsonc
# set ACCESS_TEAM_DOMAIN + ACCESS_AUD in wrangler.jsonc (from the Access app on this route)
wrangler secret put SUBMIT_WEBHOOK          # optional: a GHL inbound webhook for submissions
pnpm --filter @cfos-practice/studio-service deploy
```

The Worker **cryptographically verifies the Access JWT** (RS256 against your team's certs, aud/iss/exp checked) on every API call — it fails closed even if a route is misconfigured. When the app detects the service (`/api/me`), it shows the signed-in identity in the header, syncs records to KV (debounced; server wins on a fresh device; **BYOK keys never leave the browser**), and a **Submit to vendor** button appears on the Design tab — submissions are archived and forwarded to your webhook. On any other host, the app quietly stays in classic local-storage mode.

**The long-run home** is the Cloudflare OS **gadget port** — see [gadget-port.md](gadget-port.md) for the executable plan (why the engine is already port-ready, the target architecture, and the ten steps to run against your live deployment).

**The AI endpoint (BYOK, any brain).** The hosted claude.ai artifact copy of the Studio **cannot** call external APIs (its sandbox blocks all outbound requests) — its AI assist works in copy-prompt/paste-JSON mode. To unlock the direct AI endpoint mode:

1. **Host the Studio on your own domain** — it's one file. Cloudflare Pages (deploy this repo, root directory) or any static host works; put Cloudflare Access in front so only your team can open it.
2. **Deploy the AI proxy Worker** (the provider key stays in a Worker secret, never the browser):
   ```bash
   pnpm --filter @cfos-practice/ai-proxy deploy
   pnpm --filter @cfos-practice/ai-proxy secret   # paste the Anthropic API key
   ```
3. Set `ALLOWED_ORIGIN` in [`workers/ai-proxy/wrangler.jsonc`](../workers/ai-proxy/wrangler.jsonc) to your Studio hostname, and put Access in front of the Worker route too (CORS is not authentication).
4. In the Studio: **Discovery → AI assist → Option 2**, paste the Worker URL and pick the **brain**. The **recommended production choice is "Cloudflare AI Gateway — Dynamic Route"**: the Studio's own AI-assist then runs through your firm's budgeted, versioned model matrix (the same mechanism you deploy for clients), tagged with `cf-aig-metadata` so the route can branch and cap it. Set the proxy's `GATEWAY_KEY`/`GATEWAY_TOKEN` secrets and fill the account/gateway/route fields — **no key in the browser**. The other brains (Anthropic, OpenAI, any OpenAI-compatible endpoint, Workers AI) remain available with optional BYOK; a bring-your-own key is stored only in that browser and sent per-request, never server-side.

This closes the loop: **your own practice dogfoods dynamic routing** — the cost-governance control you sell is the one running your Studio.

Full security notes: [workers/ai-proxy/README.md](../workers/ai-proxy/README.md)

## Setting up Cloudflare OS itself

That's what the Studio's **Build Guide** tab generates — a personalized, ordered checklist (accounts, DNS, Access/SSO, the `cloudflare-os-starter` deploy, AI Gateway, gatekeepers, knowledge, pilot gate) built from the engagement record. The HQ record's guide is the recipe for standing up **our own** deployment; each client record generates theirs. The same guide is exportable as `SETUP.md` via the scaffold CLI.
