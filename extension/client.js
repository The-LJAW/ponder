// Talks to the Ponder API and handles loading and error states.
// Shared by the web app and the Chrome extension.
import { el } from './render.js';

export function getClientId() {
  try {
    let id = localStorage.getItem('ponder:client');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('ponder:client', id);
    }
    return id;
  } catch {
    return undefined;
  }
}

/** @returns {Promise<{ok: true, video: any, pack: any, meta: any}>} */
export async function requestPack(apiBase, url) {
  let res;
  try {
    const headers = { 'content-type': 'application/json' };
    const clientId = getClientId();
    if (clientId) headers['x-ponder-client'] = clientId;
    res = await fetch(`${apiBase}/api/ponder`, { method: 'POST', headers, body: JSON.stringify({ url }) });
  } catch {
    throw Object.assign(new Error("Couldn't reach Ponder. Check your connection and try again."), { code: 'network' });
  }
  let body = null;
  try {
    body = await res.json();
  } catch {}
  if (!body) throw Object.assign(new Error('Ponder had a hiccup. Try again.'), { code: 'internal' });
  if (!body.ok) {
    throw Object.assign(new Error(body.error?.message || 'Something went wrong.'), { code: body.error?.code });
  }
  return body;
}

const STEPS = [
  'Reading the transcript…',
  'Finding the big ideas…',
  'Building your outline and flashcards…',
  'Writing questions worth pondering…',
  'Almost there…',
];

/** Shows a cycling loading message. Returns a function that clears it. */
export function startLoading(statusEl) {
  const label = el('span', {}, STEPS[0]);
  statusEl.replaceChildren(el('div', { class: 'pk-loading' }, el('span', { class: 'pk-spinner' }), label));
  let i = 0;
  const timer = setInterval(() => {
    i = Math.min(i + 1, STEPS.length - 1);
    label.textContent = STEPS[i];
  }, 4500);
  return () => {
    clearInterval(timer);
    statusEl.replaceChildren();
  };
}

export function showError(statusEl, message) {
  statusEl.replaceChildren(el('p', { class: 'pk-error', role: 'alert' }, message));
}

export function quotaText(meta) {
  if (!meta || meta.remaining == null) return '';
  return `${meta.remaining} free ${meta.remaining === 1 ? 'pack' : 'packs'} left today`;
}
