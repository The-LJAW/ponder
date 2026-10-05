// Fetches a plain-text transcript and basic metadata for a parsed video.
//
// YouTube: Supadata (https://supadata.ai). The free youtube-transcript-api
// route gets IP-blocked (403) from cloud hosts, so production needs a paid
// service. Vimeo: Supadata does not support it, so we read the captions
// track from Vimeo's public player config (best effort, captioned videos only).

export class PonderError extends Error {
  /** @param {string} code @param {string} message @param {number} [status] */
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const SUPADATA = 'https://api.supadata.ai/v1/transcript';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {{platform: string, id: string, hash?: string, url: string}} video
 * @param {{fetch?: typeof fetch, env?: Record<string,string|undefined>, pollMs?: number, maxWaitMs?: number}} [opts]
 * @returns {Promise<{text: string, lang?: string}>}
 */
export async function getTranscript(video, opts = {}) {
  const f = opts.fetch ?? fetch;
  const env = opts.env ?? process.env;
  if (video.platform === 'vimeo') return getVimeoTranscript(video, f);
  return getSupadataTranscript(video.url, f, env, opts.pollMs ?? 1500, opts.maxWaitMs ?? 40000);
}

async function getSupadataTranscript(url, f, env, pollMs, maxWaitMs) {
  const key = env.SUPADATA_API_KEY;
  if (!key) throw new PonderError('config', 'Server is missing SUPADATA_API_KEY.', 500);

  const params = new URLSearchParams({
    url,
    text: 'true',
    // "native" uses existing captions (including YouTube auto-captions) and is
    // the cheap path. "auto" falls back to AI transcription at a higher price.
    mode: env.SUPADATA_MODE || 'native',
  });
  const headers = { 'x-api-key': key };

  let res = await f(`${SUPADATA}?${params}`, { headers });
  let body = await safeJson(res);

  if (res.status === 202 && body?.jobId) {
    const deadline = Date.now() + maxWaitMs;
    while (true) {
      if (Date.now() > deadline) {
        throw new PonderError('timeout', 'The transcript is taking too long. Try again in a minute.', 504);
      }
      await sleep(pollMs);
      res = await f(`${SUPADATA}/${body.jobId}`, { headers });
      const job = await safeJson(res);
      if (job?.status === 'completed') {
        body = job;
        break;
      }
      if (job?.status === 'failed') {
        throw new PonderError('no_transcript', "Couldn't get a transcript for this video.", 422);
      }
    }
  } else if (!res.ok) {
    if (res.status === 404 || res.status === 206 || res.status === 422) {
      throw new PonderError(
        'no_transcript',
        "This video doesn't have captions, so Ponder can't read it yet.",
        422,
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new PonderError('config', 'Transcript service rejected the API key.', 500);
    }
    if (res.status === 429) {
      throw new PonderError('busy', 'Ponder is busy right now. Try again in a minute.', 503);
    }
    throw new PonderError('upstream', `Transcript service error (${res.status}).`, 502);
  }

  const text = contentToText(body?.content);
  if (!text.trim()) {
    throw new PonderError('no_transcript', "This video doesn't have captions, so Ponder can't read it yet.", 422);
  }
  return { text, lang: body?.lang };
}

function contentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => c?.text ?? '').join(' ');
  return '';
}

async function getVimeoTranscript(video, f) {
  const q = video.hash ? `?h=${encodeURIComponent(video.hash)}` : '';
  const res = await f(`https://player.vimeo.com/video/${video.id}/config${q}`, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; Ponder/0.1)' },
  });
  if (!res.ok) {
    throw new PonderError('no_transcript', "Couldn't open this Vimeo video. It may be private.", 422);
  }
  const cfg = await safeJson(res);
  const tracks = cfg?.request?.text_tracks ?? [];
  if (!tracks.length) {
    throw new PonderError('no_transcript', "This Vimeo video doesn't have captions, so Ponder can't read it yet.", 422);
  }
  const track = tracks.find((t) => /^en/i.test(t.lang)) ?? tracks[0];
  const vttUrl = new URL(track.url, 'https://player.vimeo.com').toString();
  const vtt = await f(vttUrl);
  if (!vtt.ok) throw new PonderError('no_transcript', "Couldn't load this video's captions.", 422);
  return { text: vttToText(await vtt.text()), lang: track.lang };
}

/** Strips WebVTT timing and markup down to plain spoken text. */
export function vttToText(vtt) {
  const out = [];
  let last = '';
  for (const raw of String(vtt).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line === 'WEBVTT' || /^(NOTE|STYLE|REGION)\b/.test(line)) continue;
    if (line.includes('-->') || /^\d+$/.test(line)) continue;
    const clean = line.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
    if (clean && clean !== last) out.push(clean);
    last = clean;
  }
  return out.join(' ');
}

/**
 * Title and channel via oEmbed. Never throws; metadata is nice to have.
 * @returns {Promise<{title?: string, author?: string, thumbnail?: string}>}
 */
export async function getVideoMeta(video, opts = {}) {
  const f = opts.fetch ?? fetch;
  const endpoint =
    video.platform === 'vimeo'
      ? `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(video.url)}`
      : `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(video.url)}`;
  try {
    const res = await f(endpoint);
    if (!res.ok) return {};
    const j = await res.json();
    return { title: j.title, author: j.author_name, thumbnail: j.thumbnail_url };
  } catch {
    return {};
  }
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
