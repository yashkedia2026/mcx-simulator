import { Info } from 'lucide-react';
import type { Greeks } from '@/types';

interface Props {
  greeks: Greeks;
  isDark: boolean;
}

function fmtNum(v: number, d = 4) {
  return v.toFixed(d);
}

function fmtINR(v: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(v);
}

interface RowProps {
  symbol: string;
  name: string;
  symbolColor: string;
  value: string;
  valueColor: string;
  description: string;
}

function Row({ symbol, name, symbolColor, value, valueColor, description }: RowProps) {
  return (
    <tr
      className="last:border-0 transition-colors group"
      style={{ borderBottom: '1px solid var(--th-border)' }}
    >
      <td className="px-4 py-2.5 w-28">
        <div className="flex items-center gap-2">
          <span className={`text-base font-bold leading-none ${symbolColor} w-4 text-center`}>{symbol}</span>
          <span className="text-[11px] font-medium" style={{ color: 'var(--th-muted)' }}>{name}</span>
        </div>
      </td>
      <td className={`px-4 py-2.5 text-right font-mono text-sm font-bold tabular-nums ${valueColor}`}>
        {value}
      </td>
      <td className="px-4 py-2.5 text-[11px] transition-colors" style={{ color: 'var(--th-muted)' }}>
        {description}
      </td>
    </tr>
  );
}

const GREEKS_TOOLTIP =
  'Greeks measure option price sensitivity. Delta = price change per ₹1 move, Gamma = delta rate of change, Theta = time decay per day, Vega = P&L per 1% IV change.';

export function GreeksTable({ greeks, isDark: _isDark }: Props) {
  const thetaNegative = greeks.theta < 0;
  const vegaPositive  = greeks.vega >= 0;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr style={{ borderBottom: '1px solid var(--th-border)', background: 'var(--th-input)' }}>
          <th className="px-4 py-2.5 text-left">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--th-muted)' }}>
                Greek
              </span>
              <span title={GREEKS_TOOLTIP} className="cursor-help">
                <Info className="w-3 h-3 hover:opacity-70 transition-opacity" style={{ color: 'var(--th-muted)' }} />
              </span>
            </div>
          </th>
          <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--th-muted)' }}>
            Value
          </th>
          <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--th-muted)' }}>
            Interpretation
          </th>
        </tr>
      </thead>
      <tbody>
        <Row symbol="Δ" name="Delta" symbolColor="text-blue-400"
          value={fmtNum(greeks.delta, 4)} valueColor="text-blue-400"
          description={`₹${fmtNum(Math.abs(greeks.delta), 0)} position change per ₹1 move`} />
        <Row symbol="Γ" name="Gamma" symbolColor="text-purple-400"
          value={fmtNum(greeks.gamma, 5)} valueColor="text-purple-400"
          description="Rate of delta change per ₹1 underlying move" />
        <Row symbol="Θ" name="Theta" symbolColor="text-red-400"
          value={`${fmtINR(greeks.theta)}/day`}
          valueColor={thetaNegative ? 'text-red-400' : 'text-emerald-400'}
          description={thetaNegative ? 'Position loses this value each day' : 'Position gains this value each day'} />
        <Row symbol="V" name="Vega" symbolColor="text-emerald-400"
          value={`${fmtINR(greeks.vega)}/1%`}
          valueColor={vegaPositive ? 'text-emerald-400' : 'text-red-400'}
          description={vegaPositive ? 'Profits when IV rises 1%' : 'Loses when IV rises 1%'} />
      </tbody>
    </table>
  );
}
