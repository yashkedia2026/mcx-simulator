import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { calculateIV } from '@/lib/impliedVolatility';
import { expiryTime } from '@/lib/marketData';
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
  const linkedContract = leg.marketContract;

  // Calibration belongs to an exact set of model inputs; a live quote or manual
  // change invalidates its badge without any delayed update to strategy state.
  const calibrationKey = [leg.premium, futuresPrice, leg.strikePrice, leg.daysToExpiry,
    riskFreeRate, leg.optionType, leg.instrument.symbol, leg.iv].join('|');
  const [calibration, setCalibration] = useState<{ key: string; valid: boolean } | null>(null);
  const [editedPremium, setEditedPremium] = useState<number | null>(null);
  const isIvAuto = calibration?.key === calibrationKey && calibration.valid;
  const ivInvalid = calibration?.key === calibrationKey && !calibration.valid;

  function handlePremiumChange(premium: number) {
    update({ premium });
    setCalibration(null);
    setEditedPremium(premium);
  }

  function calibratePremium() {
    if (linkedContract) return;
    if (editedPremium === null || editedPremium !== leg.premium) return;
    setEditedPremium(null);
    const iv = calculateIV(leg.premium, futuresPrice, leg.strikePrice,
      leg.daysToExpiry / 365, riskFreeRate / 100, leg.optionType);
    if (iv === null) {
      setCalibration({ key: calibrationKey, valid: false });
      return;
    }
    const ivPercent = Number((iv * 100).toFixed(4));
    update({ iv: ivPercent });
    setCalibration({ key: [leg.premium, futuresPrice, leg.strikePrice,
      leg.daysToExpiry, riskFreeRate, leg.optionType, leg.instrument.symbol, ivPercent].join('|'), valid: true });
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
          disabled={!!linkedContract}
          title={linkedContract ? 'Option type is fixed by the selected market contract' : 'Toggle call / put'}
          onClick={() => update({ optionType: isCE ? 'PE' : 'CE' })}
          className={`shrink-0 px-3 py-1 rounded text-xs font-bold tracking-wide transition-colors ${
            isCE ? 'bg-blue-600 text-white' : 'bg-orange-500 text-white'
          }`}
        >
          {isCE ? 'CE' : 'PE'}
        </button>

        <select
          aria-label="Instrument"
          disabled={!!linkedContract}
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
          aria-label="Delete leg"
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
            aria-label="Strike price" disabled={!!linkedContract} min={leg.instrument.tickSize}
            value={leg.strikePrice} step={leg.instrument.tickSize * 10}
            onChange={(e) => { const value = e.target.valueAsNumber; if (Number.isFinite(value) && value > 0) update({ strikePrice: value }); }} />
        </div>
        <div>
          <div className="flex items-center gap-1" style={{ marginBottom: 4 }}>
            <span style={{ ...lbl, marginBottom: 0 }} title="The original buy or sell price used for this position">Entry price</span>
            {ivInvalid && (
              <span title="No finite implied volatility fits this premium and these model inputs" style={{ color: '#ef4444', fontSize: 10 }}>⚠</span>
            )}
          </div>
          <input type="number" className={numCls} style={inputStyle}
            aria-label="Original entry price" title="Edit this to replay the price at which you originally bought or sold" min={0}
            value={leg.premium} step={leg.instrument.tickSize}
            onChange={(e) => { const value = e.target.valueAsNumber; if (Number.isFinite(value) && value >= 0) handlePremiumChange(value); }}
            onBlur={calibratePremium} />
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
            aria-label="Implied volatility percent"
            value={leg.iv} step={0.5} min={0}
            onChange={(e) => { const value = e.target.valueAsNumber; if (Number.isFinite(value) && value >= 0) { setCalibration(null); update({ iv: value }); } }} />
        </div>

        <div>
          <span style={lbl} className="block">{linkedContract ? 'Expiry' : 'Days to expiry'}</span>
          {linkedContract ? (
            <div className="rounded px-2 py-1.5 text-[10px] text-center" style={baseInput} title={linkedContract.expiry}>
              {new Date(expiryTime(linkedContract.expiry)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'Asia/Kolkata' })}
              <span className="block" style={{ color: 'var(--th-muted)' }}>{leg.daysToExpiry.toFixed(1)} days</span>
            </div>
          ) : (
            <input type="number" className={numCls} style={baseInput}
              aria-label="Days to expiry" value={leg.daysToExpiry} min={0}
              onChange={(e) => { const value = e.target.valueAsNumber; if (Number.isFinite(value) && value >= 0) update({ daysToExpiry: value }); }} />
          )}
        </div>

        <div>
          <span style={lbl} className="block">Lots</span>
          <input type="number" className={numCls} style={baseInput}
            aria-label="Lots" value={leg.lots} min={1} step={1}
            onChange={(e) => { const value = e.target.valueAsNumber; if (Number.isInteger(value) && value >= 1) update({ lots: value }); }} />
        </div>
      </div>
    </div>
  );
}
