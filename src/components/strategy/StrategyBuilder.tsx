import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Plus } from 'lucide-react';
import { LegRow } from './LegRow';
import { SaveLoadPanel } from './SaveLoadPanel';
import { MCX_INSTRUMENTS, DEFAULT_INSTRUMENT, getStrikeGap, roundToStrike } from '@/data/instruments';
import { PREBUILT_STRATEGIES, buildStrategyLegs } from '@/lib/strategies';
import { useSavedStrategies } from '@/hooks/useSavedStrategies';
import type { OptionLeg } from '@/types';
import type { MarketQuote } from '@/types/market';

function newId() {
  return crypto.randomUUID();
}

function makeDefaultLeg(price: number, instrument = DEFAULT_INSTRUMENT): OptionLeg {
  const atm = roundToStrike(price, getStrikeGap(instrument, price));
  return {
    id: newId(),
    instrument,
    positionType: 'BUY',
    optionType: 'CE',
    strikePrice: atm,
    premium: 500,
    iv: 18,
    daysToExpiry: 30,
    lots: 1,
  };
}

type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function editableFingerprint(legs: OptionLeg[], underlyingPrice: number, riskFreeRate: number, followMarket: boolean) {
  const hasLiveLeg = legs.some(leg => !!leg.marketContract);
  return JSON.stringify({
    // Live quote fields change continuously; do not rewrite a saved strategy
    // every poll while still tracking user-edited model inputs.
    underlyingPrice: followMarket && hasLiveLeg ? null : Number(underlyingPrice.toFixed(4)),
    riskFreeRate,
    legs: legs.map(leg => ({
      id: leg.id,
      positionType: leg.positionType,
      optionType: leg.optionType,
      strikePrice: leg.strikePrice,
      premium: leg.premium,
      lots: leg.lots,
      iv: followMarket && leg.marketContract ? null : leg.iv,
      daysToExpiry: followMarket && leg.marketContract ? null : leg.daysToExpiry,
      instrument: leg.instrument,
      marketContract: leg.marketContract ?? null,
    })),
  });
}

interface Props {
  legs: OptionLeg[];
  underlyingPrice: number;
  riskFreeRate: number;
  followMarket: boolean;
  quotes?: Record<number, MarketQuote>;
  quoteNow?: number;
  isDark: boolean;
  userId?: string | null;
  onStrategySaved?: () => void;
  onNamedStrategyChange?: (active: boolean) => void;
  onLegsChange: Dispatch<SetStateAction<OptionLeg[]>>;
  /** Corrections to how a live position was entered; the quote-driven model keeps following. */
  onLegEntryChange?: Dispatch<SetStateAction<OptionLeg[]>>;
  onUnderlyingChange: (price: number) => void;
  onRateChange: (rate: number) => void;
  onLoadSnapshot: (followLive?: boolean) => void;
}

