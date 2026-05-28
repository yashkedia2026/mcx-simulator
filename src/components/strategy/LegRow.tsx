import { Trash2 } from 'lucide-react';
import type { OptionLeg, Instrument } from '@/types';

interface Props {
  leg: OptionLeg;
  instruments: Instrument[];
  isDark: boolean;
  onChange: (updated: OptionLeg) => void;
  onDelete: (id: string) => void;
}

export function LegRow({ leg, instruments, isDark, onChange, onDelete }: Props) {
  const update = (patch: Partial<OptionLeg>) => onChange({ ...leg, ...patch });
  const isBuy = leg.positionType === 'BUY';
  const isCE  = leg.optionType  === 'CE';

  const inputStyle = {
    background: 'var(--th-input)',
    border: '1px solid var(--th-border2)',
    color: 'var(--th-text)',
  };

  const numCls =
    'w-full rounded px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-colors';

  const selCls =
    'w-full rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50 cursor-pointer transition-colors';

  const lbl = {
    display: 'block' as const,
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
          className={selCls} style={inputStyle}
          value={leg.instrument.symbol}
          onChange={(e) => {
            const inst = instruments.find((i) => i.symbol === e.target.value);
            if (inst) update({ instrument: inst });
          }}
        >
          {instruments.map((i) => (
            <option key={i.symbol} value={i.symbol}>{i.name}</option>
          ))}
        </select>

        <button
          onClick={() => onDelete(leg.id)}
          className="shrink-0 p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Row 2: Strike · Premium */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span style={lbl}>Strike</span>
          <input type="number" className={numCls} style={inputStyle}
            value={leg.strikePrice} step={leg.instrument.tickSize * 10}
            onChange={(e) => update({ strikePrice: parseFloat(e.target.value) || 0 })} />
        </div>
        <div>
          <span style={lbl}>Premium</span>
          <input type="number" className={numCls} style={inputStyle}
            value={leg.premium} step={leg.instrument.tickSize}
            onChange={(e) => update({ premium: parseFloat(e.target.value) || 0 })} />
        </div>
      </div>

      {/* Row 3: IV% · DTE · Lots */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <span style={lbl}>IV%</span>
          <input type="number" className={numCls} style={inputStyle}
            value={leg.iv} step={0.5} min={0.1} max={200}
            onChange={(e) => update({ iv: parseFloat(e.target.value) || 1 })} />
        </div>
        <div>
          <span style={lbl}>DTE</span>
          <input type="number" className={numCls} style={inputStyle}
            value={leg.daysToExpiry} min={0} max={365}
            onChange={(e) => update({ daysToExpiry: parseInt(e.target.value) || 0 })} />
        </div>
        <div>
          <span style={lbl}>Lots</span>
          <input type="number" className={numCls} style={inputStyle}
            value={leg.lots} min={1}
            onChange={(e) => update({ lots: parseInt(e.target.value) || 1 })} />
        </div>
      </div>
    </div>
  );
}
