/**
 * AI proxy for Cloudflare OS Studio — multi-provider, BYOK.
 *
 * POST { prompt, provider?, model?, apiKey?, baseUrl? }  →  { text }
 *
 * Providers: "anthropic" (default) · "openai" · "openai-compatible" (any
 * /chat/completions endpoint via baseUrl: Groq, Mistral, Together, a local
 * gateway, …) · "workers-ai" (this account's AI binding — no user key).
 *
 * Key resolution, in order: request apiKey → x-user-key header → the
 * provider's Worker secret. User keys pass through per-request and are
 * NEVER stored or logged. Lock ALLOWED_ORIGIN to the Studio's hostname and
 * put Cloudflare Access in front (CORS is not authentication).
 */
export interface Env {
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  ALLOWED_ORIGIN: string;
  MODEL?: string;
  AI?: { run(model: string, input: unknown): Promise<{ response?: string }> };
}

interface ProxyRequest {
  prompt?: unknown;
  provider?: unknown;
  model?: unknown;
  apiKey?: unknown;
  baseUrl?: unknown;
}

const DEFAULT_MODEL: Record<string, string> = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-5",
  "openai-compatible": "",
  "workers-ai": "@cf/meta/llama-3.3-70b-instruct",
};

function cors(env: Env): Record<string, string> {
  return {
    "access-control-allow-origin": env.ALLOWED_ORIGIN || "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-user-key",
  };
}

function bad(headers: Record<string, string>, status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), { status, headers });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const headers = { "content-type": "application/json", ...cors(env) };

    if (req.method === "OPTIONS") return new Response(null, { headers: cors(env) });
    if (req.method !== "POST") return bad(headers, 405, "POST only");

    let body: ProxyRequest;
    try {
      body = (await req.json()) as ProxyRequest;
    } catch {
      return bad(headers, 400, "Body must be JSON: {prompt, provider?, model?, apiKey?, baseUrl?}");
    }

    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) return bad(headers, 400, "Missing prompt");

    const provider = typeof body.provider === "string" && body.provider ? body.provider : "anthropic";
    const model =
      (typeof body.model === "string" && body.model.trim()) || env.MODEL || DEFAULT_MODEL[provider] || "";
    const userKey =
      (typeof body.apiKey === "string" && body.apiKey.trim()) || req.headers.get("x-user-key")?.trim() || "";

    try {
      if (provider === "workers-ai") {
        if (!env.AI) return bad(headers, 400, "workers-ai is not enabled on this proxy (no AI binding)");
        const out = await env.AI.run(model, { messages: [{ role: "user", content: prompt }] });
        return new Response(JSON.stringify({ text: out.response ?? "" }), { headers });
      }

      if (provider === "anthropic") {
        const key = userKey || env.ANTHROPIC_API_KEY || "";
        if (!key) return bad(headers, 401, "No Anthropic key: supply apiKey (BYOK) or configure the Worker secret");
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model, max_tokens: 3000, messages: [{ role: "user", content: prompt }] }),
        });
        if (!r.ok) return bad(headers, 502, `Anthropic upstream ${r.status}`);
        const j = (await r.json()) as { content?: Array<{ text?: string }> };
        return new Response(JSON.stringify({ text: j.content?.[0]?.text ?? "" }), { headers });
      }

      if (provider === "openai" || provider === "openai-compatible") {
        const key = userKey || env.OPENAI_API_KEY || "";
        if (!key) return bad(headers, 401, "No key: supply apiKey (BYOK) or configure the Worker secret");
        let base = "https://api.openai.com/v1";
        if (provider === "openai-compatible") {
          if (typeof body.baseUrl !== "string" || !/^https:\/\//.test(body.baseUrl)) {
            return bad(headers, 400, "openai-compatible requires an https baseUrl (e.g. https://api.groq.com/openai/v1)");
          }
          base = body.baseUrl.replace(/\/+$/, "");
        }
        if (!model) return bad(headers, 400, "openai-compatible requires a model name");
        const payload: Record<string, unknown> = { model, messages: [{ role: "user", content: prompt }] };
        if (provider === "openai-compatible") payload.max_tokens = 3000;
        const r = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
          body: JSON.stringify(payload),
        });
        if (!r.ok) return bad(headers, 502, `Upstream ${r.status}`);
        const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
        return new Response(JSON.stringify({ text: j.choices?.[0]?.message?.content ?? "" }), { headers });
      }

      return bad(headers, 400, `Unknown provider "${provider}"`);
    } catch {
      return bad(headers, 502, "Upstream request failed");
    }
  },
};
