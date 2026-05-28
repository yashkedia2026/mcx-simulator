import { useState, useMemo, useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { getUpcomingExpiries, calculateDTE, formatExpiry } from '@/lib/expiryDates';
import { calculateIV } from '@/lib/impliedVolatility';
import type { OptionLeg, Instrument } from '@/types';

interface Props {
  leg: OptionLeg;
  instruments: Instrument[];
  isDark: boolean;
  futuresPrice: number;
  riskFreeRate: number;
  onChange: (updated: OptionLeg) => void;
  onDelete: (id: string) => void;
}

export function LegRow({ leg, instruments, isDark, futuresPrice, riskFreeRate, onChange, onDelete }: Props) {
  const update = (patch: Partial<OptionLeg>) => onChange({ ...leg, ...patch });
  const isBuy = leg.positionType === 'BUY';
  const isCE  = leg.optionType  === 'CE';

  const [isIvAuto, setIsIvAuto] = useState(false);
  const [ivInvalid, setIvInvalid] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Upcoming expiry dates for this instrument
  const expiries = useMemo(
    () => getUpcomingExpiries(leg.instrument.symbol, 3),
    [leg.instrument.symbol]
  );

  // Try to match current DTE to an expiry; fall back to 'custom'
  const matchExpiry = (dte: number): string => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(today.getTime() + dte * 86_400_000);
    const found = expiries.find(e => Math.abs(e.getTime() - target.getTime()) <= 2 * 86_400_000);
    return found ? found.toISOString() : 'custom';
  };

  const [selectedExpiry, setSelectedExpiry] = useState(() => matchExpiry(leg.daysToExpiry));

  // When instrument changes, regenerate expiry list and re-match
  useEffect(() => {
    setSelectedExpiry(matchExpiry(leg.daysToExpiry));
    setIsIvAuto(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leg.instrument.symbol]);

  function handlePremiumChange(premium: number) {
    update({ premium });
    setIsIvAuto(false);
    setIvInvalid(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const T = leg.daysToExpiry / 365;
      const r = riskFreeRate / 100;
      const iv = calculateIV(premium, futuresPrice, leg.strikePrice, T, r, leg.optionType);
      if (iv !== null) {
        onChange({ ...leg, premium, iv: parseFloat((iv * 100).toFixed(1)) });
        setIsIvAuto(true);
        setIvInvalid(false);
      } else if (premium > 0) {
        setIvInvalid(true);
      }
    }, 300);
  }

  function handleExpiryChange(isoStr: string) {
    setSelectedExpiry(isoStr);
    if (isoStr === 'custom') return;
    const dte = calculateDTE(new Date(isoStr));
    update({ daysToExpiry: dte });
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--th-input)',
    border: `1px solid ${ivInvalid ? '#ef4444' : 'var(--th-border2)'}`,
    color: 'var(--th-text)',
  };

  const baseInput: React.CSSProperties = {
    background: 'var(--th-input)',
    border: '1px solid var(--th-border2)',
    color: 'var(--th-text)',
  };

  const numCls =
    'w-full rounded px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-colors';

  const selCls =
    'w-full rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50 cursor-pointer transition-colors';

  const lbl: React.CSSProperties = {
    fontSize: 10,
    marginBottom: 4,
    color: isDark ? '#6b7280' : '#888888',
  };

  return (
    <div
      className="flex flex-col gap-2 p-3 rounded-lg transition-colors"
      style={{
        background: 'var(--th-card)',
        border: '1px solid var(--th-border)',
        borderLeft: `3px solid ${isBuy ? '#00c853' : '#ff1744'}`,
      }}
    >
      {/* Row 1: BUY/SELL · CE/PE · Instrument · Delete */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => update({ positionType: isBuy ? 'SELL' : 'BUY' })}
          className={`shrink-0 px-3 py-1 rounded text-xs font-bold tracking-wide transition-colors ${
            isBuy ? 'bg-[#00c853] text-black' : 'bg-[#ff1744] text-white'
          }`}
        >
          {isBuy ? 'BUY' : 'SELL'}
        </button>

        <button
          onClick={() => update({ optionType: isCE ? 'PE' : 'CE' })}
          className={`shrink-0 px-3 py-1 rounded text-xs font-bold tracking-wide transition-colors ${
            isCE ? 'bg-blue-600 text-white' : 'bg-orange-500 text-white'
          }`}
        >
          {isCE ? 'CE' : 'PE'}
        </button>

        <select
          className={selCls} style={baseInput}
          value={leg.instrument.symbol}
          onChange={(e) => {
            const inst = instruments.find(i => i.symbol === e.target.value);
            if (inst) update({ instrument: inst });
          }}
        >
          {instruments.map(i => (
            <option key={i.symbol} value={i.symbol}>{i.name}</option>
          ))}
        </select>

        <button
          onClick={() => onDelete(leg.id)}
          className="shrink-0 p-1 rounded transition-colors hover:text-red-400 hover:bg-red-500/10"
          style={{ color: 'var(--th-muted)' }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Row 2: Strike · Premium */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span style={lbl} className="block">Strike</span>
          <input type="number" className={numCls} style={baseInput}
            value={leg.strikePrice} step={leg.instrument.tickSize * 10}
            onChange={(e) => update({ strikePrice: parseFloat(e.target.value) || 0 })} />
        </div>
        <div>
          <div className="flex items-center gap-1" style={{ marginBottom: 4 }}>
            <span style={{ ...lbl, marginBottom: 0 }}>Premium</span>
            {ivInvalid && (
              <span title="Premium may be below intrinsic value" style={{ color: '#ef4444', fontSize: 10 }}>⚠</span>
            )}
          </div>
          <input type="number" className={numCls} style={inputStyle}
            value={leg.premium} step={leg.instrument.tickSize}
            onChange={(e) => handlePremiumChange(parseFloat(e.target.value) || 0)} />
        </div>
      </div>

      {/* Row 3: IV% [AUTO] · Expiry · Lots */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <div className="flex items-center gap-1" style={{ marginBottom: 4 }}>
            <span style={{ ...lbl, marginBottom: 0 }}>IV%</span>
            {isIvAuto && (
              <span
                title="Auto-calculated from premium"
                style={{
                  fontSize: 8, fontWeight: 700,
                  background: '#00c853', color: '#000',
                  borderRadius: 3, padding: '1px 3px',
                  cursor: 'default',
                }}
              >
                AUTO
              </span>
            )}
          </div>
          <input type="number" className={numCls} style={baseInput}
            value={leg.iv} step={0.5} min={0.1} max={200}
            onChange={(e) => { setIsIvAuto(false); update({ iv: parseFloat(e.target.value) || 1 }); }} />
        </div>

        <div>
          <span style={lbl} className="block">Expiry</span>
          <select
            className={selCls} style={baseInput}
            value={selectedExpiry}
            onChange={e => handleExpiryChange(e.target.value)}
          >
            {expiries.map(d => (
              <option key={d.toISOString()} value={d.toISOString()}>
                {formatExpiry(d)} ({calculateDTE(d)}d)
              </option>
            ))}
            <option value="custom">Custom ({leg.daysToExpiry}d)</option>
          </select>
          {selectedExpiry === 'custom' && (
            <input type="number" className={`${numCls} mt-1`} style={baseInput}
              value={leg.daysToExpiry} min={0} max={365}
              placeholder="Days"
              onChange={(e) => update({ daysToExpiry: parseInt(e.target.value) || 0 })} />
          )}
        </div>

        <div>
          <span style={lbl} className="block">Lots</span>
          <input type="number" className={numCls} style={baseInput}
            value={leg.lots} min={1}
            onChange={(e) => update({ lots: parseInt(e.target.value) || 1 })} />
        </div>
      </div>
    </div>
  );
}
