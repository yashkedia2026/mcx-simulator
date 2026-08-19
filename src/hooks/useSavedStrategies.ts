import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { OptionLeg } from '@/types';

export interface SavedStrategy {
  id: string;
  name: string;
  instrument: string;
  futuresPrice: number;
  legs: OptionLeg[];
  savedAt: string;
}

export function useSavedStrategies(userId: string | null) {
  const [strategies, setStrategies] = useState<SavedStrategy[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // Fetch all strategies for this user
  useEffect(() => {
    if (!userId) { setStrategies([]); return; }

    setLoading(true);
    supabase
      .from('strategies')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        setLoading(false);
        if (error) { setError(error.message); return; }
        setStrategies((data ?? []).map(row => ({
          id:           row.id,
          name:         row.name,
          instrument:   row.instrument ?? '',
          futuresPrice: row.futures_price ?? 0,
          legs:         row.legs ?? [],
          savedAt:      row.created_at,
        })));
      });
  }, [userId]);

  async function saveStrategy(name: string, futuresPrice: number, legs: OptionLeg[]): Promise<boolean> {
    if (!userId) return false;

    const { data, error } = await supabase
      .from('strategies')
      .insert({
        user_id:       userId,
        name:          name.trim() || `Strategy ${strategies.length + 1}`,
        instrument:    legs[0]?.instrument.symbol ?? 'GOLD',
        futures_price: futuresPrice,
        legs,
      })
      .select()
      .single();

    if (error) { setError(error.message); return false; }

    const saved: SavedStrategy = {
      id:           data.id,
      name:         data.name,
      instrument:   data.instrument ?? '',
      futuresPrice: data.futures_price ?? 0,
      legs:         data.legs ?? [],
      savedAt:      data.created_at,
    };
    setStrategies(prev => [saved, ...prev]);
    return true;
  }

  async function updateStrategy(id: string, name: string, futuresPrice: number, legs: OptionLeg[]): Promise<boolean> {
    const { data, error } = await supabase
      .from('strategies')
      .update({
        name:          name.trim() || 'Untitled',
        instrument:    legs[0]?.instrument.symbol ?? 'GOLD',
        futures_price: futuresPrice,
        legs,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) { setError(error.message); return false; }

    const updated: SavedStrategy = {
      id:           data.id,
      name:         data.name,
      instrument:   data.instrument ?? '',
      futuresPrice: data.futures_price ?? 0,
      legs:         data.legs ?? [],
      savedAt:      data.created_at,
    };
    setStrategies(prev => prev.map(s => s.id === id ? updated : s));
    return true;
  }

  async function deleteStrategy(id: string): Promise<boolean> {
    const { error } = await supabase.from('strategies').delete().eq('id', id);
    if (error) { setError(error.message); return false; }
    setStrategies(prev => prev.filter(s => s.id !== id));
    return true;
  }

  async function renameStrategy(id: string, name: string): Promise<boolean> {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const { error } = await supabase.from('strategies').update({ name: trimmed }).eq('id', id);
    if (error) { setError(error.message); return false; }
    setStrategies(prev => prev.map(s => s.id === id ? { ...s, name: trimmed } : s));
    return true;
  }

  return { strategies, loading, error, saveStrategy, updateStrategy, deleteStrategy, renameStrategy };
}
