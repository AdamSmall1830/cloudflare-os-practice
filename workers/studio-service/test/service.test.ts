import { afterEach, beforeAll, describe, expect, it } from "vitest";
import worker, { type Env } from "../src/index.js";

/* ---------- test rig: real RS256 keys, minted JWTs, stubbed certs/KV ---------- */

const TEAM = "team.cloudflareaccess.com";
const AUD = "aud-tag-1";

let privateKey: CryptoKey;
let publicJwk: JsonWebKey & { kid: string };

function b64url(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const enc = (o: object) => b64url(new TextEncoder().encode(JSON.stringify(o)));

async function mint(claims: Record<string, unknown>, kid = "kid-1"): Promise<string> {
  const h = enc({ alg: "RS256", kid });
  const p = enc({ aud: [AUD], iss: `https://${TEAM}`, exp: Math.floor(Date.now() / 1000) + 600, email: "user@client.com", ...claims });
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${h}.${p}`)),
  );
  return `${h}.${p}.${b64url(sig)}`;
}

function kvStub(store: Map<string, string>) {
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => void store.set(k, v),
  };
}

let webhookCalls: Array<{ url: string; body: string }> = [];
const realFetch = globalThis.fetch;

function stubNetwork() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input);
    if (u === `https://${TEAM}/cdn-cgi/access/certs`) {
      return new Response(JSON.stringify({ keys: [publicJwk] }), { headers: { "content-type": "application/json" } });
    }
    if (u.startsWith("https://hooks.test/")) {
      webhookCalls.push({ url: u, body: String(init?.body ?? "") });
      return new Response("ok");
    }
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;
}

function makeEnv(store: Map<string, string>, extra?: Partial<Env>): Env {
  return {
    ACCESS_TEAM_DOMAIN: TEAM,
    ACCESS_AUD: AUD,
    RECORDS: kvStub(store) as Env["RECORDS"],
    ASSETS: { fetch: async () => new Response("THE APP") },
    ...extra,
  };
}

async function api(env: Env, path: string, opts: { method?: string; token?: string | null; body?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers["Cf-Access-Jwt-Assertion"] = opts.token;
  const res = await worker.fetch(new Request(`https://studio.test${path}`, { method: opts.method ?? "GET", headers, body: opts.body }), env);
  return { status: res.status, json: await res.json().catch(() => null) as Record<string, unknown> | null };
}

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ["sign", "verify"],
  );
  privateKey = pair.privateKey;
  publicJwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "kid-1" } as typeof publicJwk;
  stubNetwork();
});

afterEach(() => {
  webhookCalls = [];
  stubNetwork();
});

/* ---------- the suite ---------- */

describe("auth", () => {
  it("rejects API calls without a JWT (fail closed, no dev bypass)", async () => {
    const r = await api(makeEnv(new Map()), "/api/me");
    expect(r.status).toBe(401);
  });

  it("accepts a validly signed JWT and returns the identity", async () => {
    const r = await api(makeEnv(new Map()), "/api/me", { token: await mint({}) });
    expect(r.status).toBe(200);
    expect(r.json?.email).toBe("user@client.com");
  });

  it("rejects tampered signatures, wrong aud, wrong issuer, and expired tokens", async () => {
    const env = makeEnv(new Map());
    const good = await mint({});
    const tampered = good.slice(0, -6) + "AAAAAA";
    expect((await api(env, "/api/me", { token: tampered })).status).toBe(401);
    expect((await api(env, "/api/me", { token: await mint({ aud: ["other-aud"] }) })).status).toBe(401);
    expect((await api(env, "/api/me", { token: await mint({ iss: "https://evil.example.com" }) })).status).toBe(401);
    expect((await api(env, "/api/me", { token: await mint({ exp: Math.floor(Date.now() / 1000) - 10 }) })).status).toBe(401);
  });

  it("DEV_ALLOW_EMAIL works only as an explicit local-dev opt-in", async () => {
    const r = await api(makeEnv(new Map(), { DEV_ALLOW_EMAIL: "dev@local" }), "/api/me");
    expect(r.json?.email).toBe("dev@local");
  });
});

describe("records", () => {
  it("returns {clients:null} for a new user, then round-trips a saved blob per identity", async () => {
    const store = new Map<string, string>();
    const env = makeEnv(store);
    const token = await mint({});
    expect((await api(env, "/api/records", { token })).json).toEqual({ clients: null });

    const blob = JSON.stringify({ clients: { hq: { name: "X" } }, active: "hq" });
    const put = await api(env, "/api/records", { method: "PUT", token, body: blob });
    expect(put.json).toEqual({ ok: true });
    expect((await api(env, "/api/records", { token })).json).toEqual(JSON.parse(blob));
    expect(store.has("rec:user@client.com")).toBe(true);
  });

  it("rejects malformed blobs and oversized payloads", async () => {
    const env = makeEnv(new Map());
    const token = await mint({});
    expect((await api(env, "/api/records", { method: "PUT", token, body: "not json" })).status).toBe(400);
    expect((await api(env, "/api/records", { method: "PUT", token, body: JSON.stringify({ nope: 1 }) })).status).toBe(400);
    const huge = JSON.stringify({ clients: { x: "y".repeat(2_100_000) } });
    expect((await api(env, "/api/records", { method: "PUT", token, body: huge })).status).toBe(413);
  });
});

describe("submissions", () => {
  it("archives the submission and forwards to the webhook when configured", async () => {
    const store = new Map<string, string>();
    const env = makeEnv(store, { SUBMIT_WEBHOOK: "https://hooks.test/ghl" });
    const token = await mint({});
    const r = await api(env, "/api/submit", { method: "POST", token, body: JSON.stringify({ client: { name: "Acme" } }) });
    expect(r.json).toEqual({ ok: true, forwarded: true });
    expect([...store.keys()].some((k) => k.startsWith("sub:") && k.endsWith("user@client.com"))).toBe(true);
    expect(webhookCalls).toHaveLength(1);
    const fwd = JSON.parse(webhookCalls[0]!.body) as { email: string; client: { name: string } };
    expect(fwd.email).toBe("user@client.com");
    expect(fwd.client.name).toBe("Acme");
  });

  it("rejects submissions without a client record", async () => {
    const r = await api(makeEnv(new Map()), "/api/submit", { method: "POST", token: await mint({}), body: "{}" });
    expect(r.status).toBe(400);
  });
});

describe("static app", () => {
  it("non-API paths pass through to assets without auth", async () => {
    const res = await worker.fetch(new Request("https://studio.test/"), makeEnv(new Map()));
    expect(await res.text()).toBe("THE APP");
  });
});
