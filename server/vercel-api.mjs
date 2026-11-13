import { publicError } from './market-client.mjs';

export function sendJson(res, status, body) {
  res.status(status).setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.json(body);
}

export function sendMarketError(res, error) {
  const safe = publicError(error);
  sendJson(res, safe.status, safe.body);
}

export function methodNotAllowed(res) {
  sendJson(res, 405, { error: 'This method is not supported.', code: 'METHOD_NOT_ALLOWED' });
}

export function setCorsHeaders(res) {
  // Same-origin Vercel requests do not need CORS. This allows a separately
  // configured preview origin while never reflecting arbitrary origins.
  const origin = typeof res.req?.headers?.origin === 'string' ? res.req.headers.origin : '';
  const host = typeof res.req?.headers?.host === 'string' ? res.req.headers.host : '';
  if (origin && /^https:\/\/(?:[a-z0-9-]+\.)?vercel\.app$/i.test(origin) && origin.endsWith(host ? `://${host}` : '')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

export function readQuoteIds(req) {
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body)?.instrumentIds; } catch { return undefined; }
  }
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body.instrumentIds
    : undefined;
}
