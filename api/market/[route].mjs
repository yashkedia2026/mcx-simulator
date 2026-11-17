import { createMarketHandler } from '../../server/vercel-routes.mjs';

// Serves /api/market/status, /api/market/contracts and /api/market/quotes.
// Keep these in one function: see server/vercel-routes.mjs.
export default createMarketHandler();
