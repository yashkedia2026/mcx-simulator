import { useEffect, useState } from 'react';
import type { OptionLeg } from '@/types';
import { supabase } from '@/lib/supabase';

export interface SavedStrategy {
  id: string;
  name: string;
  instrument: string;
  futuresPrice: number;
  riskFreeRate?: number;
  legs: OptionLeg[];
  savedAt: string;
}

const STORAGE_KEY = 'mcx-simulator-strategies';
const MAX_STRATEGIES = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isLeg(value: unknown): value is OptionLeg {
  if (!isRecord(value) || !isRecord(value.instrument)) return false;
  const instrument = value.instrument;
  const contract = value.marketContract;
  if (contract !== undefined && (
    !isRecord(contract) ||
    !finite(contract.instrumentId) || !Number.isInteger(contract.instrumentId) || contract.instrumentId <= 0 ||
    !finite(contract.underlyingInstrumentId) || !Number.isInteger(contract.underlyingInstrumentId) || contract.underlyingInstrumentId <= 0 ||
    typeof contract.expiry !== 'string' || !Number.isFinite(Date.parse(contract.expiry)) ||
    typeof contract.symbol !== 'string' || typeof contract.name !== 'string' ||
    (contract.brokerLotSize !== undefined && (!finite(contract.brokerLotSize) || contract.brokerLotSize <= 0)) ||
    (contract.priceMultiplier !== undefined && (!finite(contract.priceMultiplier) || contract.priceMultiplier <= 0))
  )) return false;

  return typeof value.id === 'string' && value.id.length > 0 &&
    (value.positionType === 'BUY' || value.positionType === 'SELL') &&
    (value.optionType === 'CE' || value.optionType === 'PE') &&
    finite(value.strikePrice) && value.strikePrice > 0 &&
    finite(value.premium) && value.premium >= 0 &&
    finite(value.iv) && value.iv >= 0 &&
    finite(value.daysToExpiry) && value.daysToExpiry >= 0 &&
    finite(value.lots) && Number.isInteger(value.lots) && value.lots >= 1 &&
    typeof instrument.symbol === 'string' && instrument.symbol.length > 0 &&
    typeof instrument.name === 'string' && typeof instrument.unit === 'string' &&
    typeof instrument.priceUnit === 'string' &&
    finite(instrument.lotSize) && instrument.lotSize > 0 &&
    finite(instrument.tickSize) && instrument.tickSize > 0;
}

/** Validate untrusted storage without stripping optional contract metadata. */
export function parseSavedStrategies(raw: string | null): SavedStrategy[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const ids = new Set<string>();
    return value.filter((entry): entry is SavedStrategy => {
      if (!isRecord(entry) || typeof entry.id !== 'string' || ids.has(entry.id) ||
        typeof entry.name !== 'string' || typeof entry.instrument !== 'string' ||
        !finite(entry.futuresPrice) || entry.futuresPrice <= 0 ||
        (entry.riskFreeRate !== undefined && !finite(entry.riskFreeRate)) ||
        typeof entry.savedAt !== 'string' || !Number.isFinite(Date.parse(entry.savedAt)) ||
        !Array.isArray(entry.legs) || !entry.legs.every(isLeg) ||
        new Set(entry.legs.map(leg => leg.id)).size !== entry.legs.length) return false;
      ids.add(entry.id);
      return true;
    }).slice(0, MAX_STRATEGIES);
  } catch {
    return [];
  }
}

