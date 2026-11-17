import { AlertTriangle } from 'lucide-react';
import { calculateMargin } from '@/lib/marginCalculator';
import type { OptionLeg } from '@/types';

interface Props {
  legs: OptionLeg[];
  futuresPrice: number;
  isDark: boolean;
}

function fmtINR(v: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(v);
}

interface LineProps { label: string; value: string; bold?: boolean; separator?: boolean }

function Line({ label, value, bold, separator }: LineProps) {
  return (
    <div
      className="flex items-center justify-between py-2 px-4"
      style={{
        borderTop: separator ? '1px solid var(--th-border)' : undefined,
        fontWeight: bold ? 700 : 400,
      }}
    >
      <span className="text-xs" style={{ color: bold ? 'var(--th-text)' : 'var(--th-muted)' }}>
        {label}
      </span>
      <span
        className={`text-xs tabular-nums ${bold ? 'text-base' : ''}`}
        style={{ color: 'var(--th-text)', fontWeight: bold ? 700 : 500 }}
      >
        {value}
      </span>
    </div>
  );
}

export function MarginPanel({ legs, futuresPrice }: Props) {
  if (legs.length === 0) return null;

  const m = calculateMargin(legs, futuresPrice);

  const hasSell = legs.some(l => l.positionType === 'SELL');
  if (!hasSell && m.premiumRequired === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--th-muted)' }}>
          Estimated Margin Required
        </p>
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg"
          style={{ background: 'color-mix(in srgb, var(--th-warning) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--th-warning) 35%, transparent)' }}>
          <AlertTriangle className="w-2.5 h-2.5 text-warning" />
          <span className="text-xs font-semibold text-warning">Estimate</span>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--th-border)', background: 'var(--th-card)' }}>
        {hasSell && (
          <>
            <Line label="SPAN Margin" value={fmtINR(m.spanMargin)} />
            <Line label="Exposure Margin" value={fmtINR(m.exposureMargin)} />
            <Line label="Total Margin" value={fmtINR(m.totalMargin)} separator />
          </>
        )}
        {m.premiumRequired > 0 && (
          <Line label="Premium (BUY legs)" value={fmtINR(m.premiumRequired)} />
        )}
        <Line
          label="Total Capital Required"
          value={fmtINR(m.totalCapitalRequired)}
          bold
          separator
        />

        <div className="px-4 py-2" style={{ borderTop: '1px solid var(--th-border)' }}>
          <p className="text-xs" style={{ color: 'var(--th-muted)' }}>
            Based on typical MCX margin rates. For exact figures, use the{' '}
            <a
              href="https://zerodha.com/margin-calculator/SPAN/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-brand-text"
            >
              Zerodha SPAN Calculator
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
