import { TrendingUp, TrendingDown, Crosshair, Wallet, BarChart2, Percent } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { StrategyMetrics } from '@/types';

interface Props {
  metrics: StrategyMetrics;
  isDark: boolean;
}

function fmtINR(v: number | 'Unlimited'): string {
  if (v === 'Unlimited') return '∞ Unlimited';
  if (!Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtPrice(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 }).format(v);
}

interface CardProps {
  icon: LucideIcon;
  iconColor: string;
  label: string;
  value: string;
  valueColor: string;
  sub?: string;
  tooltip?: string;
}

function Card({ icon: Icon, iconColor, label, value, valueColor, sub, tooltip }: CardProps) {
  return (
    <div
      className="flex flex-col gap-2 p-3 rounded-xl transition-colors"
      style={{ background: 'var(--th-card)', border: '1px solid var(--th-border)' }}
    >
      <div className="flex items-center gap-2">
        <Icon className={`w-3 h-3 ${iconColor} shrink-0`} />
        <span
          className="text-xs font-medium uppercase tracking-wide leading-none"
          title={tooltip}
          style={{
            color: 'var(--th-muted)',
            ...(tooltip ? { cursor: 'help', textDecorationLine: 'underline', textDecorationStyle: 'dotted' } : {}),
          }}
        >
          {label}
        </span>
      </div>
      <p className={`text-sm font-bold leading-tight ${valueColor} truncate`}>{value}</p>
      {sub && <p className="text-xs leading-none" style={{ color: 'var(--th-muted)' }}>{sub}</p>}
    </div>
  );
}

export function SummaryPanel({ metrics }: Props) {
  const { maxProfit, maxLoss, breakevenPoints, netPremium, probabilityOfProfit } = metrics;

  // Risk:Reward = how much you risk per ₹1 of potential profit
  // e.g. Iron Condor: risk ₹8k to make ₹42k → 1 : 0.19
  const rrRatio =
    maxProfit !== 'Unlimited' && maxLoss !== 'Unlimited' && maxProfit !== 0 &&
      Number.isFinite(maxProfit) && Number.isFinite(maxLoss)
      ? `1 : ${(Math.abs(maxLoss as number) / Math.abs(maxProfit as number)).toFixed(2)}`
      : '—';

  const isCredit = netPremium >= 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      <Card
        icon={TrendingUp}
        iconColor="text-positive"
        label="Max Profit"
        value={fmtINR(maxProfit)}
        valueColor={
          maxProfit === 'Unlimited' || (maxProfit as number) >= 0
            ? 'text-positive'
            : 'text-negative'
        }
      />
      <Card
        icon={TrendingDown}
        iconColor="text-negative"
        label="Max Loss"
        value={fmtINR(maxLoss)}
        valueColor={
          maxLoss === 'Unlimited' || (maxLoss as number) < 0
            ? 'text-negative'
            : 'text-positive'
        }
      />
      <Card
        icon={Crosshair}
        iconColor="text-muted-foreground"
        label="Breakeven"
        value={
          breakevenPoints.length === 0
            ? '—'
            : breakevenPoints.map((b) => `₹${fmtPrice(b)}`).join(' · ')
        }
        valueColor="text-foreground"
      />
      <Card
        icon={Wallet}
        iconColor={isCredit ? 'text-positive' : 'text-negative'}
        label={isCredit ? 'Credit Received' : 'Debit Paid'}
        value={fmtINR(Math.abs(netPremium))}
        valueColor={isCredit ? 'text-positive' : 'text-negative'}
      />
      <Card
        icon={BarChart2}
        iconColor="text-muted-foreground"
        label="Risk / Reward"
        value={rrRatio}
        valueColor="text-foreground"
        tooltip="Amount risked per ₹1 of potential profit. Lower = better risk efficiency."
      />
      <Card
        icon={Percent}
        iconColor="text-muted-foreground"
        label="Prob. of Profit"
        value={Number.isFinite(probabilityOfProfit) ? `${probabilityOfProfit.toFixed(1)}%` : '—'}
        valueColor={probabilityOfProfit >= 50 ? 'text-positive' : 'text-foreground'}
        sub="Lognormal model estimate"
        tooltip="Approximate risk-neutral probability for one futures contract and expiry, using quantity-weighted RMS implied volatility. Unavailable for mixed futures or expiries."
      />
    </div>
  );
}
