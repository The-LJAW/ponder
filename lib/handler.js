// The whole request pipeline, independent of Vercel so it can be tested and
// run by the local dev server: validate link -> cache -> free-tier limit ->
// transcript -> Claude -> cache.

import { parseVideoUrl } from './video.js';
import { getTranscript, getVideoMeta, PonderError } from './transcript.js';
import { generateStudyPack, PACK_VERSION } from './studypack.js';
import { createStore } from './store.js';
import { SAMPLE_PACK } from './sample-pack.js';

const DAY = 24 * 60 * 60;
const CACHE_TTL = 30 * DAY;

/**
 * @param {{url?: string, clientId?: string, ip?: string}} input
 * @param {{env?: Record<string,string|undefined>, fetch?: typeof fetch, store?: any, now?: Date}} [deps]
 * @returns {Promise<{status: number, body: any}>}
 */
export async function ponder(input, deps = {}) {
  const env = deps.env ?? process.env;
  const f = deps.fetch ?? fetch;
  const store = deps.store !== undefined ? deps.store : createStore(env, f);

  try {
    const video = parseVideoUrl(input?.url);
    if (!video) {
      throw new PonderError('bad_url', 'Paste a YouTube or Vimeo video link.', 400);
    }

    if (env.PONDER_MOCK === '1') {
      return ok(video, SAMPLE_PACK, { title: SAMPLE_PACK.title, author: 'Sample channel' }, { cached: false, mock: true });
    }

    const cacheKey = `pack:v${PACK_VERSION}:${video.key}`;
    const limit = Number(env.FREE_DAILY_LIMIT || 5);
    const day = (deps.now ?? new Date()).toISOString().slice(0, 10);
    const clientId = /^[\w-]{8,64}$/.test(input?.clientId ?? '') ? input.clientId : null;
    const quotaKeys = [];
    if (clientId) quotaKeys.push(`quota:${day}:c:${clientId}`);
    if (input?.ip) quotaKeys.push(`quota:${day}:ip:${input.ip}`);

    // Cached packs cost nothing to serve, so they don't count against the limit.
    if (store) {
      const hit = await store.getJson(cacheKey).catch(() => null);
      if (hit) {
        const used = clientId ? await store.get(quotaKeys[0]).catch(() => 0) : 0;
        return ok(video, hit.pack, hit.video, { cached: true, limit, remaining: Math.max(0, limit - used) });
      }

      // Per-install limit, plus a looser per-IP limit so clearing the install
      // ID doesn't reset it.
      const [byClient, byIp] = await Promise.all([
        clientId ? store.get(quotaKeys[0]) : 0,
        input?.ip ? store.get(quotaKeys[quotaKeys.length - 1]) : 0,
      ]).catch(() => [0, 0]);
      if (byClient >= limit || byIp >= limit * 3) {
        throw new PonderError(
          'limit',
          `You've used today's ${limit} free study packs. Come back tomorrow for more.`,
          429,
        );
      }
    }

    const [transcript, meta] = await Promise.all([
      getTranscript(video, { fetch: f, env }),
      getVideoMeta(video, { fetch: f }),
    ]);
    const result = await generateStudyPack(transcript, meta, { fetch: f, env });
    const videoMeta = { title: meta.title || result.pack.title, author: meta.author, thumbnail: meta.thumbnail };

    let remaining;
    if (store) {
      await store.setJson(cacheKey, { pack: result.pack, video: videoMeta }, CACHE_TTL).catch(() => {});
      const counts = await Promise.all(quotaKeys.map((k) => store.incr(k, 2 * DAY))).catch(() => []);
      remaining = clientId && counts.length ? Math.max(0, limit - counts[0]) : undefined;
    }

    console.log(
      JSON.stringify({ event: 'pack', video: video.key, model: result.model, usage: result.usage, truncated: result.truncated }),
    );
    return ok(video, result.pack, videoMeta, {
      cached: false,
      truncated: result.truncated,
      limit: store ? limit : undefined,
      remaining,
    });
  } catch (err) {
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
