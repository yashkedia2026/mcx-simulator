import { createMarketClient, DEFAULT_BASE_URL } from './market-client.mjs';

// Vercel keeps warm function modules between requests, so the broker session,
// instrument master and quote cache can be reused without exposing them to the
// browser. All market routes run in one function (api/market/[route].mjs) so
// they share this client; a second function would open a second broker session.
let client;

export function getVercelMarketClient() {
  if (!client) {
    client = createMarketClient({
      baseUrl: process.env.EUREKA_BASE_URL ?? DEFAULT_BASE_URL,
      appKey: process.env.EUREKA_APP_KEY ?? '',
      secretKey: process.env.EUREKA_SECRET_KEY ?? '',
    });
  }
  return client;
}
