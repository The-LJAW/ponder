// The whole request pipeline, independent of Vercel so it can be tested and
// run by the local dev server: validate link -> cache -> reserve a use ->
// transcript -> Claude -> cache.
//
// Spending protection, from narrowest to widest:
//   1. Cache: a video is generated once, then served free for 30 days.
//   2. Per-install daily limit (FREE_DAILY_LIMIT, default 5).
//   3. Per-IP daily limit (3x the per-install limit), so rotating the
//      install ID doesn't reset it.
//   4. Global daily cap (GLOBAL_DAILY_LIMIT, default 200) across everyone.
//      This is the hard ceiling: worst case daily spend is about
//      GLOBAL_DAILY_LIMIT x 6 cents on Haiku, however many IPs an abuser has.
// Uses are reserved with atomic increments *before* any paid call, so a burst
// of parallel requests can't slip past a limit, and refunded if the pack
// fails. With no store configured the API fails closed (refuses to generate).

import { parseVideoUrl } from './video.js';
import { getTranscript, getVideoMeta, PonderError } from './transcript.js';
import { generateStudyPack, PACK_VERSION } from './studypack.js';
import { createStore } from './store.js';
import { SAMPLE_PACK } from './sample-pack.js';

const DAY = 24 * 60 * 60;
const CACHE_TTL = 30 * DAY;
const COUNTER_TTL = 2 * DAY;

/**
 * @param {{url?: string, clientId?: string, ip?: string}} input
 * @param {{env?: Record<string,string|undefined>, fetch?: typeof fetch, store?: any, now?: Date}} [deps]
 * @returns {Promise<{status: number, body: any}>}
 */
export async function ponder(input, deps = {}) {
  const env = deps.env ?? process.env;
  const f = deps.fetch ?? fetch;
  const store = deps.store !== undefined ? deps.store : createStore(env, f);
  let reservation = null;

  try {
    const video = parseVideoUrl(input?.url);
    if (!video) {
      throw new PonderError('bad_url', 'Paste a YouTube or Vimeo video link.', 400);
    }

    if (env.PONDER_MOCK === '1') {
      return ok(video, SAMPLE_PACK, { title: SAMPLE_PACK.title, author: 'Sample channel' }, { cached: false, mock: true });
    }

    if (!store && env.PONDER_ALLOW_NO_LIMITS !== '1') {
      console.error('Refusing to generate: no usage store configured (UPSTASH_REDIS_REST_URL / _TOKEN).');
      throw new PonderError('config', 'Ponder is not fully set up yet. Try again later.', 503);
    }

    const limits = {
      perClient: Number(env.FREE_DAILY_LIMIT || 5),
      global: Number(env.GLOBAL_DAILY_LIMIT || 200),
    };
    const day = (deps.now ?? new Date()).toISOString().slice(0, 10);
    const clientId = /^[\w-]{8,64}$/.test(input?.clientId ?? '') ? input.clientId : null;
    const keys = {
      client: clientId ? `quota:${day}:c:${clientId}` : null,
      ip: input?.ip ? `quota:${day}:ip:${input.ip}` : null,
      global: `quota:${day}:global`,
    };
    const cacheKey = `pack:v${PACK_VERSION}:${video.key}`;

    // 1. Cache. Cached packs cost nothing, so they don't use up the limit.
    if (store) {
      const hit = await store.getJson(cacheKey).catch(() => null);
      if (hit) {
        const used = keys.client ? await store.get(keys.client).catch(() => 0) : 0;
        return ok(video, hit.pack, hit.video, {
          cached: true,
          limit: limits.perClient,
          remaining: Math.max(0, limits.perClient - used),
        });
      }
      // 2-4. Reserve a use. Throws if any limit is hit (or the store is down).
      reservation = await reserve(store, keys, limits);
    }

    const [transcript, meta] = await Promise.all([
      getTranscript(video, { fetch: f, env }),
      getVideoMeta(video, { fetch: f }),
    ]);
    const result = await generateStudyPack(transcript, meta, { fetch: f, env });
    reservation = null; // spent: keep the use counted
    const videoMeta = { title: meta.title || result.pack.title, author: meta.author, thumbnail: meta.thumbnail };

    if (store) await store.setJson(cacheKey, { pack: result.pack, video: videoMeta }, CACHE_TTL).catch(() => {});

    console.log(
      JSON.stringify({ event: 'pack', video: video.key, model: result.model, usage: result.usage, truncated: result.truncated }),
    );
    return ok(video, result.pack, videoMeta, {
      cached: false,
      truncated: result.truncated,
      limit: store ? limits.perClient : undefined,
      remaining: store && keys.client ? Math.max(0, limits.perClient - (await store.get(keys.client).catch(() => 0))) : undefined,
    });
  } catch (err) {
    // A failed pack (no captions, upstream error) gives the use back.
    if (reservation) await reservation.refund().catch(() => {});
    if (err instanceof PonderError) {
      return { status: err.status, body: { ok: false, error: { code: err.code, message: err.message } } };
    }
    console.error(err);
    return {
      status: 500,
      body: { ok: false, error: { code: 'internal', message: 'Something went wrong. Try again.' } },
    };
  }
}

/**
 * Atomically counts this request against the per-install, per-IP and global
 * limits. Over a limit, it undoes its own increments and throws, so rejected
 * requests from one abuser can't eat into everyone else's global capacity.
 */
async function reserve(store, keys, limits) {
  const taken = [];
  const undo = () => Promise.all(taken.map((k) => store.decr(k)));
  const take = async (key) => {
    const n = await store.incr(key, COUNTER_TTL);
    taken.push(key);
    return n;
  };

  try {
    if (keys.client && (await take(keys.client)) > limits.perClient) {
      await undo();
      throw new PonderError(
        'limit',
        `You've used today's ${limits.perClient} free study packs. Come back tomorrow for more.`,
        429,
      );
    }
    if (keys.ip && (await take(keys.ip)) > limits.perClient * 3) {
      await undo();
      throw new PonderError('limit', "You've reached today's free limit. Come back tomorrow for more.", 429);
    }
    if ((await take(keys.global)) > limits.global) {
      await undo();
      console.warn(JSON.stringify({ event: 'global_cap_hit', limit: limits.global }));
      throw new PonderError('capacity', 'Ponder has reached its limit for today. Try again tomorrow.', 503);
    }
  } catch (err) {
    if (err instanceof PonderError) throw err;
    // Store unreachable: fail closed rather than generate without limits.
    await undo().catch(() => {});
    console.error('Usage store error', err);
    throw new PonderError('busy', 'Ponder is busy right now. Try again in a minute.', 503);
  }

  return { refund: undo };
}

function ok(video, pack, meta, extra) {
  return {
    status: 200,
    body: {
      ok: true,
      video: { platform: video.platform, id: video.id, key: video.key, url: video.url, ...meta },
      pack,
      meta: extra,
    },
  };
}
