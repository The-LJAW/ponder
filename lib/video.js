// Parses a YouTube or Vimeo link into a normalized video reference.
// Shared by the API, the web app and the Chrome extension, so it has no
// dependencies and runs in Node and the browser alike.

const YT_ID = /^[\w-]{11}$/;
const YT_HOSTS = new Set([
  'youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
]);

/**
 * @param {string} input A URL the user pasted or the current tab URL.
 * @returns {{platform: 'youtube'|'vimeo', id: string, hash?: string, url: string, key: string} | null}
 */
export function parseVideoUrl(input) {
  if (!input) return null;
  let raw = String(input).trim();
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;

  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');

  // YouTube
  let ytId = null;
  if (host === 'youtu.be') {
    ytId = url.pathname.slice(1).split('/')[0];
  } else if (YT_HOSTS.has(host)) {
    if (url.pathname === '/watch') {
      ytId = url.searchParams.get('v');
    } else {
      const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
      if (m) ytId = m[1];
    }
  }
  if (ytId !== null) {
    if (!YT_ID.test(ytId)) return null;
    return {
      platform: 'youtube',
      id: ytId,
      url: `https://www.youtube.com/watch?v=${ytId}`,
      key: `yt:${ytId}`,
    };
  }

  // Vimeo: vimeo.com/123, vimeo.com/123/abcdef (unlisted), vimeo.com/channels/x/123,
  // vimeo.com/groups/x/videos/123, player.vimeo.com/video/123?h=abcdef
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const parts = url.pathname.split('/').filter(Boolean);
    const idx = parts.findIndex((p) => /^\d{6,12}$/.test(p));
    if (idx === -1) return null;
    const id = parts[idx];
    let hash = url.searchParams.get('h') || undefined;
    const next = parts[idx + 1];
    if (!hash && next && /^[0-9a-f]{6,20}$/i.test(next)) hash = next;
    return {
      platform: 'vimeo',
      id,
      ...(hash ? { hash } : {}),
      url: hash ? `https://vimeo.com/${id}/${hash}` : `https://vimeo.com/${id}`,
      key: `vm:${id}`,
    };
  }

  return null;
}
