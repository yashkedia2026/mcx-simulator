import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { LegRow } from './LegRow';
import { MCX_INSTRUMENTS, DEFAULT_INSTRUMENT, getStrikeGap, roundToStrike } from '@/data/instruments';
import { PREBUILT_STRATEGIES } from '@/lib/strategies';
import { black76Price } from '@/lib/black76';
import type { OptionLeg } from '@/types';

let legCounter = 0;
function newId() {
  return `leg-${++legCounter}`;
}

function makeDefaultLeg(): OptionLeg {
  const atm = roundToStrike(74000, getStrikeGap(DEFAULT_INSTRUMENT, 74000));
  return {
    id: newId(),
    instrument: DEFAULT_INSTRUMENT,
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
  onLegsChange: (legs: OptionLeg[]) => void;
  onUnderlyingChange: (price: number) => void;
  onRateChange: (rate: number) => void;
}

export function StrategyBuilder({
  legs,
  underlyingPrice,
  riskFreeRate,
  isDark,
  onLegsChange,
  onUnderlyingChange,
  onRateChange,
}: Props) {
  const [selectedStrategy, setSelectedStrategy] = useState('');

  const strikeGap = useMemo(() => {
    const inst = legs[0]?.instrument ?? DEFAULT_INSTRUMENT;
    return getStrikeGap(inst, underlyingPrice);
  }, [legs, underlyingPrice]);

  function addLeg() {
    onLegsChange([...legs, makeDefaultLeg()]);
  }

  function updateLeg(updated: OptionLeg) {
    onLegsChange(legs.map((l) => (l.id === updated.id ? updated : l)));
  }

  function deleteLeg(id: string) {
    onLegsChange(legs.filter((l) => l.id !== id));
  }

  function applyStrategy(name: string) {
    if (name === '') return;
    const template = PREBUILT_STRATEGIES.find((s) => s.name === name);
    if (!template) return;

    const inst = legs[0]?.instrument ?? DEFAULT_INSTRUMENT;
    const atmStrike = roundToStrike(underlyingPrice, strikeGap);

    const T = 30 / 365;
    const r = riskFreeRate / 100;
    const sigma = 0.18;

    const newLegs: OptionLeg[] = template.legs.map((tl) => {
      const strikePrice = atmStrike + tl.strikeOffset * strikeGap;
      const premium = Math.round(black76Price(underlyingPrice, strikePrice, T, r, sigma, tl.optionType));
      return {
        id: newId(),
        instrument: inst,
        positionType: tl.positionType,
        optionType: tl.optionType,
        strikePrice,
        premium,
        iv: 18,
        daysToExpiry: 30,
        lots: 1,
      };
    });
    onLegsChange(newLegs);
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
      <div className="px-4 pt-4 pb-4 border-b" style={sectionDivider}>
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={labelStyle}>Market</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] block mb-1.5" style={labelStyle}>Futures Price (₹)</label>
            <input type="number" className={inputCls} style={inputStyle}
              value={underlyingPrice} step={1}
              onChange={(e) => onUnderlyingChange(parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <label className="text-[11px] block mb-1.5" style={labelStyle}>Risk-Free Rate (%)</label>
            <input type="number" className={inputCls} style={inputStyle}
              value={riskFreeRate} step={0.25} min={0} max={20}
              onChange={(e) => onRateChange(parseFloat(e.target.value) || 0)} />
          </div>
        </div>
      </div>

      {/* ── Strategy template ── */}
      <div className="px-4 pt-4 pb-4 border-b" style={sectionDivider}>
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={labelStyle}>Strategy Template</p>
        <div className="flex gap-2 items-center">
          <select
            className={selectCls}
            style={inputStyle}
            value={selectedStrategy}
            onChange={(e) => {
              const name = e.target.value;
              setSelectedStrategy(name);
              applyStrategy(name);
            }}
          >
            <option value="">— Select a strategy to load —</option>
            {PREBUILT_STRATEGIES.map((s) => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>

          {selectedStrategy && (
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
      </div>

      {/* ── Legs ── */}
      <div className="px-4 pt-4 pb-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={labelStyle}>
          Legs{legs.length > 0 && <span className="normal-case font-normal ml-1">({legs.length})</span>}
        </p>

        {legs.length === 0 ? (
          <div
            className="flex items-center justify-center py-5 text-xs border border-dashed rounded-lg mb-2"
            style={{ color: 'var(--th-muted)', borderColor: 'var(--th-border2)' }}
          >
            No legs — select a template or add manually
          </div>
        ) : (
          <div className="flex flex-col gap-2 mb-2">
            {legs.map((leg) => (
              <LegRow key={leg.id} leg={leg} instruments={MCX_INSTRUMENTS}
                isDark={isDark} onChange={updateLeg} onDelete={deleteLeg} />
            ))}
          </div>
        )}

        <button
          onClick={addLeg}
          className="flex items-center gap-1.5 w-full justify-center px-3 py-2 rounded-lg border border-dashed transition-colors text-xs hover:opacity-80"
          style={{ color: 'var(--th-muted)', borderColor: 'var(--th-border2)' }}
        >
          <Plus className="w-3.5 h-3.5" />
          Add Leg
        </button>
      </div>

    </div>
  );
}
