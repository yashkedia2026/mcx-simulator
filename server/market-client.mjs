import { setTimeout as delay } from 'node:timers/promises';
import { parseMaster, parseQuotes } from './parsers.mjs';

export const DEFAULT_BASE_URL = 'https://algo.eurekasecurities.net';
export const MAX_QUOTE_IDS = 50;

const MESSAGES = {
  NOT_CONFIGURED: 'Add EUREKA_APP_KEY and EUREKA_SECRET_KEY to the server environment, then restart the server.',
  INVALID_CONFIG: 'The market data base URL must be HTTPS and use the broker root or a supported market-data path.',
  AUTH_FAILED: 'Eureka rejected the login. Confirm the Binary Marketdata API app key and secret are approved and enabled for this endpoint/account.',
  UPSTREAM_TIMEOUT: 'Eureka did not respond in time. Try again shortly.',
  UPSTREAM_UNAVAILABLE: 'Eureka market data is temporarily unavailable.',
  UPSTREAM_RATE_LIMIT: 'Eureka is limiting requests. Wait before refreshing.',
  INVALID_RESPONSE: 'Eureka returned an unsupported market data response.',
  NO_CONTRACTS: 'No supported MCX futures or options were found in the instrument master.',
  INVALID_INSTRUMENTS: 'Select between 1 and 50 valid MCX contract IDs.',
  UNKNOWN_INSTRUMENT: 'One or more selected contracts are absent from the current MCX instrument master.',
  INTERNAL_ERROR: 'The market data request could not be completed.',
};

export class MarketDataError extends Error {
  constructor(code, status = 502) {
    super(MESSAGES[code] ?? MESSAGES.INTERNAL_ERROR);
    this.name = 'MarketDataError';
    this.code = code in MESSAGES ? code : 'INTERNAL_ERROR';
    this.status = status;
  }
}

export function publicError(error) {
  const safe = error instanceof MarketDataError ? error : new MarketDataError('INTERNAL_ERROR', 500);
  return { status: safe.status, body: { error: safe.message, code: safe.code } };
}

function configuredBaseUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error();
    const path = parsed.pathname.replace(/\/$/, '');
    if (path && path !== '/apimarketdata' && path !== '/apibinarymarketdata') throw new Error();
    return { origin: parsed.origin, prefix: path || '/apimarketdata' };
  } catch { throw new MarketDataError('INVALID_CONFIG', 503); }
}

