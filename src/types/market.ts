export interface MarketContract {
  id: number;
  symbol: string;
  name: string;
  kind: 'FUT' | 'CE' | 'PE';
  expiry: string;
  strike: number | null;
  lotSize: number;
  tickSize: number;
  underlyingId: number | null;
  priceMultiplier: number;
}

export interface MarketQuote {
  instrumentId: number;
  lastPrice: number | null;
  bid: number | null;
  ask: number | null;
  lastTradedAt: string | null;
  receivedAt: string;
}

export interface MarketStatus {
  configured: boolean;
  connected: boolean;
  error?: string | null;
}