export function StrategyBuilder({
  legs,
  underlyingPrice,
  riskFreeRate,
  followMarket,
  quotes,
  quoteNow,
  isDark,
  userId = null,
  onStrategySaved,
  onNamedStrategyChange,
  onLegsChange,
  onLegEntryChange = onLegsChange,
  onUnderlyingChange,
  onRateChange,
  onLoadSnapshot,
}: Props) {
  const [selectedStrategy, setSelectedStrategy] = useState('');
  const [activeStrategyId, setActiveStrategyId] = useState<string | null>(null);
  const [activeStrategyName, setActiveStrategyName] = useState('');
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  const lastAutoSavedFingerprint = useRef<string | null>(null);
  const failedAutoSaveFingerprint = useRef<string | null>(null);
  const { strategies, loading: strategiesLoading, saveStrategy, updateStrategy, deleteStrategy, renameStrategy, atLimit, error: saveError } = useSavedStrategies(userId);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setActiveStrategyId(null);
      setActiveStrategyName('');
      setAutoSaveStatus('idle');
      lastAutoSavedFingerprint.current = null;
      failedAutoSaveFingerprint.current = null;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [userId]);

  const performAutoSave = useEffectEvent(async (id: string, fingerprint: string, nextLegs: OptionLeg[], nextPrice: number, nextRate: number) => {
    setAutoSaveStatus('saving');
    const accepted = await updateStrategy(id, nextPrice, nextLegs, nextRate);
    if (accepted) {
      lastAutoSavedFingerprint.current = fingerprint;
      failedAutoSaveFingerprint.current = null;
      setAutoSaveStatus('saved');
    } else {
      failedAutoSaveFingerprint.current = fingerprint;
      setAutoSaveStatus('error');
    }
  });

  useEffect(() => {
    if (!activeStrategyId || !legs.length) return;
    const fingerprint = editableFingerprint(legs, underlyingPrice, riskFreeRate, followMarket);
    if (fingerprint === lastAutoSavedFingerprint.current || fingerprint === failedAutoSaveFingerprint.current) return;
    const timer = window.setTimeout(() => {
      void performAutoSave(activeStrategyId, fingerprint, legs, underlyingPrice, riskFreeRate);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [activeStrategyId, followMarket, legs, underlyingPrice, riskFreeRate]);

  function addLeg() {
    onLegsChange(previous => [...previous, makeDefaultLeg(underlyingPrice, previous[0]?.instrument)]);
  }

  function updateLeg(updated: OptionLeg) {
    const current = legs.find(l => l.id === updated.id);
    // Side, entry price and lots on a live leg are not quote-driven, so fixing
    // them must not freeze the model. Changing IV or expiry is a scenario edit.
    const entryOnly = !!current?.marketContract && current.iv === updated.iv && current.daysToExpiry === updated.daysToExpiry;
    (entryOnly ? onLegEntryChange : onLegsChange)(previous => previous.map((l) => (l.id === updated.id ? updated : l)));
  }

  function deleteLeg(id: string) {
    onLegsChange(previous => previous.filter((l) => l.id !== id));
  }

  function applyStrategy(name: string) {
    if (name === '') return;
    const inst = legs[0]?.instrument ?? DEFAULT_INSTRUMENT;
    const newLegs = buildStrategyLegs(name, underlyingPrice, riskFreeRate, inst);
    if (!newLegs.length) return;
    onLegsChange(newLegs);
  }

  function chooseStrategy(name: string) {
    setSelectedStrategy(name);
    applyStrategy(name);
  }

  const sectionDivider = { borderBottomColor: 'var(--th-divider)' };
  const labelStyle = { color: 'var(--th-muted)' };

  const inputCls = 'ui-input w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

  const selectCls = 'ui-input ui-select w-full';

  return (
    <div className="flex flex-col border-t" style={{ borderTopColor: 'var(--th-divider)' }}>

      {/* ── Market inputs ── */}
      {legs.length > 0 && <div className="px-4 pt-4 pb-4 border-b" style={sectionDivider}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold uppercase tracking-wide" style={labelStyle}>1 · Set the market</p>
            <span className="text-xs" style={{ color: 'var(--th-muted)' }}>Model settings</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="reference-futures-price" className="text-xs block mb-2" style={labelStyle}>Reference futures price (₹)</label>
              <input id="reference-futures-price" type="number" inputMode="decimal" aria-label="Reference futures price" className={inputCls}
                value={Number(underlyingPrice.toFixed(4))} step={1} min={0.01}
                onFocus={e => e.currentTarget.select()}
                onChange={(e) => { const value = Number(e.target.value); if (Number.isFinite(value) && value > 0) onUnderlyingChange(value); }} />
            </div>
            <div>
              <label htmlFor="interest-rate" className="text-xs block mb-2" style={labelStyle}>Interest rate (%)</label>
              <input id="interest-rate" type="number" inputMode="decimal" aria-label="Interest rate" className={inputCls}
                value={riskFreeRate} step={0.25} min={0} max={20}
                onFocus={e => e.currentTarget.select()}
                onChange={(e) => { const value = Number(e.target.value); if (Number.isFinite(value) && value >= 0 && value <= 20) onRateChange(value); }} />
            </div>
          </div>
        </div>}

      {/* ── Strategy template ── */}
      <div className="px-4 pt-4 pb-4 border-b" style={sectionDivider}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold uppercase tracking-wide" style={labelStyle}>2 · Choose a strategy</p>
          <span className="text-xs" style={{ color: 'var(--th-muted)' }}>Start faster</span>
        </div>
        <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--th-muted)' }}>Pick a view on the market. You can edit the positions after loading.</p>
        <div className="flex gap-2 items-center">
          <select
            disabled={legs.some(leg => leg.marketContract)}
            className={selectCls}
            value={selectedStrategy}
            onChange={(e) => {
              const name = e.target.value;
              chooseStrategy(name);
            }}
          >
            <option value="">— Select a starting template —</option>
            {PREBUILT_STRATEGIES.map((s) => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>

          {legs.length > 0 && (
            <button
              type="button"
              title="Start a new strategy"
              onClick={() => {
                setSelectedStrategy('');
                setActiveStrategyId(null);
                setActiveStrategyName('');
                setAutoSaveStatus('idle');
                lastAutoSavedFingerprint.current = null;
                failedAutoSaveFingerprint.current = null;
                onNamedStrategyChange?.(false);
                onLegsChange([]);
              }}
              aria-label="Start a new strategy"
              className="ui-btn ui-btn-primary ui-btn-sm shrink-0"
            >
              <Plus className="w-4 h-4" />
              New strategy
            </button>
          )}
        </div>
        <div className="mt-3">
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--th-muted)' }}>Popular starting points</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {['Long Call', 'Long Put', 'Bull Call Spread', 'Long Straddle'].map(name => {
              const template = PREBUILT_STRATEGIES.find(strategy => strategy.name === name);
              if (!template) return null;
              return <button
                key={name}
                type="button"
                disabled={legs.some(leg => leg.marketContract)}
                onClick={() => chooseStrategy(name)}
                title={template.description}
                className="group rounded-lg border px-3 py-2 text-left transition-colors hover:border-brand/60 hover:bg-brand/5 disabled:cursor-not-allowed disabled:opacity-70"
                style={{ borderColor: 'var(--th-border2)', background: 'var(--th-input)' }}
              >
                <span className="block text-xs font-medium truncate">{name}</span>
                <span className="mt-1 block text-xs truncate" style={{ color: 'var(--th-muted)' }}>{template.description.split('. ')[0]}</span>
              </button>;
            })}
          </div>
        </div>
      </div>

      {/* ── Saved strategies ── */}
      <div className="px-4 pb-4 border-b pt-4" style={{ borderBottomColor: 'var(--th-divider)' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--th-muted)' }}>
            Saved strategies
          </p>
          <span className="text-xs" style={{ color: 'var(--th-muted)' }}>{strategies.length}/20</span>
        </div>
        <SaveLoadPanel
          strategies={strategies}
          atLimit={atLimit}
          canSave={legs.length > 0}
          loading={strategiesLoading}
          suggestedName={selectedStrategy}
          isDark={isDark}
          saveError={saveError}
          activeStrategyName={activeStrategyName}
          autoSaveStatus={autoSaveStatus}
          onSave={async (name) => {
            const saved = await saveStrategy(name, underlyingPrice, legs, riskFreeRate);
            if (!saved) return false;
            setActiveStrategyId(saved.id);
            setActiveStrategyName(saved.name);
            lastAutoSavedFingerprint.current = editableFingerprint(legs, underlyingPrice, riskFreeRate, followMarket);
            failedAutoSaveFingerprint.current = null;
            setAutoSaveStatus('idle');
            onStrategySaved?.();
            onNamedStrategyChange?.(true);
            return true;
          }}
          onRename={async (id, name) => {
            const renamed = await renameStrategy(id, name);
            if (renamed && id === activeStrategyId) setActiveStrategyName(name.trim());
            return renamed;
          }}
          onLoad={(s) => {
            const loadedLegs = s.legs.map(leg => ({ ...leg, id: newId() }));
            const loadedRate = s.riskFreeRate ?? 6.5;
            const loadedFollowLive = s.legs.some(leg => !!leg.marketContract);
            onUnderlyingChange(s.futuresPrice);
            onLegsChange(loadedLegs);
            onRateChange(loadedRate);
            setActiveStrategyId(s.id);
            setActiveStrategyName(s.name);
            lastAutoSavedFingerprint.current = editableFingerprint(loadedLegs, s.futuresPrice, loadedRate, loadedFollowLive);
            failedAutoSaveFingerprint.current = null;
            setAutoSaveStatus('idle');
            setSelectedStrategy('');
            onNamedStrategyChange?.(true);
            onLoadSnapshot(loadedFollowLive);
          }}
          onDelete={async (id) => {
            const deleted = await deleteStrategy(id);
            if (deleted && id === activeStrategyId) {
              setActiveStrategyId(null);
              setActiveStrategyName('');
              setAutoSaveStatus('idle');
              lastAutoSavedFingerprint.current = null;
              failedAutoSaveFingerprint.current = null;
              onNamedStrategyChange?.(false);
            }
          }}
        />
      </div>

      {/* ── Legs ── */}
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide" style={labelStyle}>
            3 · Check positions{legs.length > 0 && <span className="normal-case font-normal ml-1">({legs.length})</span>}
          </p>
          {legs.length > 0 && <span className="text-xs" style={{ color: 'var(--th-muted)' }}>Edit below</span>}
        </div>

        {legs.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-1 py-6 px-3 text-xs text-center border border-dashed rounded-lg mb-2"
            style={{ color: 'var(--th-muted)', borderColor: 'var(--th-border2)' }}
          >
            <span>No positions yet</span>
            <span className="text-xs">Choose a strategy above or add a buy/sell position.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2 mb-2">
            {legs.map((leg) => (
              <LegRow
                key={leg.id} leg={leg} instruments={leg.marketContract ? [leg.instrument] : legs.length > 1 ? [legs[0].instrument] : MCX_INSTRUMENTS}
                futuresPrice={underlyingPrice} riskFreeRate={riskFreeRate}
                quotes={quotes} quoteNow={quoteNow}
                onChange={updateLeg} onDelete={deleteLeg}
              />
            ))}
          </div>
        )}

        <button
          onClick={addLeg}
          disabled={legs.some(leg => leg.marketContract) || legs.length >= 20}
          className="ui-btn ui-btn-dashed w-full"
        >
          <Plus className="w-4 h-4" />
          Add position
        </button>
      </div>

    </div>
  );
}
