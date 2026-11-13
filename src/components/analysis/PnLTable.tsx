import { useState, useMemo } from 'react';
import { calculatePnLAtPrice } from '@/lib/payoff';
import type { OptionLeg } from '@/types';

interface Props {
  underlyingPrice: number;
  riskFreeRate: number;
  legs: OptionLeg[];
  breakevenPoints: number[];
  isDark: boolean;
}

function fmtINR(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(v);
}

function fmtPrice(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 4 }).format(v);
}

interface PnLRow {
  price: number;
  movePercent: number;
  expiryPnL: number;
  currentPnL: number;
  isCMP: boolean;
  isBreakeven: boolean;
  isStrike: boolean;
}

export function PnLTable({ underlyingPrice, riskFreeRate, legs, breakevenPoints, isDark }: Props) {
  const [showStrikes, setShowStrikes] = useState(true);

  const rows = useMemo<PnLRow[]>(() => {
    if (legs.length === 0) return [];

    const prices = new Set<number>();

    // CMP ±5%, ±10%, ±15%, ±20%
    for (const pct of [0.80, 0.85, 0.90, 0.95, 1.00, 1.05, 1.10, 1.15, 1.20]) {
      prices.add(underlyingPrice * pct);
    }

    // Compute P&L at exact breakevens; round only the displayed price.
    for (const be of breakevenPoints) prices.add(be);

    // Strike prices from legs
    for (const leg of legs) prices.add(leg.strikePrice);

    const strikeSet = new Set(legs.map(l => l.strikePrice));
    const beSet = new Set(breakevenPoints);

    return [...prices]
      .sort((a, b) => a - b)
      .map(price => {
        const { expiryPnL, currentPnL } = calculatePnLAtPrice(price, legs, riskFreeRate);
        return {
          price,
          movePercent: ((price - underlyingPrice) / underlyingPrice) * 100,
          expiryPnL,
          currentPnL,
          isCMP: price === underlyingPrice,
          isBreakeven: beSet.has(price),
          isStrike: strikeSet.has(price),
        };
      })
      .filter(row => showStrikes || !row.isStrike || row.isCMP || row.isBreakeven);
  }, [underlyingPrice, riskFreeRate, legs, breakevenPoints, showStrikes]);

  if (legs.length === 0) return null;

  const pnlColor = (v: number) =>
    v > 0 ? 'var(--th-positive)' : v < 0 ? 'var(--th-negative)' : 'var(--th-muted)';

  const headerStyle: React.CSSProperties = {
    background: 'var(--th-input)',
    borderBottom: '1px solid var(--th-border)',
    color: 'var(--th-muted)',
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--th-muted)' }}>
          P&amp;L at Key Price Levels
        </p>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={showStrikes}
            onChange={e => setShowStrikes(e.target.checked)}
            className="w-3 h-3 accent-blue-500"
          />
          <span className="text-[10px]" style={{ color: 'var(--th-muted)' }}>Show strikes</span>
        </label>
      </div>

      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--th-border)', background: 'var(--th-card)' }}
      >
        <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[360px]">
          <thead>
            <tr style={headerStyle}>
              <th className="px-3 py-2 text-left">Price</th>
              <th className="px-3 py-2 text-right">Move</th>
              <th className="px-3 py-2 text-right">Expiry P&amp;L</th>
              <th className="px-3 py-2 text-right" title="Theoretical P&L from the Black-76 model">Model P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const rowBg = row.isCMP
                ? isDark ? 'rgba(41,121,255,0.12)' : 'rgba(41,121,255,0.07)'
                : 'transparent';
              const borderLeft = row.isBreakeven
                ? '3px solid #fbbf24'
                : row.isStrike
                  ? `3px solid ${isDark ? '#374151' : '#d1d5db'}`
                  : '3px solid transparent';

              return (
                <tr
                  key={row.price}
                  style={{
                    background: rowBg,
                    borderLeft,
                    borderBottom: '1px solid var(--th-border)',
                    fontWeight: row.isCMP ? 700 : 400,
                  }}
                >
                  <td className="px-3 py-1.5" style={{ color: 'var(--th-text)' }}>
                    {row.isCMP && (
                      <span className="mr-1 text-blue-400 font-bold">▶</span>
                    )}
                    ₹{fmtPrice(row.price)}
                    {row.isBreakeven && (
                      <span className="ml-1 text-[9px] font-semibold text-yellow-400">BE</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: 'var(--th-muted)' }}>
                    {row.movePercent >= 0 ? '+' : ''}{row.movePercent.toFixed(1)}%
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-mono font-semibold"
                    style={{ color: pnlColor(row.expiryPnL) }}>
                    {row.expiryPnL >= 0 ? '+' : ''}{fmtINR(row.expiryPnL)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-mono"
                    style={{ color: pnlColor(row.currentPnL) }}>
                    {row.currentPnL >= 0 ? '+' : ''}{fmtINR(row.currentPnL)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
