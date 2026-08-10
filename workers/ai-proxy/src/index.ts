/**
 * AI proxy for Cloudflare OS Studio — multi-provider, BYOK.
 *
 * POST { prompt, provider?, model?, apiKey?, baseUrl?, accountId?, gatewayId?, route?, metadata?, gatewayToken? }  →  { text }
 *
 * Providers: "anthropic" (default) · "openai" · "openai-compatible" (any
 * /chat/completions endpoint via baseUrl: Groq, Mistral, Together, a local
 * gateway, …) · "workers-ai" (this account's AI binding — no user key) ·
 * "cf-gateway" (Cloudflare AI Gateway compat endpoint — invoke a **Dynamic
 * Route** via model "dynamic/<route>", with cf-aig-metadata for task-class
 * routing; this is the recommended production brain — budgeted + governed).
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
  /** Optional server-held credentials for the cf-gateway provider, so the
   *  Studio can run its own AI-assist through the firm's Dynamic Route with
   *  NO key in the browser. GATEWAY_KEY = a Cloudflare API token (or provider
   *  key) for Authorization; GATEWAY_TOKEN = the gateway's cf-aig-authorization
   *  token when the gateway is authenticated. Account-scope the key. */
  GATEWAY_KEY?: string;
  GATEWAY_TOKEN?: string;
  /** When set, callers must send a matching `x-proxy-secret` header. A
   *  defense-in-depth gate for non-Access deployments; Access remains the
   *  primary control. */
  PROXY_SHARED_SECRET?: string;
  /** Optional comma-separated origin allowlist for openai-compatible baseUrl
   *  (e.g. "https://api.groq.com,https://api.mistral.ai"). Unset = any https
   *  origin — acceptable only because Access fronts this route. */
  COMPAT_ORIGIN_ALLOWLIST?: string;
  AI?: { run(model: string, input: unknown): Promise<{ response?: string }> };
}

interface ProxyRequest {
  prompt?: unknown;
  provider?: unknown;
  model?: unknown;
  apiKey?: unknown;
  baseUrl?: unknown;
  accountId?: unknown;
  gatewayId?: unknown;
  route?: unknown;
  metadata?: unknown;
  gatewayToken?: unknown;
}

const DEFAULT_MODEL: Record<string, string> = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-5",
  "openai-compatible": "",
  "workers-ai": "@cf/meta/llama-3.3-70b-instruct",
  "cf-gateway": "",
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

    // Optional shared-secret gate (fail-closed when configured).
    if (env.PROXY_SHARED_SECRET && req.headers.get("x-proxy-secret") !== env.PROXY_SHARED_SECRET) {
      return bad(headers, 401, "Unauthorized");
    }

    let body: ProxyRequest;
    try {
      body = (await req.json()) as ProxyRequest;
    } catch {
      return bad(headers, 400, "Body must be JSON: {prompt, provider?, model?, apiKey?, baseUrl?}");
    }

    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) return bad(headers, 400, "Missing prompt");

    const provider = typeof body.provider === "string" && body.provider ? body.provider : "anthropic";
    // Per-provider default wins over env.MODEL, so a server MODEL pin can't force
    // (e.g.) a Claude model onto an OpenAI request. env.MODEL is the last resort.
    const model =
      (typeof body.model === "string" && body.model.trim()) || DEFAULT_MODEL[provider] || env.MODEL || "";
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
        if (!key) return bad(headers, 401, "No API key available for this provider");
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
        let base = "https://api.openai.com/v1";
        let key: string;
        if (provider === "openai-compatible") {
          // The destination is caller-controlled, so a server secret must NEVER
          // be attached here — otherwise an arbitrary baseUrl exfiltrates it.
          if (typeof body.baseUrl !== "string" || !/^https:\/\//.test(body.baseUrl)) {
            return bad(headers, 400, "openai-compatible requires an https baseUrl (e.g. https://api.groq.com/openai/v1)");
          }
          if (env.COMPAT_ORIGIN_ALLOWLIST) {
            const allowed = env.COMPAT_ORIGIN_ALLOWLIST.split(",").map((s) => s.trim());
            if (!allowed.includes(new URL(body.baseUrl).origin)) {
              return bad(headers, 403, "baseUrl origin is not on this proxy's allowlist");
            }
          }
          base = body.baseUrl.replace(/\/+$/, "");
          key = userKey; // BYOK only — no fallback to env.OPENAI_API_KEY for custom endpoints
          if (!key) return bad(headers, 401, "No API key available for this provider");
        } else {
          key = userKey || env.OPENAI_API_KEY || "";
          if (!key) return bad(headers, 401, "No API key available for this provider");
        }
        if (!model) return bad(headers, 400, "A model name is required for this provider");
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

      if (provider === "cf-gateway") {
        // Cloudflare AI Gateway compat endpoint. The host is always Cloudflare's,
        // and the account/gateway in the path scope the request — a server
        // GATEWAY_KEY can't be misdirected off-host, so a server fallback is safe.
        const account = typeof body.accountId === "string" && body.accountId.trim();
        const gw = typeof body.gatewayId === "string" && body.gatewayId.trim();
        if (!account || !gw) return bad(headers, 400, "cf-gateway requires accountId and gatewayId");
        if (!/^[a-zA-Z0-9_-]+$/.test(account) || !/^[a-zA-Z0-9_-]+$/.test(gw)) {
          return bad(headers, 400, "accountId/gatewayId must be alphanumeric/dash/underscore");
        }
        // A route selects a Dynamic Route ("dynamic/<route>"); otherwise a
        // provider/model string ("openai/gpt-5") passes through.
        const target =
          typeof body.route === "string" && body.route.trim()
            ? `dynamic/${body.route.trim()}`
            : model;
        if (!target) return bad(headers, 400, "cf-gateway requires a route or model");
        const key = userKey || env.GATEWAY_KEY || "";
        if (!key) return bad(headers, 401, "No API key available for this provider");
        const gwHeaders: Record<string, string> = {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        };
        const gwToken = (typeof body.gatewayToken === "string" && body.gatewayToken) || env.GATEWAY_TOKEN;
        if (gwToken) gwHeaders["cf-aig-authorization"] = `Bearer ${gwToken}`;
        if (body.metadata && typeof body.metadata === "object") {
          gwHeaders["cf-aig-metadata"] = JSON.stringify(body.metadata);
        }
        const r = await fetch(
          `https://gateway.ai.cloudflare.com/v1/${account}/${gw}/compat/chat/completions`,
          {
            method: "POST",
            headers: gwHeaders,
            body: JSON.stringify({ model: target, max_tokens: 3000, messages: [{ role: "user", content: prompt }] }),
          },
        );
        if (!r.ok) return bad(headers, 502, `Gateway upstream ${r.status}`);
        const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
        return new Response(JSON.stringify({ text: j.choices?.[0]?.message?.content ?? "" }), { headers });
      }

      return bad(headers, 400, `Unknown provider "${provider}"`);
    } catch {
      return bad(headers, 502, "Upstream request failed");
    }
  },
};
