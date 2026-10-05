import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVideoUrl } from '../lib/video.js';

const YT = 'dQw4w9WgXcQ';

test('parses common YouTube link shapes', () => {
  const links = [
    `https://www.youtube.com/watch?v=${YT}`,
    `https://youtube.com/watch?v=${YT}&t=42s&list=PL123`,
    `https://m.youtube.com/watch?v=${YT}`,
    `https://youtu.be/${YT}?si=abc`,
    `https://www.youtube.com/shorts/${YT}`,
    `https://www.youtube.com/embed/${YT}`,
    `https://www.youtube.com/live/${YT}`,
    `https://www.youtube-nocookie.com/embed/${YT}`,
    `youtube.com/watch?v=${YT}`,
    `  https://www.youtube.com/watch?v=${YT}  `,
  ];
  for (const link of links) {
    const v = parseVideoUrl(link);
    assert.ok(v, link);
    assert.equal(v.platform, 'youtube');
    assert.equal(v.id, YT);
    assert.equal(v.key, `yt:${YT}`);
    assert.equal(v.url, `https://www.youtube.com/watch?v=${YT}`);
  }
});

test('parses Vimeo links, including unlisted hashes', () => {
  assert.deepEqual(parseVideoUrl('https://vimeo.com/76979871'), {
    platform: 'vimeo',
    id: '76979871',
    url: 'https://vimeo.com/76979871',
    key: 'vm:76979871',
  });
  assert.equal(parseVideoUrl('https://vimeo.com/channels/staffpicks/76979871').id, '76979871');
  assert.equal(parseVideoUrl('https://player.vimeo.com/video/76979871').id, '76979871');
  const unlisted = parseVideoUrl('https://vimeo.com/76979871/abc123def4');
  assert.equal(unlisted.hash, 'abc123def4');
  assert.equal(parseVideoUrl('https://player.vimeo.com/video/76979871?h=abc123def4').hash, 'abc123def4');
});

test('rejects things that are not videos', () => {
  for (const bad of [
    '',
    null,
    'hello',
    'https://www.youtube.com/',
    'https://www.youtube.com/@somechannel',
    'https://www.youtube.com/watch?v=short',
    'https://vimeo.com/about',
    'https://example.com/watch?v=dQw4w9WgXcQ',
    'javascript:alert(1)',
  ]) {
    assert.equal(parseVideoUrl(bad), null, String(bad));
  }
});
