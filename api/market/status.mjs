import { getVercelMarketClient } from '../../server/vercel-market.mjs';
import { methodNotAllowed, sendJson, setCorsHeaders } from '../../server/vercel-api.mjs';

export default function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return methodNotAllowed(res);
  return sendJson(res, 200, getVercelMarketClient().getStatus());
}
