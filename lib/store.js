// Tiny key-value store over the Upstash Redis REST API (also what Vercel's
// marketplace "Upstash for Redis" integration provisions). Used for two
// things: caching packs per video, and the free-tier daily limit.
//
// A store is required in production: without one the API refuses to generate
// packs (see lib/handler.js), so a missing env var can't silently remove the
// spending limits. The local dev server uses the in-memory store below.

export function createStore(env = process.env, f = fetch) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (!url || !token) return null;

  async function cmd(...args) {
    const res = await f(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`store ${args[0]} failed: ${res.status}`);
    return (await res.json()).result;
  }

  return {
    async getJson(key) {
      const v = await cmd('GET', key);
      return v ? JSON.parse(v) : null;
    },
    async setJson(key, value, ttlSeconds) {
      await cmd('SET', key, JSON.stringify(value), 'EX', String(ttlSeconds));
    },
    async get(key) {
      const v = await cmd('GET', key);
      return v == null ? 0 : Number(v);
    },
    /** Increments a counter atomically and sets its expiry the first time. */
    async incr(key, ttlSeconds) {
      const n = await cmd('INCR', key);
      if (n === 1) await cmd('EXPIRE', key, String(ttlSeconds));
      return n;
    },
    async decr(key) {
      return cmd('DECR', key);
    },
  };
}

/** In-memory store with the same interface, for tests and local dev. */
export function createMemoryStore() {
  const m = new Map();
  return {
    async getJson(k) {
      return m.has(k) ? JSON.parse(m.get(k)) : null;
    },
    async setJson(k, v) {
      m.set(k, JSON.stringify(v));
    },
    async get(k) {
      return Number(m.get(k) ?? 0);
    },
    async incr(k) {
      const n = Number(m.get(k) ?? 0) + 1;
      m.set(k, String(n));
      return n;
    },
    async decr(k) {
      const n = Number(m.get(k) ?? 0) - 1;
      m.set(k, String(n));
      return n;
    },
  };
}
