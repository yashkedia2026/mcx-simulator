import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { publicError } from './market-client.mjs';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};

function localHostname(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function allowedRequest(req) {
  try {
    if (!req.headers.host || !localHostname(new URL(`http://${req.headers.host}`).hostname)) return false;
    if (req.headers.origin) {
      const origin = new URL(req.headers.origin);
      if (!['http:', 'https:'].includes(origin.protocol) || !localHostname(origin.hostname)) return false;
    }
    return req.headers['sec-fetch-site'] !== 'cross-site';
  } catch { return false; }
}

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}

async function jsonBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) {
    return { error: 'Send an application/json request body.', code: 'INVALID_CONTENT_TYPE', status: 415 };
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > 16_384) return { error: 'Request body is too large.', code: 'BODY_TOO_LARGE', status: 413 };
    chunks.push(Buffer.from(chunk));
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return { body };
  } catch { return { error: 'Request body must be valid JSON.', code: 'INVALID_JSON', status: 400 }; }
}

async function serveStatic(req, res, pathname, distDirectory) {
  if (!distDirectory || !['GET', 'HEAD'].includes(req.method)) return false;
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return false; }
  if (decoded.includes('\0') || decoded.includes('\\')) return false;
  try {
    const root = await realpath(distDirectory);
    let target = path.resolve(root, `.${decoded}`);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) return false;
    let file;
    try {
      file = await stat(target);
      if (file.isDirectory()) target = path.join(target, 'index.html');
    } catch {
      if (path.extname(target)) return false;
      target = path.join(root, 'index.html');
    }
    const actual = await realpath(target);
    if (!actual.startsWith(`${root}${path.sep}`)) return false;
    const contents = await readFile(actual);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(actual)] ?? 'application/octet-stream',
      'Content-Length': contents.length,
      'Cache-Control': path.extname(actual) === '.html' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : contents);
    return true;
  } catch { return false; }
}

export function createRequestHandler({ client, distDirectory } = {}) {
  if (!client) throw new Error('A market data client is required.');
  return async function handleRequest(req, res) {
    try {
      if (!allowedRequest(req)) {
        json(res, 403, { error: 'This server accepts local application requests only.', code: 'LOCAL_ONLY' });
        return;
      }
      const { pathname } = new URL(req.url, 'http://127.0.0.1');
      if (pathname === '/api/market/status' && req.method === 'GET') {
        json(res, 200, client.getStatus());
      } else if (pathname === '/api/market/contracts' && req.method === 'GET') {
        json(res, 200, { contracts: await client.getContracts() });
      } else if (pathname === '/api/market/quotes' && req.method === 'POST') {
        const parsed = await jsonBody(req);
        if (parsed.error) { json(res, parsed.status, { error: parsed.error, code: parsed.code }); return; }
        json(res, 200, await client.getQuotes(parsed.body.instrumentIds));
      } else if (['/api/market/status', '/api/market/contracts', '/api/market/quotes'].includes(pathname)) {
        json(res, 405, { error: 'This method is not supported.', code: 'METHOD_NOT_ALLOWED' });
      } else if (pathname.startsWith('/api/') || !(await serveStatic(req, res, pathname, distDirectory))) {
        json(res, 404, { error: 'Route not found. Run the frontend build to serve the local app.', code: 'NOT_FOUND' });
      }
    } catch (error) {
      const safe = publicError(error);
      json(res, safe.status, safe.body);
    }
  };
}

export function createMarketServer(options) {
  const server = createServer(createRequestHandler(options));
  server.requestTimeout = 20_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  return server;
}
