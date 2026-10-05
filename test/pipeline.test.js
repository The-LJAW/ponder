import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ponder } from '../lib/handler.js';
import { normalizePack, REFLECTION_KINDS } from '../lib/studypack.js';
import { vttToText } from '../lib/transcript.js';
import { createMemoryStore } from '../lib/store.js';
import { SAMPLE_PACK } from '../lib/sample-pack.js';

const ENV = { ANTHROPIC_API_KEY: 'test-a', SUPADATA_API_KEY: 'test-s', FREE_DAILY_LIMIT: '2' };
const URL_A = 'https://www.youtube.com/watch?v=aaaaaaaaaaa';
const URL_B = 'https://youtu.be/bbbbbbbbbbb';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Fake upstreams. Records every call so tests can assert on cost-bearing requests. */
function fakeFetch({ transcriptStatus = 200, async = false } = {}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    url = String(url);
    calls.push(url);
    if (url.includes('youtube.com/oembed')) return json(200, { title: 'A Real Title', author_name: 'Some Channel' });
    if (url.startsWith('https://api.supadata.ai/v1/transcript/job-1')) {
      return json(200, { status: 'completed', content: 'the transcript from a job' });
    }
    if (url.startsWith('https://api.supadata.ai/v1/transcript')) {
      assert.equal(init.headers['x-api-key'], 'test-s');
      if (async) return json(202, { jobId: 'job-1' });
      if (transcriptStatus !== 200) return json(transcriptStatus, { error: 'nope' });
      return json(200, { content: 'spaced practice beats cramming ...', lang: 'en' });
    }
    if (url === 'https://api.anthropic.com/v1/messages') {
      const body = JSON.parse(init.body);
      assert.equal(body.tool_choice.name, 'study_pack');
      assert.match(body.messages[0].content, /<transcript>/);
      assert.match(body.messages[0].content, /A Real Title/);
      return json(200, {
        content: [{ type: 'tool_use', name: 'study_pack', input: SAMPLE_PACK }],
        usage: { input_tokens: 1000, output_tokens: 900 },
      });
    }
    throw new Error('unexpected fetch ' + url);
  };
  fn.calls = calls;
  fn.count = (prefix) => calls.filter((c) => c.startsWith(prefix)).length;
  return fn;
}

test('happy path returns a full pack', async () => {
  const f = fakeFetch();
  const { status, body } = await ponder({ url: URL_A, clientId: 'client-123' }, { env: ENV, fetch: f, store: null });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.video.title, 'A Real Title');
  assert.equal(body.video.author, 'Some Channel');
  assert.deepEqual(
    body.pack.reflection.map((q) => q.kind),
    REFLECTION_KINDS,
  );
  assert.ok(body.pack.flashcards.length >= 5);
});

test('rejects bad links before calling anything', async () => {
  const f = fakeFetch();
  const { status, body } = await ponder({ url: 'https://example.com' }, { env: ENV, fetch: f, store: null });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'bad_url');
  assert.equal(f.calls.length, 0);
});

test('videos without captions give a friendly error', async () => {
  const { status, body } = await ponder({ url: URL_A }, { env: ENV, fetch: fakeFetch({ transcriptStatus: 404 }), store: null });
  assert.equal(status, 422);
  assert.equal(body.error.code, 'no_transcript');
  assert.match(body.error.message, /captions/);
});

test('polls Supadata when the transcript is processed async', async () => {
  const env = { ...ENV };
  const f = fakeFetch({ async: true });
  // Speed the poll up by stubbing setTimeout delays: handler uses defaults, so call through transcript directly.
  const { getTranscript } = await import('../lib/transcript.js');
  const t = await getTranscript({ platform: 'youtube', url: URL_A }, { fetch: f, env, pollMs: 1 });
  assert.equal(t.text, 'the transcript from a job');
});

