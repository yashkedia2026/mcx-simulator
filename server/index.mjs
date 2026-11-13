import { fileURLToPath } from 'node:url';
import { createMarketClient, DEFAULT_BASE_URL } from './market-client.mjs';
import { createMarketServer } from './http.mjs';

const port = Number(process.env.MARKET_DATA_PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('MARKET_DATA_PORT must be an integer between 1 and 65535.');
  process.exitCode = 1;
} else {
  const client = createMarketClient({
    baseUrl: process.env.EUREKA_BASE_URL ?? DEFAULT_BASE_URL,
    appKey: process.env.EUREKA_APP_KEY ?? '',
    secretKey: process.env.EUREKA_SECRET_KEY ?? '',
  });
  const server = createMarketServer({ client, distDirectory: fileURLToPath(new URL('../dist/', import.meta.url)) });
  // This is a local application adapter, never a public credentialed proxy.
  server.listen(port, '127.0.0.1', () => {
    console.log(`Local market data server: http://127.0.0.1:${port}`);
    if (!client.getStatus().configured) console.log('Market data credentials are not configured; manual mode remains available.');
  });
  server.on('error', () => {
    console.error('The local market data server could not start. Check the port and local permissions.');
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    server.close(() => { process.exitCode = 0; });
    server.closeIdleConnections();
  });
}
