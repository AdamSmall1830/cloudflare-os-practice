/**
 * AI proxy for Cloudflare OS Studio's "Generate via endpoint" mode.
 *
 * POST { prompt: string }  →  { text: string }
 *
 * The Anthropic key lives in the ANTHROPIC_API_KEY secret — never in the
 * browser. Lock ALLOWED_ORIGIN to the Studio's hostname and put Cloudflare
 * Access in front of this Worker's route (CORS is not authentication).
 */
export interface Env {
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGIN: string;
  MODEL: string;
}

function cors(env: Env): Record<string, string> {
  return {
    "access-control-allow-origin": env.ALLOWED_ORIGIN || "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const headers = { "content-type": "application/json", ...cors(env) };

    if (req.method === "OPTIONS") return new Response(null, { headers: cors(env) });
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers });
    }

    let prompt: unknown;
    try {
      ({ prompt } = (await req.json()) as { prompt?: unknown });
    } catch {
      return new Response(JSON.stringify({ error: "Body must be JSON: {prompt}" }), { status: 400, headers });
    }
    if (typeof prompt !== "string" || !prompt.trim()) {
      return new Response(JSON.stringify({ error: "Missing prompt" }), { status: 400, headers });
    }

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: env.MODEL || "claude-sonnet-5",
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      return new Response(JSON.stringify({ error: `Upstream ${upstream.status}`, detail: detail.slice(0, 500) }), {
        status: 502,
        headers,
      });
    }

    const j = (await upstream.json()) as { content?: Array<{ text?: string }> };
    const text = j.content?.[0]?.text ?? "";
    return new Response(JSON.stringify({ text }), { headers });
  },
};
