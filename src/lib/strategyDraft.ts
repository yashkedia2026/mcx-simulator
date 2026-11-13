import type { OptionLeg } from '@/types';
import { parseSavedStrategies } from '@/hooks/useSavedStrategies';

export interface StrategyDraft {
  version: 1;
  legs: OptionLeg[];
  underlyingPrice: number;
  riskFreeRate: number;
  followMarket: boolean;
  savedAt: string;
}

/** Parse and validate a draft before it is allowed back into the editor. */
export function parseStrategyDraft(raw: string | null): StrategyDraft | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const underlyingPrice = record.underlyingPrice;
    const riskFreeRate = record.riskFreeRate;
    const savedAt = record.savedAt;
    if (record.version !== 1 || !Array.isArray(record.legs) || record.legs.length === 0 ||
      typeof underlyingPrice !== 'number' || !Number.isFinite(underlyingPrice) || underlyingPrice <= 0 ||
      typeof riskFreeRate !== 'number' || !Number.isFinite(riskFreeRate) || riskFreeRate < 0 || riskFreeRate > 20 ||
      typeof record.followMarket !== 'boolean' || typeof savedAt !== 'string' || !Number.isFinite(Date.parse(savedAt))) {
      return null;
    }

    const parsed = parseSavedStrategies(JSON.stringify([{
      id: 'draft-validation',
      name: 'Draft',
      instrument: (record.legs[0] as { instrument?: { symbol?: unknown } })?.instrument?.symbol ?? 'MCX',
      futuresPrice: underlyingPrice,
      riskFreeRate,
      legs: record.legs,
      savedAt,
    }]))[0];
    if (!parsed) return null;

    return {
      version: 1,
      legs: parsed.legs,
      underlyingPrice,
      riskFreeRate,
      followMarket: record.followMarket,
      savedAt,
    };
  } catch {
    return null;
  }
}

export function createStrategyDraft(
  legs: OptionLeg[],
  underlyingPrice: number,
  riskFreeRate: number,
  followMarket: boolean,
): StrategyDraft | null {
  if (legs.length === 0) return null;
  return {
    version: 1,
    legs: structuredClone(legs),
    underlyingPrice,
    riskFreeRate,
    followMarket,
    savedAt: new Date().toISOString(),
  };
}
