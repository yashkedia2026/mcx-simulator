import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { MarketContract, MarketQuote, MarketStatus } from '@/types/market';

interface Options {
  active?: boolean;
}

async function request<T>(path: string, signal?: AbortSignal, body?: unknown): Promise<T> {
  const response = await fetch('/api/market/' + path, {
    signal, method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Market data server is unavailable. Start the app with npm run dev.');
  }
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Market data request failed.');
  return data as T;
}

export function useMarketData(instrumentIds: number[], onQuotesReceived?: (quotes: Record<number, MarketQuote>, now: number, contracts: MarketContract[]) => void, options: Options = {}) {
  const [status, setStatus] = useState<MarketStatus | null>(null);
  const [contracts, setContracts] = useState<MarketContract[]>([]);
  const [quotes, setQuotes] = useState<Record<number, MarketQuote>>({});
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now);
  const connectionAttempted = useRef(false);
  const knownIds = new Set(contracts.map(contract => contract.id));
  const idsKey = [...new Set(instrumentIds)].filter(id => knownIds.has(id)).sort((a, b) => a - b).join(',');
  const acceptQuotes = useEffectEvent((received: Record<number, MarketQuote>, at: number) => onQuotesReceived?.(received, at, contracts));

  useEffect(() => {
    if (options.active === false) return;
    const controller = new AbortController();
    request<MarketStatus>('status', controller.signal).then(setStatus).catch(err => {
      if (!controller.signal.aborted) setError(err.message);
    });
    return () => controller.abort();
  }, [options.active]);

  const connect = useCallback(async () => {
    connectionAttempted.current = true;
    setLoading(true);
    setError('');
    try {
      const data = await request<{ contracts: MarketContract[] }>('contracts');
      setContracts(data.contracts);
      setStatus({ configured: true, connected: true });
      setEnabled(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to connect to Eureka.');
      request<MarketStatus>('status').then(setStatus).catch(() => {});
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (options.active !== false && status?.configured && !connectionAttempted.current) void connect();
  }, [options.active, status?.configured, connect]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (options.active === false || !enabled || !idsKey) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const ids = idsKey.split(',').map(Number);
        const batches: number[][] = [];
        for (let index = 0; index < ids.length; index += 50) batches.push(ids.slice(index, index + 50));
        const responses = await Promise.all(batches.map(batch => request<{ quotes: MarketQuote[] }>('quotes', controller.signal,
          { instrumentIds: batch })));
        if (controller.signal.aborted) return;
        const quotes = responses.flatMap(response => response.quotes);
        const received = Object.fromEntries(quotes.map(q => [q.instrumentId, q]));
        acceptQuotes(received, Date.now());
        setQuotes(previous => {
          const next = { ...previous };
          for (const id of ids) delete next[id];
          return { ...next, ...received };
        });
        setStatus({ configured: true, connected: true });
        setError(quotes.length ? '' : 'No quotes returned. Check MCX access and contract availability.');
        setNow(Date.now());
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Quote refresh failed.');
          setStatus(previous => previous ? { ...previous, connected: false } : previous);
        }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 5000);
      }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [enabled, idsKey, options.active]);

  return { status, contracts, quotes, enabled, setEnabled, loading, error, now, connect };
}
