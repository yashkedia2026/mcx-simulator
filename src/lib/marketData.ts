import type { OptionLeg, PositionType } from '@/types';
import type { MarketContract, MarketQuote } from '@/types/market';
import { MCX_INSTRUMENTS } from '@/data/instruments';
import { calculateIV } from './impliedVolatility';

export const QUOTE_MAX_AGE_MS = 15_000;

// XTS naive timestamps are interpreted in the exchange's IST timezone.
// Date-only contracts use 23:30 IST as an explicit end-of-day approximation.
export function expiryTime(expiry: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return Date.parse(expiry + 'T23:30:00+05:30');
  return Date.parse(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(expiry) ? expiry : expiry.replace(' ', 'T') + '+05:30');
}

export function daysRemaining(expiry: string, now = Date.now()): number {
  return Math.max(0, (expiryTime(expiry) - now) / 86_400_000);
}

export function isFreshQuote(quote: MarketQuote | undefined, now = Date.now()): quote is MarketQuote {
  if (!quote) return false;
  const age = now - Date.parse(quote.receivedAt);
  return Number.isFinite(age) && age >= -1000 && age <= QUOTE_MAX_AGE_MS;
}

export function quoteMark(quote: MarketQuote | undefined): number | null {
  if (!quote) return null;
  if (quote.bid != null && quote.ask != null && Number.isFinite(quote.bid) && Number.isFinite(quote.ask) && quote.bid > 0 && quote.ask >= quote.bid) {
    return (quote.bid + quote.ask) / 2;
  }
  return quote.lastPrice != null && Number.isFinite(quote.lastPrice) && quote.lastPrice > 0 ? quote.lastPrice : null;
}

export function matchesMarketContract(leg: OptionLeg, contract: MarketContract | undefined): boolean {
  const identity = leg.marketContract;
  return !!identity && !!contract && identity.instrumentId === contract.id &&
    identity.symbol === contract.symbol && leg.instrument.symbol === contract.symbol &&
    leg.optionType === contract.kind && leg.strikePrice === contract.strike &&
    expiryTime(identity.expiry) === expiryTime(contract.expiry) &&
    identity.underlyingInstrumentId === contract.underlyingId &&
    leg.instrument.lotSize === contract.lotSize * contract.priceMultiplier;
}

export function createMarketLeg(option: MarketContract, future: MarketContract, quote: MarketQuote,
  futureQuote: MarketQuote, positionType: PositionType, rate: number, now = Date.now(), lots = 1,
  entryPrice?: number): OptionLeg {
  if (option.kind === 'FUT' || future.kind !== 'FUT' || option.symbol !== future.symbol ||
      option.underlyingId !== future.id || !option.strike || !Number.isFinite(daysRemaining(option.expiry, now)) ||
      daysRemaining(option.expiry, now) <= 0) {
    throw new Error('Choose an unexpired option linked to its underlying future.');
  }
  if (quote.instrumentId !== option.id || futureQuote.instrumentId !== future.id ||
      !isFreshQuote(quote, now) || !isFreshQuote(futureQuote, now)) {
    throw new Error('Wait for fresh quotes for both the option and its underlying future.');
  }
  const futurePrice = quoteMark(futureQuote);
  const entry = entryPrice ?? (positionType === 'BUY' ? quote.ask : quote.bid);
  if (!futurePrice || entry == null || !Number.isFinite(entry) || entry <= 0 ||
      (quote.bid != null && quote.ask != null && quote.bid > quote.ask)) {
    throw new Error('A valid bid/ask or manually entered price is required to snapshot this entry.');
  }
  const iv = calculateIV(quoteMark(quote) ?? entry, futurePrice, option.strike,
    daysRemaining(option.expiry, now) / 365, rate / 100, option.kind);
  if (iv === null || !Number.isFinite(iv) || iv < 0) {
    throw new Error('These quotes do not produce a valid implied volatility. Try another contract or refresh.');
  }
  if (!Number.isInteger(lots) || lots < 1 || lots > 1000) throw new Error('Lots must be a whole number between 1 and 1,000.');
  const monetaryLot = option.lotSize * option.priceMultiplier;
  if (!Number.isFinite(monetaryLot) || monetaryLot <= 0) throw new Error('Contract lot conversion is unavailable.');
  const known = MCX_INSTRUMENTS.find(i => i.symbol === option.symbol);
  return {
    id: crypto.randomUUID(),
    instrument: { symbol: option.symbol, name: known?.name ?? option.symbol, lotSize: monetaryLot,
      tickSize: option.tickSize, unit: 'price units', priceUnit: known?.priceUnit ?? '₹' },
    positionType, optionType: option.kind, strikePrice: option.strike, premium: entry, lots,
    iv: iv * 100, daysToExpiry: daysRemaining(option.expiry, now),
    marketContract: { instrumentId: option.id, underlyingInstrumentId: future.id, expiry: option.expiry,
      symbol: option.symbol, name: option.name, brokerLotSize: option.lotSize, priceMultiplier: option.priceMultiplier },
  };
}

export function marketPnL(legs: OptionLeg[], quotes: Record<number, MarketQuote>, now = Date.now()): number | null {
  if (!legs.length) return null;
  let total = 0;
  for (const leg of legs) {
    const quote = leg.marketContract && quotes[leg.marketContract.instrumentId];
    if (!isFreshQuote(quote, now) || quote.instrumentId !== leg.marketContract?.instrumentId) return null;
    const mark = quoteMark(quote);
    if (mark === null) return null;
    total += (mark - leg.premium) * (leg.positionType === 'BUY' ? 1 : -1) * leg.lots * leg.instrument.lotSize;
  }
  return Number.isFinite(total) ? total : null;
}

/** Accept a complete model snapshot; never mix new quotes with old leg IVs. */
export function refreshMarketModel(legs: OptionLeg[], quotes: Record<number, MarketQuote>,
  rate: number, now = Date.now()): { legs: OptionLeg[]; underlyingPrice: number } | null {
  const contract = legs[0]?.marketContract;
  if (!contract || !Number.isFinite(rate)) return null;
  const future = quotes[contract.underlyingInstrumentId];
  const underlyingPrice = quoteMark(future);
  if (!isFreshQuote(future, now) || future.instrumentId !== contract.underlyingInstrumentId || !underlyingPrice) return null;
  const updated: OptionLeg[] = [];
  for (const leg of legs) {
    const identity = leg.marketContract;
    if (!identity || identity.underlyingInstrumentId !== contract.underlyingInstrumentId ||
      expiryTime(identity.expiry) !== expiryTime(contract.expiry) || identity.symbol !== contract.symbol) return null;
    const quote = quotes[identity.instrumentId];
    const mark = quoteMark(quote);
    if (!isFreshQuote(quote, now) || quote.instrumentId !== identity.instrumentId || mark === null) return null;
    const daysToExpiry = daysRemaining(identity.expiry, now);
    if (!Number.isFinite(daysToExpiry) || daysToExpiry <= 0) return null;
    const iv = calculateIV(mark, underlyingPrice, leg.strikePrice, daysToExpiry / 365, rate / 100, leg.optionType);
    if (iv === null || !Number.isFinite(iv)) return null;
    updated.push({ ...leg, daysToExpiry, iv: iv * 100 });
  }
  return { legs: updated, underlyingPrice };
}
