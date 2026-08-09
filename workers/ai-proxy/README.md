# ai-proxy

Cloudflare Worker backing the Studio's **AI assist → Option 2 (direct endpoint)** mode.
Multi-provider and **BYOK**: `POST {prompt, provider?, model?, apiKey?, baseUrl?}` → `{text}`.

| provider | upstream | key |
|---|---|---|
| `anthropic` (default) | Anthropic Messages API | request `apiKey` → `x-user-key` header → `ANTHROPIC_API_KEY` secret |
| `openai` | OpenAI chat completions | request `apiKey` → header → `OPENAI_API_KEY` secret |
| `openai-compatible` | any `/chat/completions` endpoint via `baseUrl` (Groq, Mistral, Together, a local gateway…) | request `apiKey` → header |
| `workers-ai` | this account's Workers AI binding | none (enable the `ai` binding in wrangler.jsonc; billed to the proxy's account) |

User-supplied keys pass through **per request** and are never stored or logged.

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
