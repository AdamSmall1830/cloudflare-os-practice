import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index.js";

const baseEnv: Env = { ALLOWED_ORIGIN: "https://studio.test" };

function post(body: unknown, env: Partial<Env> = {}, headers: Record<string, string> = {}) {
  return worker.fetch(
    new Request("https://proxy.test/", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }),
    { ...baseEnv, ...env },
  );
}
const j = async (r: Response) => ({ status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> });

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("request gating", () => {
  it("answers OPTIONS with the locked origin and 405s non-POST", async () => {
    const opt = await worker.fetch(new Request("https://proxy.test/", { method: "OPTIONS" }), baseEnv);
    expect(opt.status).toBe(200);
    expect(opt.headers.get("access-control-allow-origin")).toBe("https://studio.test");
    expect((await worker.fetch(new Request("https://proxy.test/", { method: "GET" }), baseEnv)).status).toBe(405);
  });

  it("enforces the optional shared secret (fail-closed) when configured", async () => {
    // Wrong/missing secret → gated with the opaque "Unauthorized".
    expect((await j(await post({ prompt: "x" }, { PROXY_SHARED_SECRET: "s3cret" }))).body.error).toBe("Unauthorized");
    // Correct secret passes the gate (then fails later for a different reason — no key).
    const passed = await j(await post({ prompt: "x", provider: "workers-ai" }, { PROXY_SHARED_SECRET: "s3cret", AI: { run: async () => ({ response: "ok" }) } }, { "x-proxy-secret": "s3cret" }));
    expect(passed.status).toBe(200);
  });

  it("rejects a missing prompt and unknown providers", async () => {
    expect((await j(await post({}))).status).toBe(400);
    expect((await j(await post({ prompt: "x", provider: "gemini-magic" }))).status).toBe(400);
  });
});

describe("openai-compatible key-exfiltration guard (critical)", () => {
  it("NEVER attaches the server OPENAI_API_KEY to a caller-controlled baseUrl", async () => {
    const seen: Array<{ url: string; auth: string | null }> = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(url), auth: new Headers(init?.headers).get("authorization") });
      return new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    // No caller apiKey + a server secret present → must be refused, and no fetch made.
    const r = await j(await post({ prompt: "x", provider: "openai-compatible", model: "m", baseUrl: "https://attacker.example" }, { OPENAI_API_KEY: "sk-server-secret" }));
    expect(r.status).toBe(401);
    expect(seen).toHaveLength(0);

    // With a caller key it proceeds — and only the caller's key is sent.
    await post({ prompt: "x", provider: "openai-compatible", model: "m", apiKey: "sk-user", baseUrl: "https://api.groq.com/openai/v1" }, { OPENAI_API_KEY: "sk-server-secret" });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(seen[0]!.auth).toBe("Bearer sk-user");
  });

  it("enforces https and the optional origin allowlist on baseUrl", async () => {
    expect((await j(await post({ prompt: "x", provider: "openai-compatible", model: "m", apiKey: "k", baseUrl: "http://insecure" }))).status).toBe(400);
    const blocked = await j(await post({ prompt: "x", provider: "openai-compatible", model: "m", apiKey: "k", baseUrl: "https://evil.example" }, { COMPAT_ORIGIN_ALLOWLIST: "https://api.groq.com" }));
    expect(blocked.status).toBe(403);
  });
});

describe("provider defaults and keys", () => {
  it("does not let env.MODEL override a provider's own default (BYOK OpenAI still gets an OpenAI model)", async () => {
    const seen: string[] = [];
    globalThis.fetch = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      seen.push((JSON.parse(String(init?.body)) as { model: string }).model);
      return new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    await post({ prompt: "x", provider: "openai", apiKey: "sk-user" }, { MODEL: "claude-sonnet-5" });
    expect(seen[0]).toBe("gpt-5");
  });

  it("gives an opaque 401 that does not reveal whether a server key exists", async () => {
    const withKey = await j(await post({ prompt: "x" }, {})); // anthropic, no key anywhere
    const noKey = await j(await post({ prompt: "x" }, { ANTHROPIC_API_KEY: undefined }));
    expect(withKey.body.error).toBe("No API key available for this provider");
    expect(noKey.body.error).toBe("No API key available for this provider");
  });

  it("runs workers-ai only when the binding is present", async () => {
    expect((await j(await post({ prompt: "x", provider: "workers-ai" }))).status).toBe(400);
    const r = await j(await post({ prompt: "hello", provider: "workers-ai" }, { AI: { run: async (m: string) => ({ response: "ok:" + m }) } }));
    expect(r.status).toBe(200);
    expect(r.body.text).toContain("ok:@cf/meta");
  });
});

describe("cf-gateway provider (Dynamic Routes)", () => {
  it("hits the compat endpoint, invokes dynamic/<route>, and sends metadata + gateway auth", async () => {
    let seen: { url: string; auth: string | null; gwAuth: string | null; meta: string | null; model: string } | null = null;
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const h = new Headers(init?.headers);
      seen = {
        url: String(url),
        auth: h.get("authorization"),
        gwAuth: h.get("cf-aig-authorization"),
        meta: h.get("cf-aig-metadata"),
        model: (JSON.parse(String(init?.body)) as { model: string }).model,
      };
      return new Response(JSON.stringify({ choices: [{ message: { content: "routed" } }] }), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const r = await j(
      await post({
        prompt: "x", provider: "cf-gateway", accountId: "acct123", gatewayId: "firm-gw",
        route: "studio", apiKey: "cf-token", gatewayToken: "aig-token", metadata: { app: "cfos-studio", pass: 1 },
      }),
    );
    expect(r.status).toBe(200);
    expect(r.body.text).toBe("routed");
    expect(seen!.url).toBe("https://gateway.ai.cloudflare.com/v1/acct123/firm-gw/compat/chat/completions");
    expect(seen!.model).toBe("dynamic/studio");
    expect(seen!.auth).toBe("Bearer cf-token");
    expect(seen!.gwAuth).toBe("Bearer aig-token");
    expect(JSON.parse(seen!.meta!)).toEqual({ app: "cfos-studio", pass: 1 });
  });

  it("falls back to server GATEWAY_KEY so the browser holds no key", async () => {
    let auth: string | null = null;
    globalThis.fetch = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      auth = new Headers(init?.headers).get("authorization");
      return new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    await post({ prompt: "x", provider: "cf-gateway", accountId: "a", gatewayId: "g", route: "studio" }, { GATEWAY_KEY: "server-cf-token" });
    expect(auth).toBe("Bearer server-cf-token");
  });

  it("validates account/gateway ids and requires a route or model", async () => {
    expect((await j(await post({ prompt: "x", provider: "cf-gateway" }, { GATEWAY_KEY: "k" }))).status).toBe(400);
    expect((await j(await post({ prompt: "x", provider: "cf-gateway", accountId: "../etc", gatewayId: "g", route: "r" }, { GATEWAY_KEY: "k" }))).status).toBe(400);
    // valid ids + route but no key anywhere → 401
    expect((await j(await post({ prompt: "x", provider: "cf-gateway", accountId: "a", gatewayId: "g", route: "studio" }, {}))).status).toBe(401);
  });
});
