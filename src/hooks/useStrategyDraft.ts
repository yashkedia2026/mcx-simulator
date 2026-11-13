import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { createStrategyDraft, parseStrategyDraft, type StrategyDraft } from '@/lib/strategyDraft';
import type { OptionLeg } from '@/types';

const DRAFT_KEY_PREFIX = 'mcx-simulator-draft:';
const AUTOSAVE_DELAY_MS = 900;

export type DraftStatus = 'idle' | 'draft-found' | 'saving' | 'saved';

interface Options {
  userId: string | null;
  legs: OptionLeg[];
  underlyingPrice: number;
  riskFreeRate: number;
  followMarket: boolean;
  onRestore: (draft: StrategyDraft) => void;
}

function storageKey(userId: string | null) {
  return `${DRAFT_KEY_PREFIX}${userId ?? 'local'}`;
}

function readDraft(key: string): StrategyDraft | null {
  try {
    return parseStrategyDraft(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeDraft(key: string, draft: StrategyDraft) {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // A full or disabled browser store should not interrupt strategy editing.
  }
}

function removeDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore unavailable browser storage; the cloud copy can still be removed.
  }
}

function parseCloudDraft(row: unknown): StrategyDraft | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const value = row as Record<string, unknown>;
  return parseStrategyDraft(JSON.stringify({
    version: 1,
    legs: value.legs,
    underlyingPrice: Number(value.underlying_price),
    riskFreeRate: Number(value.risk_free_rate),
    followMarket: value.follow_market,
    savedAt: value.updated_at,
  }));
}

function newestDraft(first: StrategyDraft | null, second: StrategyDraft | null) {
  if (!first) return second;
  if (!second) return first;
  return Date.parse(second.savedAt) > Date.parse(first.savedAt) ? second : first;
}

export function useStrategyDraft({ userId, legs, underlyingPrice, riskFreeRate, followMarket, onRestore }: Options) {
  const key = storageKey(userId);
  const client = userId ? supabase : null;
  const initialDraft = useState<StrategyDraft | null>(() => readDraft(key))[0];
  const [pendingDraft, setPendingDraft] = useState<StrategyDraft | null>(initialDraft);
  const [draftDecision, setDraftDecision] = useState<'pending' | 'ready'>(initialDraft ? 'pending' : 'ready');
  const [cloudHydrated, setCloudHydrated] = useState(!client);
  const [status, setStatus] = useState<DraftStatus>(initialDraft ? 'draft-found' : 'idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(initialDraft?.savedAt ?? null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decisionMade = useRef(false);
  const previousKey = useRef(key);
  const resettingKey = useRef(false);

  // App stays mounted while AuthGuard swaps login and workspace views. Reset
  // the draft state when a different account (or the signed-out local key)
  // becomes active so one user's draft can never appear for another user.
  useEffect(() => {
    if (previousKey.current === key) return;
    previousKey.current = key;
    resettingKey.current = true;
    decisionMade.current = false;
    const timer = setTimeout(() => {
      const nextDraft = readDraft(key);
      setPendingDraft(nextDraft);
      setDraftDecision(nextDraft ? 'pending' : 'ready');
      setCloudHydrated(!client);
      setStatus(nextDraft ? 'draft-found' : 'idle');
      setLastSavedAt(nextDraft?.savedAt ?? null);
      setSyncError(null);
      resettingKey.current = false;
    }, 0);
    return () => clearTimeout(timer);
  }, [client, key]);

  // A cloud draft is a single upserted row. Local storage remains the fast,
  // offline-first copy and is also used when the cloud draft table is absent.
  useEffect(() => {
    if (!client || !userId) return;
    let cancelled = false;
    client
      .from('strategy_drafts')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setSyncError(error.message);
        const candidate = newestDraft(readDraft(key), parseCloudDraft(data));
        if (!decisionMade.current) {
          if (candidate) {
            setPendingDraft(candidate);
            setDraftDecision('pending');
            setStatus('draft-found');
            setLastSavedAt(candidate.savedAt);
            writeDraft(key, candidate);
          } else {
            setDraftDecision('ready');
          }
        }
        setCloudHydrated(true);
      });
    return () => { cancelled = true; };
  }, [client, key, userId]);

  // If a user edits while a cloud lookup is still in flight, keep their live
  // work as the source of truth instead of replacing it with an older draft.
  useEffect(() => {
    if (!cloudHydrated && draftDecision === 'ready' && legs.length > 0) decisionMade.current = true;
  }, [cloudHydrated, draftDecision, legs.length]);

  useEffect(() => {
    if (resettingKey.current || !cloudHydrated || draftDecision !== 'ready') return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);

    autosaveTimer.current = setTimeout(() => {
      autosaveTimer.current = null;
      if (legs.length === 0) {
        removeDraft(key);
        setLastSavedAt(null);
        setStatus('idle');
        if (client && userId) {
          client.from('strategy_drafts').delete().eq('user_id', userId).then(({ error }) => {
            if (error) setSyncError(error.message);
          });
        }
        return;
      }

      const draft = createStrategyDraft(legs, underlyingPrice, riskFreeRate, followMarket);
      if (!draft) return;
      setStatus('saving');
      writeDraft(key, draft);
      setLastSavedAt(draft.savedAt);
      setStatus('saved');

      if (client && userId) {
        client
          .from('strategy_drafts')
          .upsert({
            user_id: userId,
            underlying_price: draft.underlyingPrice,
            risk_free_rate: draft.riskFreeRate,
            follow_market: draft.followMarket,
            legs: draft.legs,
            updated_at: draft.savedAt,
          }, { onConflict: 'user_id' })
          .then(({ error }) => {
            if (error) setSyncError(error.message);
            else setSyncError(null);
          });
      }
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
    };
  }, [client, cloudHydrated, draftDecision, followMarket, key, legs, underlyingPrice, riskFreeRate, userId]);

  function removeCurrentDraft() {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    removeDraft(key);
    setPendingDraft(null);
    setDraftDecision('ready');
    setLastSavedAt(null);
    setStatus('idle');
    if (client && userId) {
      client.from('strategy_drafts').delete().eq('user_id', userId).then(({ error }) => {
        if (error) setSyncError(error.message);
      });
    }
  }

  function restoreDraft() {
    if (!pendingDraft) return;
    decisionMade.current = true;
    const draft = pendingDraft;
    setPendingDraft(null);
    setDraftDecision('ready');
    setStatus('saved');
    setLastSavedAt(draft.savedAt);
    onRestore(draft);
  }

  function discardDraft() {
    decisionMade.current = true;
    removeCurrentDraft();
  }

  return {
    pendingDraft,
    status,
    lastSavedAt,
    syncError,
    restoreDraft,
    discardDraft,
    clearDraft: removeCurrentDraft,
  };
}
