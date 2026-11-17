import { getVercelMarketClient } from './vercel-market.mjs';
import { requireSupabaseUser } from './vercel-auth.mjs';
import { methodNotAllowed, readQuoteIds, sendJson, sendMarketError, setCorsHeaders } from './vercel-api.mjs';

// Every market route is served by one Vercel function so they share one module
// instance, and with it one broker session, instrument master and quote cache.
// Eureka allows a single session per app key: when each route was its own
// function, each logged in separately and invalidated the others' tokens.
const ROUTES = {
  status: { method: 'GET', authenticated: false, run: (client) => client.getStatus() },
  contracts: { method: 'GET', authenticated: true, run: async (client) => ({ contracts: await client.getContracts() }) },
  quotes: { method: 'POST', authenticated: true, run: (client, req) => client.getQuotes(readQuoteIds(req)) },
};

function routeName(req) {
  let segment;
  try {
    segment = new URL(req.url ?? '', 'http://localhost').pathname.replace(/\/+$/, '').split('/').pop();
  } catch { segment = undefined; }
  if (segment && Object.hasOwn(ROUTES, segment)) return segment;
  // Vercel also exposes the dynamic path segment as a query parameter.
  const param = req.query?.route;
  return typeof param === 'string' && Object.hasOwn(ROUTES, param) ? param : null;
}

export function createMarketHandler({ getClient = getVercelMarketClient, authenticate = requireSupabaseUser } = {}) {
  return async function handler(req, res) {
    setCorsHeaders(res);
    const name = routeName(req);
    if (!name) return sendJson(res, 404, { error: 'Route not found.', code: 'NOT_FOUND' });
    const route = ROUTES[name];
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== route.method) return methodNotAllowed(res);
    if (route.authenticated) {
      const auth = await authenticate(req);
      if (auth.error) return sendJson(res, auth.error.status, auth.error.body);
    }
    try {
      return sendJson(res, 200, await route.run(getClient(), req));
    } catch (error) {
      return sendMarketError(res, error);
    }
  };
}
