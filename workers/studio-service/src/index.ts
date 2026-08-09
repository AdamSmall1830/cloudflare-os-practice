/**
 * Studio service — the hosted, multi-user Studio.
 *
 * Serves the single-file app (static assets) and a small per-user API:
 *   GET  /api/me       → { email }                    (who am I)
 *   GET  /api/records  → the user's saved record blob (or { clients: null })
 *   PUT  /api/records  → save the blob (≤ 2 MB)
 *   POST /api/submit   → archive a submission + optionally forward to
 *                        SUBMIT_WEBHOOK (e.g. a GoHighLevel inbound webhook)
 *
 * AuthN: Cloudflare Access MUST front this Worker's route. Every API request
 * carries a `Cf-Access-Jwt-Assertion` JWT, which we verify cryptographically
 * (RS256 against the team's public certs) and check aud/iss/exp — so even a
 * misconfigured route fails closed. Identity = the JWT's email claim.
 * DEV_ALLOW_EMAIL exists for local `wrangler dev` only.
 */

export interface Env {
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  RECORDS: {
    get(key: string, type: "text"): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
  };
  ASSETS?: { fetch(req: Request): Promise<Response> };
  SUBMIT_WEBHOOK?: string;
  DEV_ALLOW_EMAIL?: string;
}

const MAX_BLOB_BYTES = 2_000_000;
const JSON_HEADERS = { "content-type": "application/json" };

/* ---------------- Access JWT verification (RS256, team certs) ---------------- */

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

let certCache: { fetchedAt: number; keys: Jwk[] } | null = null;
const CERT_TTL_MS = 60 * 60 * 1000;

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJson(b64url: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(b64url))) as Record<string, unknown>;
}

async function getCerts(env: Env): Promise<Jwk[]> {
  if (certCache && Date.now() - certCache.fetchedAt < CERT_TTL_MS) return certCache.keys;
  const r = await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error(`certs fetch ${r.status}`);
  const j = (await r.json()) as { keys?: Jwk[] };
  certCache = { fetchedAt: Date.now(), keys: j.keys ?? [] };
  return certCache.keys;
}

/** Verify the Access JWT; return the authenticated email, or null. */
export async function verifyAccessJwt(token: string, env: Env): Promise<string | null> {
  try {
    const [h, p, sig] = token.split(".");
    if (!h || !p || !sig) return null;
    const header = decodeJson(h) as { alg?: string; kid?: string };
    if (header.alg !== "RS256" || !header.kid) return null;

    const payload = decodeJson(p) as { aud?: string | string[]; iss?: string; exp?: number; email?: string };
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(env.ACCESS_AUD)) return null;
    if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return null;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    if (typeof payload.email !== "string" || !payload.email) return null;

    const jwk = (await getCerts(env)).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk as JsonWebKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const data = new TextEncoder().encode(`${h}.${p}`);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(sig) as BufferSource, data as BufferSource);
    return ok ? payload.email : null;
  } catch {
    return null;
  }
}

async function authenticate(req: Request, env: Env): Promise<string | null> {
  const token = req.headers.get("Cf-Access-Jwt-Assertion");
  if (token) return verifyAccessJwt(token, env);
  if (env.DEV_ALLOW_EMAIL) return env.DEV_ALLOW_EMAIL; // wrangler dev ONLY
  return null;
}

/* ---------------- API ---------------- */

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (!url.pathname.startsWith("/api/")) {
      if (env.ASSETS) return env.ASSETS.fetch(req);
      return new Response("Not found", { status: 404 });
    }

    const email = await authenticate(req, env);
    if (!email) {
      return new Response(JSON.stringify({ error: "Unauthenticated — Access JWT missing or invalid" }), {
        status: 401,
        headers: JSON_HEADERS,
      });
    }
    const recordKey = `rec:${email.toLowerCase()}`;

    if (url.pathname === "/api/me" && req.method === "GET") {
      return new Response(JSON.stringify({ email }), { headers: JSON_HEADERS });
    }

    if (url.pathname === "/api/records" && req.method === "GET") {
      const blob = await env.RECORDS.get(recordKey, "text");
      return new Response(blob ?? JSON.stringify({ clients: null }), { headers: JSON_HEADERS });
    }

    if (url.pathname === "/api/records" && req.method === "PUT") {
      const body = await req.text();
      if (body.length > MAX_BLOB_BYTES) {
        return new Response(JSON.stringify({ error: "Record blob too large" }), { status: 413, headers: JSON_HEADERS });
      }
      try {
        const parsed = JSON.parse(body) as { clients?: unknown };
        if (!parsed || typeof parsed !== "object" || !("clients" in parsed)) throw new Error("shape");
      } catch {
        return new Response(JSON.stringify({ error: "Body must be the Studio record blob" }), {
          status: 400,
          headers: JSON_HEADERS,
        });
      }
      await env.RECORDS.put(recordKey, body);
      return new Response(JSON.stringify({ ok: true }), { headers: JSON_HEADERS });
    }

    if (url.pathname === "/api/submit" && req.method === "POST") {
      const body = await req.text();
      if (body.length > MAX_BLOB_BYTES) {
        return new Response(JSON.stringify({ error: "Submission too large" }), { status: 413, headers: JSON_HEADERS });
      }
      let client: unknown;
      try {
        ({ client } = JSON.parse(body) as { client?: unknown });
        if (!client || typeof client !== "object") throw new Error("shape");
      } catch {
        return new Response(JSON.stringify({ error: "Body must be {client: <record>}" }), {
          status: 400,
          headers: JSON_HEADERS,
        });
      }
      const submittedAt = new Date().toISOString();
      await env.RECORDS.put(`sub:${Date.now()}:${email.toLowerCase()}`, JSON.stringify({ email, submittedAt, client }));
      let forwarded = false;
      if (env.SUBMIT_WEBHOOK) {
        try {
          const w = await fetch(env.SUBMIT_WEBHOOK, {
            method: "POST",
            headers: JSON_HEADERS,
            body: JSON.stringify({ email, submittedAt, client }),
          });
          forwarded = w.ok;
        } catch {
          forwarded = false;
        }
      }
      return new Response(JSON.stringify({ ok: true, forwarded }), { headers: JSON_HEADERS });
    }

    return new Response(JSON.stringify({ error: "Unknown API route" }), { status: 404, headers: JSON_HEADERS });
  },
};
