import { getVercelMarketClient } from '../../server/vercel-market.mjs';
import { requireSupabaseUser } from '../../server/vercel-auth.mjs';
import { methodNotAllowed, readQuoteIds, sendJson, sendMarketError, setCorsHeaders } from '../../server/vercel-api.mjs';

export default async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return methodNotAllowed(res);
  const auth = await requireSupabaseUser(req);
  if (auth.error) return sendJson(res, auth.error.status, auth.error.body);
  try {
    return sendJson(res, 200, await getVercelMarketClient().getQuotes(readQuoteIds(req)));
  } catch (error) {
    return sendMarketError(res, error);
  }
}