function readLocalStrategies(): SavedStrategy[] {
  try {
    return parseSavedStrategies(localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

function writeLocalStrategies(strategies: SavedStrategy[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(strategies));
  } catch {
    // Storage may be unavailable; retain strategies for this session.
  }
}

function mapCloudRow(row: Record<string, unknown>): SavedStrategy | null {
  const candidate = {
    id: row.id,
    name: row.name,
    instrument: row.instrument ?? '',
    futuresPrice: Number(row.futures_price ?? 0),
    riskFreeRate: row.risk_free_rate === null || row.risk_free_rate === undefined
      ? undefined : Number(row.risk_free_rate),
    legs: row.legs,
    savedAt: row.created_at,
  };
  return parseSavedStrategies(JSON.stringify([candidate]))[0] ?? null;
}

export function useSavedStrategies(userId: string | null = null) {
  const cloudEnabled = Boolean(userId && supabase);
  const [strategies, setStrategies] = useState<SavedStrategy[]>(readLocalStrategies);
  const [loading, setLoading] = useState(cloudEnabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const client = supabase;

    if (!cloudEnabled || !userId || !client) {
      return () => { cancelled = true; };
    }

    client
      .from('strategies')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data, error: queryError }) => {
        if (cancelled) return;
        setLoading(false);
        if (queryError) {
          setError(queryError.message);
          return;
        }
        setError(null);
        setStrategies((data ?? [])
          .filter(isRecord)
          .map(mapCloudRow)
          .filter((entry): entry is SavedStrategy => entry !== null)
          .slice(0, MAX_STRATEGIES));
      });

    return () => { cancelled = true; };
  }, [cloudEnabled, userId]);

  useEffect(() => {
    if (!cloudEnabled) writeLocalStrategies(strategies);
  }, [cloudEnabled, strategies]);

  async function saveStrategy(name: string, futuresPrice: number, legs: OptionLeg[], riskFreeRate = 6.5): Promise<SavedStrategy | null> {
    if (strategies.length >= MAX_STRATEGIES || !finite(futuresPrice) || futuresPrice <= 0 ||
      !finite(riskFreeRate) || !legs.every(isLeg)) return null;

    const client = supabase;
    if (cloudEnabled && userId && client) {
      const { data, error: insertError } = await client
        .from('strategies')
        .insert({
          user_id: userId,
          name: name.trim() || `Strategy ${strategies.length + 1}`,
          instrument: legs[0]?.instrument.symbol ?? 'GOLD',
          futures_price: futuresPrice,
          risk_free_rate: riskFreeRate,
          legs,
        })
        .select()
        .single();

      if (insertError || !data || !isRecord(data)) {
        setError(insertError?.message ?? 'Unable to save strategy.');
        return null;
      }
      const saved = mapCloudRow(data);
      if (!saved) {
        setError('The saved strategy returned an invalid shape.');
        return null;
      }
      setStrategies(previous => [saved, ...previous].slice(0, MAX_STRATEGIES));
      return saved;
    }

    const entry: SavedStrategy = {
      id: crypto.randomUUID(),
      name: name.trim() || `Strategy ${strategies.length + 1}`,
      instrument: legs[0]?.instrument.symbol ?? 'GOLD',
      futuresPrice,
      riskFreeRate,
      legs: structuredClone(legs),
      savedAt: new Date().toISOString(),
    };
    setStrategies(previous => previous.length < MAX_STRATEGIES ? [entry, ...previous] : previous);
    return entry;
  }

  async function updateStrategy(id: string, futuresPrice: number, legs: OptionLeg[], riskFreeRate = 6.5): Promise<boolean> {
    if (!id || !finite(futuresPrice) || futuresPrice <= 0 || !finite(riskFreeRate) || !legs.every(isLeg)) return false;
    const existing = strategies.find(strategy => strategy.id === id);
    if (!existing) return false;
    const client = supabase;
    const payload = {
      instrument: legs[0]?.instrument.symbol ?? existing.instrument,
      futures_price: futuresPrice,
      risk_free_rate: riskFreeRate,
      legs,
    };

    if (cloudEnabled && userId && client) {
      const { error: updateError } = await client
        .from('strategies')
        .update(payload)
        .eq('id', id)
        .eq('user_id', userId);
      if (updateError) {
        setError(updateError.message);
        return false;
      }
    }

    setStrategies(previous => previous.map(strategy => strategy.id === id ? {
      ...strategy,
      instrument: payload.instrument,
      futuresPrice,
      riskFreeRate,
      legs: structuredClone(legs),
    } : strategy));
    setError(null);
    return true;
  }

  async function deleteStrategy(id: string): Promise<boolean> {
    const client = supabase;
    if (cloudEnabled && userId && client) {
      const { error: deleteError } = await client.from('strategies').delete().eq('id', id).eq('user_id', userId);
      if (deleteError) {
        setError(deleteError.message);
        return false;
      }
    }
    setStrategies(previous => previous.filter(strategy => strategy.id !== id));
    return true;
  }

  async function renameStrategy(id: string, name: string): Promise<boolean> {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const client = supabase;
    if (cloudEnabled && userId && client) {
      const { error: renameError } = await client.from('strategies').update({ name: trimmed }).eq('id', id).eq('user_id', userId);
      if (renameError) {
        setError(renameError.message);
        return false;
      }
    }
    setStrategies(previous => previous.map(strategy => strategy.id === id ? { ...strategy, name: trimmed } : strategy));
    return true;
  }

  return {
    strategies,
    loading,
    error,
    saveStrategy,
    updateStrategy,
    deleteStrategy,
    renameStrategy,
    atLimit: strategies.length >= MAX_STRATEGIES,
  };
}
