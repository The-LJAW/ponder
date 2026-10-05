// Vercel serverless function: POST /api/ponder { url } -> study pack JSON.
import { ponder } from '../lib/handler.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ ok: false, error: { code: 'method', message: 'Use POST.' } });
  }
  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body ?? {};
  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();

  const { status, body: out } = await ponder({
    url: body.url,
    clientId: req.headers['x-ponder-client'],
    ip: ip || undefined,
  });
  res.setHeader('cache-control', 'no-store');
  return res.status(status).json(out);
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
