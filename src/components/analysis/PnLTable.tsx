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

/** Signed rupee amount; an amount that rounds to zero is shown as plain ₹0, never "-₹0". */
function fmtSigned(v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (Math.round(v) === 0) return '₹0';
  return `${v > 0 ? '+' : ''}${fmtINR(v)}`;
}

function fmtPrice(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 }).format(v);
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

export function PnLTable({ underlyingPrice, riskFreeRate, legs, breakevenPoints }: Props) {
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
    Math.round(v) === 0 ? 'var(--th-muted)' : v > 0 ? 'var(--th-positive)' : 'var(--th-negative)';

  const headerStyle: React.CSSProperties = {
    background: 'var(--th-input)',
    borderBottom: '1px solid var(--th-border)',
    color: 'var(--th-muted)',
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.03em',
    whiteSpace: 'nowrap',
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--th-muted)' }}>
          P&amp;L at Key Price Levels
        </p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showStrikes}
            onChange={e => setShowStrikes(e.target.checked)}
            className="w-4 h-4 accent-brand"
          />
          <span className="text-xs" style={{ color: 'var(--th-muted)' }}>Show strikes</span>
        </label>
      </div>

      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--th-border)', background: 'var(--th-card)' }}
      >
        <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={headerStyle}>
              <th className="px-2 sm:px-3 py-2 text-left">Price</th>
              <th className="px-2 sm:px-3 py-2 text-right">Move</th>
              <th className="px-2 sm:px-3 py-2 text-right">Expiry P&amp;L</th>
              <th className="px-2 sm:px-3 py-2 text-right" title="Theoretical P&L from the Black-76 model">Model P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const rowBg = row.isCMP
                ? 'color-mix(in srgb, var(--th-accent) 10%, transparent)'
                : 'transparent';
              const borderLeft = row.isBreakeven
                ? '3px solid var(--th-warning)'
                : row.isStrike
                  ? '3px solid var(--th-border2)'
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
                  <td className="px-2 sm:px-3 py-2 whitespace-nowrap" style={{ color: 'var(--th-text)' }}>
                    {row.isCMP && (
                      <span className="mr-1 text-brand-text font-bold">▶</span>
                    )}
                    ₹{fmtPrice(row.price)}
                    {row.isBreakeven && (
                      <span className="ml-1 text-xs font-semibold text-warning">BE</span>
                    )}
                  </td>
                  <td className="px-2 sm:px-3 py-2 text-right whitespace-nowrap tabular-nums" style={{ color: 'var(--th-muted)' }}>
                    {row.movePercent >= 0 ? '+' : ''}{row.movePercent.toFixed(1)}%
                  </td>
                  <td className="px-2 sm:px-3 py-2 text-right whitespace-nowrap tabular-nums font-semibold"
                    style={{ color: pnlColor(row.expiryPnL) }}>
                    {fmtSigned(row.expiryPnL)}
                  </td>
                  <td className="px-2 sm:px-3 py-2 text-right whitespace-nowrap tabular-nums"
                    style={{ color: pnlColor(row.currentPnL) }}>
                    {fmtSigned(row.currentPnL)}
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