/** Read-only, server-owned Eureka adapter. All mutable state stays in memory. */
export function createMarketClient({
  appKey = '', secretKey = '', baseUrl = DEFAULT_BASE_URL,
  fetchImpl = globalThis.fetch, now = Date.now, sleep = delay,
  timeoutMs = 12_000, masterTtlMs = 6 * 60 * 60 * 1000,
  quoteTtlMs = 2_000, minimumQuoteIntervalMs = 1_000,
} = {}) {
  let endpoint;
  let configError = null;
  try { endpoint = configuredBaseUrl(baseUrl); } catch (error) { configError = error; }
  const configured = Boolean(appKey.trim() && secretKey.trim()) && !configError;
  let token = null;
  let authFlight = null;
  let connected = false;
  let lastError = null;
  let lastErrorCode = null;
  let master = null;
  let masterExpiresAt = 0;
  let masterFlight = null;
  const quoteCache = new Map();
  let quoteQueue = Promise.resolve();
  let lastQuoteRequestAt = -Infinity;

  function requireConfiguration() {
    if (configError) throw configError;
    if (!configured) throw new MarketDataError('NOT_CONFIGURED', 503);
  }

  function rememberError(error) {
    lastError = publicError(error).body.error;
    lastErrorCode = publicError(error).body.code;
    connected = false;
    return error;
  }

  async function request(path, body, accessToken) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${endpoint.origin}${endpoint.prefix}${path}`, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: accessToken } : {}) },
        body: JSON.stringify(body),
      });
      if (response.status === 401 || response.status === 403) throw new MarketDataError('AUTH_FAILED', 502);
      if (response.status === 429) throw new MarketDataError('UPSTREAM_RATE_LIMIT', 503);
      // Eureka also rejects login requests with HTTP 400. This is an auth
      // rejection, not an outage; the response body can contain sensitive data.
      if (path === '/auth/login' && response.status === 400) throw new MarketDataError('AUTH_FAILED', 502);
      if (!response.ok) throw new MarketDataError('UPSTREAM_UNAVAILABLE');
      let payload;
      try { payload = await response.json(); } catch { throw new MarketDataError('INVALID_RESPONSE'); }
      if (!payload || typeof payload !== 'object') throw new MarketDataError('INVALID_RESPONSE');
      if (payload.type !== 'success') {
        // Inspect only to classify, never return upstream descriptions or auth data.
        const authError = path === '/auth/login' || /token|session|unauthori[sz]ed|authenticat/i.test(`${payload.code ?? ''} ${payload.description ?? ''}`);
        throw new MarketDataError(authError ? 'AUTH_FAILED' : 'UPSTREAM_UNAVAILABLE');
      }
      return payload.result;
    } catch (error) {
      if (controller.signal.aborted) throw new MarketDataError('UPSTREAM_TIMEOUT', 504);
      if (error instanceof MarketDataError) throw error;
      throw new MarketDataError('UPSTREAM_UNAVAILABLE');
    } finally { clearTimeout(timeout); }
  }

  async function authenticate() {
    requireConfiguration();
    if (token) return token;
    if (!authFlight) {
      authFlight = (async () => {
        const result = await request('/auth/login', { appKey, secretKey });
        if (typeof result?.token !== 'string' || !result.token.trim()) throw new MarketDataError('AUTH_FAILED');
        token = result.token;
        return token;
      })().finally(() => { authFlight = null; });
    }
    return authFlight;
  }

  async function authorizedRequest(path, body) {
    let accessToken = await authenticate();
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await request(path, body, accessToken);
        connected = true;
        lastError = null;
        lastErrorCode = null;
        return result;
      } catch (error) {
        if (error instanceof MarketDataError && error.code === 'AUTH_FAILED') {
          if (token === accessToken) token = null;
          if (attempt === 0) {
            accessToken = await authenticate();
            continue;
          }
        }
        throw error;
      }
    }
  }

  async function getContracts() {
    requireConfiguration();
    if (master && now() < masterExpiresAt) return master;
    if (!masterFlight) {
      masterFlight = (async () => {
        try {
          const rawMaster = await authorizedRequest('/instruments/master', { exchangeSegmentList: ['MCXFO'] });
          const contracts = parseMaster(rawMaster);
          if (!contracts.length) throw new MarketDataError('NO_CONTRACTS');
          master = contracts;
          masterExpiresAt = now() + masterTtlMs;
          const ids = new Set(contracts.map((contract) => contract.id));
          for (const id of quoteCache.keys()) if (!ids.has(id)) quoteCache.delete(id);
          return master;
        } catch (error) { throw rememberError(error); }
      })().finally(() => { masterFlight = null; });
    }
    return masterFlight;
  }

  async function loadQuotes(ids) {
    const contracts = await getContracts();
    const knownIds = new Set(contracts.map((contract) => contract.id));
    if (ids.some((id) => !knownIds.has(id))) throw new MarketDataError('UNKNOWN_INSTRUMENT', 400);
    const missing = ids.filter((id) => !quoteCache.has(id) || quoteCache.get(id).expiresAt <= now());
    if (missing.length) {
      const pause = minimumQuoteIntervalMs - (now() - lastQuoteRequestAt);
      if (pause > 0) await sleep(pause);
      lastQuoteRequestAt = now();
      const result = await authorizedRequest('/instruments/quotes', {
        instruments: missing.map((id) => ({ exchangeSegment: 51, exchangeInstrumentID: id })),
        xtsMessageCode: 1502, publishFormat: 'JSON',
      });
      if (!Array.isArray(result?.listQuotes)) throw new MarketDataError('INVALID_RESPONSE');
      const receivedAt = new Date(now()).toISOString();
      const quotes = parseQuotes(result.listQuotes, receivedAt);
      const requested = new Set(missing);
      for (const quote of quotes) {
        if (requested.has(quote.instrumentId)) quoteCache.set(quote.instrumentId, { quote, expiresAt: now() + quoteTtlMs });
      }
      // Never reuse a stale value when the broker omits an instrument.
      const returned = new Set(quotes.map((quote) => quote.instrumentId));
      for (const id of missing) if (!returned.has(id)) quoteCache.delete(id);
    }
    return { quotes: ids.map((id) => quoteCache.get(id)?.quote).filter(Boolean), fetchedAt: new Date(now()).toISOString() };
  }

  async function getQuotes(instrumentIds) {
    requireConfiguration();
    if (!Array.isArray(instrumentIds) || instrumentIds.length === 0 || instrumentIds.length > MAX_QUOTE_IDS ||
        instrumentIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      throw new MarketDataError('INVALID_INSTRUMENTS', 400);
    }
    const ids = [...new Set(instrumentIds)];
    // A single queue prevents overlapping polls, coalesces identical/overlapping
    // requests through the cache, and keeps broker quote traffic <= one / second.
    const job = quoteQueue.then(() => loadQuotes(ids));
    quoteQueue = job.catch(() => {});
    try { return await job; } catch (error) {
      if (!(error instanceof MarketDataError) || error.status >= 500) rememberError(error);
      throw error;
    }
  }

  return {
    getContracts, getQuotes,
    getStatus: () => ({
      configured, connected,
      error: configError ? publicError(configError).body.error : lastError,
      code: configError ? publicError(configError).body.code : lastErrorCode,
    }),
  };
}
