import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Plus, X } from 'lucide-react';
import { LegRow } from './LegRow';
import { SaveLoadPanel } from './SaveLoadPanel';
import { MCX_INSTRUMENTS, DEFAULT_INSTRUMENT, getStrikeGap, roundToStrike } from '@/data/instruments';
import { PREBUILT_STRATEGIES, buildStrategyLegs } from '@/lib/strategies';
import { useSavedStrategies } from '@/hooks/useSavedStrategies';
import type { OptionLeg } from '@/types';

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

interface Props {
  legs: OptionLeg[];
  underlyingPrice: number;
  riskFreeRate: number;
  isDark: boolean;
  userId?: string | null;
  onStrategySaved?: () => void;
  onLegsChange: Dispatch<SetStateAction<OptionLeg[]>>;
  onUnderlyingChange: (price: number) => void;
  onRateChange: (rate: number) => void;
  onLoadSnapshot: () => void;
}

export function StrategyBuilder({
  legs,
  underlyingPrice,
  riskFreeRate,
  isDark,
  userId = null,
  onStrategySaved,
  onLegsChange,
  onUnderlyingChange,
  onRateChange,
  onLoadSnapshot,
}: Props) {
  const [selectedStrategy, setSelectedStrategy] = useState('');
  const { strategies, saveStrategy, deleteStrategy, atLimit, error: saveError } = useSavedStrategies(userId);

  function addLeg() {
    onLegsChange(previous => [...previous, makeDefaultLeg(underlyingPrice, previous[0]?.instrument)]);
  }

  function updateLeg(updated: OptionLeg) {
    onLegsChange(previous => previous.map((l) => (l.id === updated.id ? updated : l)));
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

  const inputStyle = {
    background: 'var(--th-input)',
    border: '1px solid var(--th-border2)',
    color: 'var(--th-text)',
  };
  const sectionDivider = { borderBottomColor: 'var(--th-divider)' };
  const labelStyle = { color: 'var(--th-muted)' };

  const inputCls =
    'w-full rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-colors';

  const selectCls =
    'w-full rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/50 cursor-pointer transition-colors';

  return (
    <div className="flex flex-col gap-0">

      {/* ── Market inputs ── */}
      {legs.length > 0 && <div className="px-4 pt-4 pb-4 border-b" style={sectionDivider}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={labelStyle}>1 · Set the market</p>
            <span className="text-[10px]" style={{ color: 'var(--th-muted)' }}>Model settings</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="reference-futures-price" className="text-[11px] block mb-1.5" style={labelStyle}>Reference futures price (₹)</label>
              <input id="reference-futures-price" type="number" inputMode="decimal" aria-label="Reference futures price" className={inputCls} style={inputStyle}
                value={Number(underlyingPrice.toFixed(4))} step={1} min={0.01}
                onFocus={e => e.currentTarget.select()}
                onChange={(e) => { const value = Number(e.target.value); if (Number.isFinite(value) && value > 0) onUnderlyingChange(value); }} />
            </div>
            <div>
              <label htmlFor="interest-rate" className="text-[11px] block mb-1.5" style={labelStyle}>Interest rate (%)</label>
              <input id="interest-rate" type="number" inputMode="decimal" aria-label="Interest rate" className={inputCls} style={inputStyle}
                value={riskFreeRate} step={0.25} min={0} max={20}
                onFocus={e => e.currentTarget.select()}
                onChange={(e) => { const value = Number(e.target.value); if (Number.isFinite(value) && value >= 0 && value <= 20) onRateChange(value); }} />
            </div>
          </div>
        </div>}

      {/* ── Strategy template ── */}
      <div className="px-4 pt-4 pb-4 border-b" style={sectionDivider}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={labelStyle}>2 · Choose a strategy</p>
          <span className="text-[10px]" style={{ color: 'var(--th-muted)' }}>Start faster</span>
        </div>
        <p className="text-[11px] leading-relaxed mb-3" style={{ color: 'var(--th-muted)' }}>Pick a view on the market. You can edit the positions after loading.</p>
        <div className="flex gap-2 items-center">
          <select
            disabled={legs.some(leg => leg.marketContract)}
            className={selectCls}
            style={inputStyle}
            value={selectedStrategy}
            onChange={(e) => {
              const name = e.target.value;
              chooseStrategy(name);
            }}
          >
            <option value="">— Select a strategy to load —</option>
            {PREBUILT_STRATEGIES.map((s) => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>

          {legs.length > 0 && (
            <button
              title="Clear strategy"
              onClick={() => { setSelectedStrategy(''); onLegsChange([]); }}
              className="shrink-0 p-1.5 rounded transition-colors hover:bg-red-500/10 hover:text-red-400"
              style={{ color: 'var(--th-muted)' }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="mt-3">
          <p className="text-[10px] font-medium mb-2" style={{ color: 'var(--th-muted)' }}>Popular starting points</p>
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
                className="group rounded-lg border px-2.5 py-2 text-left transition-colors hover:border-blue-400/60 hover:bg-blue-500/5 disabled:cursor-not-allowed disabled:opacity-45"
                style={{ borderColor: 'var(--th-border2)', background: 'var(--th-input)' }}
              >
                <span className="block text-[11px] font-medium truncate">{name}</span>
                <span className="mt-0.5 block text-[10px] truncate" style={{ color: 'var(--th-muted)' }}>{template.description.split('. ')[0]}</span>
              </button>;
            })}
          </div>
        </div>
      </div>

      {/* ── Legs ── */}
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={labelStyle}>
            3 · Check positions{legs.length > 0 && <span className="normal-case font-normal ml-1">({legs.length})</span>}
          </p>
          {legs.length > 0 && <span className="text-[10px]" style={{ color: 'var(--th-muted)' }}>Edit below</span>}
        </div>

        {legs.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-1 py-5 px-3 text-xs text-center border border-dashed rounded-lg mb-2"
            style={{ color: 'var(--th-muted)', borderColor: 'var(--th-border2)' }}
          >
            <span>No positions yet</span>
            <span className="text-[10px]">Choose a strategy above or add a buy/sell position.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2 mb-2">
            {legs.map((leg) => (
              <LegRow
                key={leg.id} leg={leg} instruments={leg.marketContract ? [leg.instrument] : legs.length > 1 ? [legs[0].instrument] : MCX_INSTRUMENTS}
                futuresPrice={underlyingPrice} riskFreeRate={riskFreeRate}
                onChange={updateLeg} onDelete={deleteLeg}
              />
            ))}
          </div>
        )}

        <button
          onClick={addLeg}
          disabled={legs.some(leg => leg.marketContract) || legs.length >= 20}
          className="flex items-center gap-1.5 w-full justify-center px-3 py-2 rounded-lg border border-dashed transition-colors text-xs hover:opacity-80"
          style={{ color: 'var(--th-muted)', borderColor: 'var(--th-border2)' }}
        >
          <Plus className="w-3.5 h-3.5" />
          Add position
        </button>
      </div>

      {/* ── Save / Load ── */}
      {legs.length > 0 && <div className="px-4 pb-4 border-t pt-4" style={{ borderTopColor: 'var(--th-divider)' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--th-muted)' }}>
            Save / load strategy
          </p>
          <span className="text-[10px]" style={{ color: 'var(--th-muted)' }}>Optional</span>
        </div>
        <SaveLoadPanel
          strategies={strategies}
          atLimit={atLimit}
          suggestedName={selectedStrategy}
          isDark={isDark}
          saveError={saveError}
          onSave={async (name) => {
            const accepted = await saveStrategy(name, underlyingPrice, legs, riskFreeRate);
            if (accepted) onStrategySaved?.();
            return accepted;
          }}
          onLoad={(s) => {
            onUnderlyingChange(s.futuresPrice);
            onLegsChange(s.legs.map(leg => ({ ...leg, id: newId() })));
            onRateChange(s.riskFreeRate ?? 6.5);
            setSelectedStrategy('');
            onLoadSnapshot();
          }}
          onDelete={deleteStrategy}
        />
        </div>}

    </div>
  );
}
