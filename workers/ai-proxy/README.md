# ai-proxy

Cloudflare Worker backing the Studio's **AI assist → Option 2 (direct endpoint)** mode.
Multi-provider and **BYOK**: `POST {prompt, provider?, model?, apiKey?, baseUrl?}` → `{text}`.

| provider | upstream | key |
|---|---|---|
| **`cf-gateway`** (recommended) | Cloudflare **AI Gateway** compat endpoint — invoke a **Dynamic Route** (`model: dynamic/<route>`) with `cf-aig-metadata` for task-class routing | request `apiKey` → `GATEWAY_KEY` secret; gateway auth via `gatewayToken` → `GATEWAY_TOKEN` secret |
| `anthropic` (default) | Anthropic Messages API | request `apiKey` → `x-user-key` header → `ANTHROPIC_API_KEY` secret |
| `openai` | OpenAI chat completions | request `apiKey` → header → `OPENAI_API_KEY` secret |
| `openai-compatible` | any `/chat/completions` endpoint via `baseUrl` (Groq, Mistral, Together, a local gateway…) | request `apiKey` → header (BYOK only — no server fallback) |
| `workers-ai` | this account's Workers AI binding | none (enable the `ai` binding in wrangler.jsonc; billed to the proxy's account) |

User-supplied keys pass through **per request** and are never stored or logged.

## The recommended production brain: `cf-gateway` → a Dynamic Route

Point the Studio's AI-assist at your firm's **AI Gateway Dynamic Route** — the same budgeted, governed model matrix you deploy for clients. The request goes to
`https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/compat/chat/completions`
with `model: "dynamic/<route>"` and a `cf-aig-metadata` header (`{"app":"cfos-studio","task":"discovery-synthesis","pass":1|2}`) so the route's Conditional/Budget/Rate-Limit nodes can branch and cap the Studio's own spend. Set `GATEWAY_KEY` (a Cloudflare API token or provider key, account-scoped) and, for an authenticated gateway, `GATEWAY_TOKEN` — then **no key lives in the browser at all**.

```bash
wrangler secret put GATEWAY_KEY      # Cloudflare API token (account-scoped) or provider key
wrangler secret put GATEWAY_TOKEN    # optional: the gateway's cf-aig-authorization token
```

## Deploy

```bash
pnpm --filter @cfos-practice/ai-proxy deploy
# optional server-default keys (BYOK requests don't need them):
cd workers/ai-proxy && wrangler secret put ANTHROPIC_API_KEY && wrangler secret put OPENAI_API_KEY
```

Then set `ALLOWED_ORIGIN` in `wrangler.jsonc` to the hostname that serves the Studio,
and paste the Worker's URL into the Studio's endpoint field. In the Studio, users pick
their brain and (optionally) paste their own key — stored only in their browser, never
in exports.

## Security posture

- The repo and server hold no user keys: BYOK keys live in the user's browser and
  transit per-request over HTTPS to this Worker only.
- CORS is locked to the Studio origin — but CORS is not authentication: put
  **Cloudflare Access** in front of this Worker's route so only signed-in users can call it.
- The hosted claude.ai artifact copy of the Studio cannot call this (its sandbox blocks
  external requests) — this endpoint is for the self-hosted Studio.
