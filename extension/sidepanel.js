import { API_BASE } from './config.js';
import { parseVideoUrl } from './lib/video.js';
import { renderPack, el } from './render.js';
import { requestPack, startLoading, showError, quotaText } from './client.js';

const $ = (id) => document.getElementById(id);
const ui = {
  current: $('current'),
  title: $('vid-title'),
  go: $('go'),
  empty: $('empty'),
  status: $('status'),
  pack: $('pack'),
  recent: $('recent'),
  recentList: $('recent-list'),
  quota: $('quota'),
};

const MAX_HISTORY = 40;
let current = null; // { video, title } for the active tab
const inFlight = new Set(); // video keys being generated

// ---- storage helpers -------------------------------------------------------

const store = chrome.storage.local;
const getPack = async (key) => (await store.get(`pack:${key}`))[`pack:${key}`] ?? null;

async function savePack(data) {
  const key = data.video.key;
  const { history = [] } = await store.get('history');
  const next = [
    { key, title: data.video.title || data.pack.title, url: data.video.url, at: Date.now() },
    ...history.filter((h) => h.key !== key),
  ];
  const dropped = next.slice(MAX_HISTORY).map((h) => `pack:${h.key}`);
  await store.set({ [`pack:${key}`]: data, history: next.slice(0, MAX_HISTORY) });
  if (dropped.length) await store.remove(dropped);
}

async function saveQuota(meta) {
  const text = quotaText(meta);
  if (!text) return;
  await store.set({ quota: { text, day: new Date().toDateString() } });
  ui.quota.textContent = text;
}

async function loadQuota() {
  const { quota } = await store.get('quota');
  ui.quota.textContent = quota?.day === new Date().toDateString() ? quota.text : '';
}

// ---- views -----------------------------------------------------------------

function cleanTitle(t = '') {
  return t
    .replace(/^\(\d+\)\s*/, '')
    .replace(/\s+-\s+YouTube$/, '')
    .replace(/\s+on Vimeo$/, '')
    .trim();
}

async function showRecent() {
  const { history = [] } = await store.get('history');
  ui.recent.hidden = history.length === 0;
  ui.recentList.replaceChildren(
    ...history.slice(0, 12).map((h) =>
      el(
        'li',
        {},
        el(
          'button',
          {
            type: 'button',
            onclick: async () => {
              const data = await getPack(h.key);
              if (!data) return;
              ui.empty.hidden = true;
              ui.recent.hidden = true;
              ui.current.hidden = true;
              renderPack(ui.pack, data);
              window.scrollTo(0, 0);
            },
          },
          h.title || h.url,
        ),
      ),
    ),
  );
}

async function refresh() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const video = parseVideoUrl(tab?.url);

  if (video && current?.video.key === video.key) return; // same video, keep the view
  current = video ? { video, title: cleanTitle(tab.title) } : null;
  ui.status.replaceChildren();
  ui.pack.replaceChildren();

  if (!video) {
    ui.current.hidden = true;
    ui.empty.hidden = false;
    await showRecent();
    return;
  }

  ui.empty.hidden = true;
  ui.recent.hidden = true;
  const saved = await getPack(video.key);
  if (saved) {
    ui.current.hidden = true;
    renderPack(ui.pack, saved);
    return;
  }
  ui.current.hidden = false;
  ui.title.textContent = current.title || video.url;
  ui.go.disabled = inFlight.has(video.key);
  if (inFlight.has(video.key)) startLoading(ui.status);
}

async function ponderCurrent() {
  if (!current) return;
  const { video } = current;
  inFlight.add(video.key);
  ui.go.disabled = true;
  const stop = startLoading(ui.status);
  try {
    const data = await requestPack(API_BASE, video.url);
    if (!data.video.title && current?.title) data.video.title = current.title;
    await savePack(data);
    await saveQuota(data.meta);
    if (current?.video.key === video.key) {
      stop();
      ui.current.hidden = true;
      renderPack(ui.pack, data);
    }
  } catch (err) {
    if (current?.video.key === video.key) {
      stop();
      showError(ui.status, err.message);
    }
  } finally {
    inFlight.delete(video.key);
    ui.go.disabled = false;
  }
}

// ---- wiring ----------------------------------------------------------------

ui.go.addEventListener('click', ponderCurrent);
chrome.tabs.onActivated.addListener(refresh);
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (tab.active && (change.url || change.title)) refresh();
});
chrome.windows.onFocusChanged.addListener(refresh);

loadQuota();
refresh();
