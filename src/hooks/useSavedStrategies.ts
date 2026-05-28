import { useState, useEffect } from 'react';
import type { OptionLeg } from '@/types';

export interface SavedStrategy {
  id: string;
  name: string;
  instrument: string;
  futuresPrice: number;
  legs: OptionLeg[];
  savedAt: string; // ISO date
}

const STORAGE_KEY = 'mcx-simulator-strategies';
const MAX_STRATEGIES = 20;

export function useSavedStrategies() {
  const [strategies, setStrategies] = useState<SavedStrategy[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setStrategies(JSON.parse(raw));
    } catch { /* ignore corrupt data */ }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(strategies));
  }, [strategies]);

  function saveStrategy(name: string, futuresPrice: number, legs: OptionLeg[]): boolean {
    if (strategies.length >= MAX_STRATEGIES) return false;
    const entry: SavedStrategy = {
      id: crypto.randomUUID(),
      name: name.trim() || `Strategy ${strategies.length + 1}`,
      instrument: legs[0]?.instrument.symbol ?? 'GOLD',
      futuresPrice,
      legs,
      savedAt: new Date().toISOString(),
    };
    setStrategies(prev => [entry, ...prev]);
    return true;
  }

  function deleteStrategy(id: string) {
    setStrategies(prev => prev.filter(s => s.id !== id));
  }

  function renameStrategy(id: string, name: string) {
    setStrategies(prev => prev.map(s => s.id === id ? { ...s, name } : s));
  }

  return { strategies, saveStrategy, deleteStrategy, renameStrategy, atLimit: strategies.length >= MAX_STRATEGIES };
}