test('cache: second request for the same video makes no paid calls', async () => {
  const store = createMemoryStore();
  const f = fakeFetch();
  const first = await ponder({ url: URL_A, clientId: 'client-123' }, { env: ENV, fetch: f, store });
  assert.equal(first.body.meta.cached, false);
  assert.equal(first.body.meta.remaining, 1);
  const paid = () => f.count('https://api.anthropic.com') + f.count('https://api.supadata.ai');
  const before = paid();
  const second = await ponder({ url: 'https://youtu.be/aaaaaaaaaaa', clientId: 'client-123' }, { env: ENV, fetch: f, store });
  assert.equal(second.body.meta.cached, true);
  assert.equal(second.body.meta.remaining, 1, 'cached hits do not use up the free limit');
  assert.equal(paid(), before);
});

test('free daily limit blocks new generations', async () => {
  const store = createMemoryStore();
  const f = fakeFetch();
  const day = new Date('2026-10-05T12:00:00Z');
  const deps = { env: ENV, fetch: f, store, now: day };
  assert.equal((await ponder({ url: URL_A, clientId: 'client-123', ip: '1.2.3.4' }, deps)).status, 200);
  assert.equal((await ponder({ url: URL_B, clientId: 'client-123', ip: '1.2.3.4' }, deps)).status, 200);
  const third = await ponder({ url: 'https://youtu.be/ccccccccccc', clientId: 'client-123', ip: '1.2.3.4' }, deps);
  assert.equal(third.status, 429);
  assert.equal(third.body.error.code, 'limit');
  // Next day resets.
  const tomorrow = await ponder(
    { url: 'https://youtu.be/ccccccccccc', clientId: 'client-123', ip: '1.2.3.4' },
    { ...deps, now: new Date('2026-10-06T12:00:00Z') },
  );
  assert.equal(tomorrow.status, 200);
});

test('mock mode needs no keys and makes no calls', async () => {
  const f = fakeFetch();
  const { status, body } = await ponder({ url: URL_A }, { env: { PONDER_MOCK: '1' }, fetch: f, store: null });
  assert.equal(status, 200);
  assert.equal(body.meta.mock, true);
  assert.equal(f.calls.length, 0);
});

test('missing keys report a config error, not a crash', async () => {
  const { status, body } = await ponder({ url: URL_A }, { env: {}, fetch: fakeFetch(), store: null });
  assert.equal(status, 500);
  assert.equal(body.error.code, 'config');
});

test('normalizePack orders kinds and drops junk', () => {
  const pack = normalizePack({
    title: ' T ',
    summary: 'S',
    outline: [{ heading: 'H', points: ['p', '', 3] }, {}],
    flashcards: [{ front: 'f', back: 'b' }, { front: 'only front' }],
    reflection: [
      { kind: 'decide', question: 'D?', nudge: 'n' },
      { kind: 'Apply', question: 'A?' },
      { kind: 'Push back', question: 'P?', nudge: 'n' },
      { kind: 'Connect', question: 'C?', nudge: 'n' },
      { kind: 'Transfer', question: 'T?', nudge: 'n' },
      { kind: 'Bogus', question: 'X?' },
    ],
  });
  assert.equal(pack.title, 'T');
  assert.deepEqual(pack.reflection.map((q) => q.kind), REFLECTION_KINDS);
  assert.equal(pack.reflection[0].nudge, '');
  assert.equal(pack.outline.length, 1);
  assert.deepEqual(pack.outline[0].points, ['p']);
  assert.equal(pack.flashcards.length, 1);
});

test('normalizePack refuses a pack without reflection questions', () => {
  assert.throws(() => normalizePack({ summary: 's', reflection: [] }), /reflection/);
});

test('vttToText strips timing, tags and repeats', () => {
  const vtt = `WEBVTT

1
00:00:00.000 --> 00:00:02.000
<v Speaker>Hello &amp; welcome</v>

2
00:00:02.000 --> 00:00:04.000
Hello &amp; welcome

3
00:00:04.000 --> 00:00:06.000
to the lecture.`;
  assert.equal(vttToText(vtt), 'Hello & welcome to the lecture.');
});
