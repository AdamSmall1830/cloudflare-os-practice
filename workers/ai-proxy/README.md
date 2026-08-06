# ai-proxy

Cloudflare Worker backing the Studio's **AI assist → Option 2 (direct endpoint)** mode.
`POST {prompt}` → `{text}` against the Anthropic Messages API, with the key held in a
Worker secret.

## Deploy

```bash
pnpm --filter @cfos-practice/ai-proxy deploy
pnpm --filter @cfos-practice/ai-proxy secret   # paste the Anthropic API key
```

Then set `ALLOWED_ORIGIN` in `wrangler.jsonc` to the hostname that serves the Studio,
and paste the Worker's URL into the Studio's endpoint field.

## Security posture

- The browser never holds a provider key.
- CORS is locked to the Studio origin — but CORS is not authentication: put
  **Cloudflare Access** in front of this Worker's route so only your team can call it.
- The hosted claude.ai artifact copy of the Studio cannot call this (its sandbox blocks
  external requests) — this endpoint is for the self-hosted Studio.
