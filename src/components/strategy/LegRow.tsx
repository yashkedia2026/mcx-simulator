import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { calculateIV } from '@/lib/impliedVolatility';
import { expiryTime } from '@/lib/marketData';
import type { OptionLeg, Instrument } from '@/types';

interface Props {
  leg: OptionLeg;
  instruments: Instrument[];
  futuresPrice: number;
  riskFreeRate: number;
  onChange: (updated: OptionLeg) => void;
  onDelete: (id: string) => void;
}

type NumberFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'type'> & {
  value: number;
  isValid: (value: number) => boolean;
  onCommit: (value: number) => void;
  onBlur?: () => void;
};

// Keeps the text being typed separate from the committed number, so a field can
// be emptied and retyped. Valid values commit as they are typed. Leaving the
// field empty or invalid puts back the value it had when editing started, so a
// half-deleted number is never left behind as the position's price or size.
function NumberField({ value, isValid, onCommit, onBlur, ...rest }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const edit = useRef({ start: value, committed: false, valid: true });
  return (
    <input type="number" {...rest}
      value={draft ?? String(value)}
      onFocus={(e) => {
        e.currentTarget.select();
        edit.current = { start: value, committed: false, valid: true };
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        const next = e.target.valueAsNumber;
        const valid = Number.isFinite(next) && isValid(next);
        edit.current.valid = valid;
        if (valid) { edit.current.committed = true; onCommit(next); }
      }}
      onBlur={() => {
        setDraft(null);
        const { start, committed, valid } = edit.current;
        if (!valid) { if (committed) onCommit(start); return; }
        onBlur?.();
      }} />
  );
}

export function LegRow({ leg, instruments, futuresPrice, riskFreeRate, onChange, onDelete }: Props) {
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

  const inputStyle: React.CSSProperties | undefined = ivInvalid ? { borderColor: 'var(--th-negative)' } : undefined;

  const baseInput: React.CSSProperties = {
    background: 'var(--th-input)',
    border: '1px solid var(--th-border2)',
    color: 'var(--th-text)',
  };

  const numCls = 'ui-input w-full px-2 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

  const selCls = 'ui-input ui-select w-full';

  const lbl: React.CSSProperties = {
    fontSize: 12,
    marginBottom: 4,
    color: 'var(--th-muted)',
  };

  return (
    <div
      className="flex flex-col gap-2 p-3 rounded-lg transition-colors"
      style={{
        background: 'var(--th-card)',
        border: '1px solid var(--th-border)',
        borderLeft: `3px solid var(${isBuy ? '--th-positive' : '--th-negative'})`,
      }}
    >
      {/* Row 1: BUY/SELL · CE/PE · Instrument · Delete */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => update({ positionType: isBuy ? 'SELL' : 'BUY' })}
          className="ui-btn shrink-0 px-3 text-xs font-bold tracking-wide"
          style={{
            background: `var(${isBuy ? '--th-positive' : '--th-negative'})`,
            color: `var(${isBuy ? '--th-on-positive' : '--th-on-negative'})`,
          }}
        >
          {isBuy ? 'BUY' : 'SELL'}
        </button>

        <button
          disabled={!!linkedContract}
          title={linkedContract ? 'Option type is fixed by the selected market contract' : 'Toggle call / put'}
          onClick={() => update({ optionType: isCE ? 'PE' : 'CE' })}
          className="ui-btn ui-btn-secondary shrink-0 px-3 text-xs font-bold tracking-wide"
        >
          {isCE ? 'CE' : 'PE'}
        </button>

        <select
          aria-label="Instrument"
          disabled={!!linkedContract}
          title={linkedContract ? 'Underlying is fixed by the selected market contract' : undefined}
          className={selCls}
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
          className="ui-icon-btn ui-icon-btn-danger"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {linkedContract && (
        <p className="text-xs leading-relaxed" style={{ color: 'var(--th-muted)' }}>
          Linked to a live contract, so option type, underlying and strike are fixed. Buy/sell, entry price and lots can be corrected here. Wrong contract? Delete this position and add the right one from Live MCX prices.
        </p>
      )}

      {/* Row 2: Strike · Premium */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span style={lbl} className="block">Strike</span>
          <NumberField inputMode="decimal" className={numCls}
            aria-label="Strike price" disabled={!!linkedContract} min={leg.instrument.tickSize}
            title={linkedContract ? 'Strike is fixed by the selected market contract' : undefined}
            value={leg.strikePrice} step={leg.instrument.tickSize * 10}
            isValid={value => value > 0} onCommit={value => update({ strikePrice: value })} />
        </div>
        <div>
          <div className="flex items-center gap-1" style={{ marginBottom: 4 }}>
            <span style={{ ...lbl, marginBottom: 0 }} title="The original buy or sell price used for this position">Entry price</span>
            {ivInvalid && (
              <span title="No finite implied volatility fits this premium and these model inputs" style={{ color: 'var(--th-negative)', fontSize: 12 }}>⚠</span>
            )}
          </div>
          <NumberField inputMode="decimal" className={numCls} style={inputStyle}
            aria-label="Original entry price" title="Edit this to replay the price at which you originally bought or sold" min={0}
            value={leg.premium} step={leg.instrument.tickSize}
            isValid={value => value >= 0} onCommit={handlePremiumChange}
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
                  fontSize: 12, fontWeight: 700,
                  background: 'var(--th-positive)', color: 'var(--th-on-positive)',
                  borderRadius: 3, padding: '1px 3px',
                  cursor: 'default',
                }}
              >
                AUTO
              </span>
            )}
          </div>
          <NumberField inputMode="decimal" className={numCls}
            aria-label="Implied volatility percent"
            value={Number(leg.iv.toFixed(2))} step={0.5} min={0}
            isValid={value => value >= 0} onCommit={value => { setCalibration(null); update({ iv: value }); }} />
        </div>

        <div>
          <span style={lbl} className="block">{linkedContract ? 'Expiry' : 'Days to expiry'}</span>
          {linkedContract ? (
            <div className="rounded-lg px-2 py-1 text-xs text-center leading-4" style={baseInput} title={linkedContract.expiry}>
              {new Date(expiryTime(linkedContract.expiry)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'Asia/Kolkata' })}
              <span className="block" style={{ color: 'var(--th-muted)' }}>{leg.daysToExpiry.toFixed(1)} days</span>
            </div>
          ) : (
            <NumberField inputMode="numeric" className={numCls}
              aria-label="Days to expiry" value={leg.daysToExpiry} min={0}
              isValid={value => value >= 0} onCommit={value => update({ daysToExpiry: value })} />
          )}
        </div>

        <div>
          <span style={lbl} className="block">Lots</span>
          <NumberField inputMode="numeric" className={numCls}
            aria-label="Lots" value={leg.lots} min={1} step={1}
            isValid={value => Number.isInteger(value) && value >= 1} onCommit={value => update({ lots: value })} />
        </div>
      </div>
    </div>
  );
}
