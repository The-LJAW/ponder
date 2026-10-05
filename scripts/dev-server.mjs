// Local dev server: serves public/ and the API at http://localhost:3000.
// No Vercel CLI or npm install needed. Reads keys from .env if present.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// Minimal .env loader (real env vars win).
const envFile = join(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env) && m[2] !== '') process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { ponder } = await import('../lib/handler.js');
const { createMemoryStore } = await import('../lib/store.js');
const store = process.env.UPSTASH_REDIS_REST_URL ? undefined : createMemoryStore();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (pathname === '/api/ponder') {
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body = {};
    try {
      body = JSON.parse(raw || '{}');
    } catch {}
    const out = await ponder(
      { url: body.url, clientId: req.headers['x-ponder-client'], ip: '127.0.0.1' },
      { store },
    );
    res.writeHead(out.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(out.body));
    return;
  }

  const rel = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
  try {
    const data = await readFile(join(root, 'public', rel));
    res.writeHead(200, { 'content-type': TYPES[extname(rel)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  const mode = process.env.PONDER_MOCK === '1' ? ' (mock mode: sample pack, no API calls)' : '';
  console.log(`Ponder running at http://localhost:${port}${mode}`);
});
