import { renderPack } from './render.js';
import { requestPack, startLoading, showError, quotaText } from './client.js';
import { parseVideoUrl } from './lib/video.js';
import { SAMPLE_PACK } from './lib/sample-pack.js';

const form = document.getElementById('ask');
const input = document.getElementById('url');
const go = document.getElementById('go');
const status = document.getElementById('status');
const packEl = document.getElementById('pack');
const quota = document.getElementById('quota');
const kinds = document.getElementById('kinds');

function show(data) {
  renderPack(packEl, data);
  kinds.hidden = true;
  packEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const video = parseVideoUrl(input.value);
  if (!video) {
    showError(status, 'That doesn’t look like a YouTube or Vimeo video link.');
    return;
  }
  history.replaceState(null, '', `?v=${encodeURIComponent(video.url)}`);
  go.disabled = true;
  packEl.replaceChildren();
  const stop = startLoading(status);
  try {
    const data = await requestPack('', video.url);
    stop();
    quota.textContent = quotaText(data.meta);
    show(data);
  } catch (err) {
    stop();
    showError(status, err.message);
  } finally {
    go.disabled = false;
  }
});

document.getElementById('sample').addEventListener('click', () => {
  status.replaceChildren();
  show({
    video: { key: 'sample', url: 'https://www.youtube.com/', title: SAMPLE_PACK.title, author: 'Sample lecture' },
    pack: SAMPLE_PACK,
  });
});

// Support shareable links: /?v=<video url>
const shared = new URLSearchParams(location.search).get('v');
if (shared) {
  input.value = shared;
  form.requestSubmit();
}
