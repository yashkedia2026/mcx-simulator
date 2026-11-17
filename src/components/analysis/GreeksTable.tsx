import { Info } from 'lucide-react';
import type { Greeks } from '@/types';

interface Props {
  greeks: Greeks;
  isDark: boolean;
}

function fmtNum(v: number, d = 4) {
  if (!Number.isFinite(v)) return '—';
  return v.toFixed(d);
}

function fmtINR(v: number) {
  if (!Number.isFinite(v)) return '—';
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
      <td className="px-4 py-3 w-28">
        <div className="flex items-center gap-2">
          <span className={`text-base font-bold leading-none ${symbolColor} w-4 text-center`}>{symbol}</span>
          <span className="text-xs font-medium" style={{ color: 'var(--th-muted)' }}>{name}</span>
        </div>
      </td>
      <td className={`px-4 py-3 text-right text-sm font-bold tabular-nums ${valueColor}`}>
        {value}
      </td>
      <td className="px-4 py-3 text-xs transition-colors hidden sm:table-cell" style={{ color: 'var(--th-muted)' }}>
        {description}
      </td>
    </tr>
  );
}

const GREEKS_TOOLTIP =
  'Greeks measure option price sensitivity. Delta = price change per ₹1 move, Gamma = delta rate of change, Theta = time decay per day, Vega = P&L per 1% IV change.';

export function GreeksTable({ greeks }: Props) {
  const thetaNegative = greeks.theta < 0;
  const vegaPositive  = greeks.vega >= 0;

  return (
    <table className="w-full text-sm min-w-[280px]">
      <thead>
        <tr style={{ borderBottom: '1px solid var(--th-border)', background: 'var(--th-input)' }}>
          <th className="px-4 py-3 text-left">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--th-muted)' }}>
                Greek
              </span>
              <span title={GREEKS_TOOLTIP} className="cursor-help">
                <Info className="w-3 h-3 hover:opacity-70 transition-opacity" style={{ color: 'var(--th-muted)' }} />
              </span>
            </div>
          </th>
          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--th-muted)' }}>
            Value
          </th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide hidden sm:table-cell" style={{ color: 'var(--th-muted)' }}>
            Interpretation
          </th>
        </tr>
      </thead>
      <tbody>
        <Row symbol="Δ" name="Delta" symbolColor="text-muted-foreground"
          value={fmtNum(greeks.delta, 4)} valueColor="text-foreground"
          description={Number.isFinite(greeks.delta) ? `₹${fmtNum(Math.abs(greeks.delta), 0)} position change per ₹1 move` : 'Unavailable for these model inputs'} />
        <Row symbol="Γ" name="Gamma" symbolColor="text-muted-foreground"
          value={fmtNum(greeks.gamma, 5)} valueColor="text-foreground"
          description="Rate of delta change per ₹1 underlying move" />
        <Row symbol="Θ" name="Theta" symbolColor="text-muted-foreground"
          value={Number.isFinite(greeks.theta) ? `${fmtINR(greeks.theta)}/day` : '—'}
          valueColor={!Number.isFinite(greeks.theta) ? 'text-muted-foreground' : thetaNegative ? 'text-negative' : 'text-positive'}
          description={!Number.isFinite(greeks.theta) ? 'Unavailable for these model inputs' : thetaNegative ? 'Position loses this value each day' : 'Position gains this value each day'} />
        <Row symbol="V" name="Vega" symbolColor="text-muted-foreground"
          value={Number.isFinite(greeks.vega) ? `${fmtINR(greeks.vega)}/1%` : '—'}
          valueColor={!Number.isFinite(greeks.vega) ? 'text-muted-foreground' : vegaPositive ? 'text-positive' : 'text-negative'}
          description={!Number.isFinite(greeks.vega) ? 'Unavailable for these model inputs' : vegaPositive ? 'Profits when IV rises 1%' : 'Loses when IV rises 1%'} />
      </tbody>
    </table>
  );
}
