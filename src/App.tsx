import { useState, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { StrategyBuilder } from '@/components/strategy/StrategyBuilder';
import { PayoffChart } from '@/components/chart/PayoffChart';
import { SummaryPanel } from '@/components/analysis/SummaryPanel';
import { GreeksTable } from '@/components/analysis/GreeksTable';
import { PnLTable } from '@/components/analysis/PnLTable';
import { MarginPanel } from '@/components/analysis/MarginPanel';
import { generatePayoffData, calculateMetrics } from '@/lib/payoff';
import { calculatePositionGreeks } from '@/lib/greeks';
import { useTheme } from '@/hooks/useTheme';
import type { OptionLeg } from '@/types';

export default function App() {
  const { isDark, toggleTheme } = useTheme();

  const [legs, setLegs] = useState<OptionLeg[]>([]);
  const [underlyingPrice, setUnderlyingPrice] = useState(74000);
  const [riskFreeRate, setRiskFreeRate] = useState(6.5);

  const payoffData = useMemo(
    () => generatePayoffData({ underlyingPrice, riskFreeRate, legs }),
    [underlyingPrice, riskFreeRate, legs]
  );

  const metrics = useMemo(() => calculateMetrics(payoffData, legs), [payoffData, legs]);

  const greeks = useMemo(
    () => calculatePositionGreeks(legs, underlyingPrice, riskFreeRate),
    [legs, underlyingPrice, riskFreeRate]
  );

  const instrumentName = legs[0]?.instrument.name ?? 'MCX';

  return (
    <div
      className="flex flex-col min-h-screen lg:h-screen lg:overflow-hidden transition-colors duration-300"
      style={{ background: 'var(--th-bg)', color: 'var(--th-text)' }}
    >
      {/* 3px gradient accent bar */}
      <div
        className="h-[3px] shrink-0"
        style={{ background: 'linear-gradient(90deg, #2979ff 0%, #7c3aed 50%, #2979ff 100%)' }}
      />

      <Header isDark={isDark} onToggleTheme={toggleTheme} />

      <div className="flex flex-col lg:flex-row lg:flex-1 lg:overflow-hidden">

        {/* ── Left: full-width on mobile, 420px fixed on desktop ── */}
        <div
          className="w-full lg:w-[420px] lg:shrink-0 lg:overflow-y-auto transition-colors duration-300 border-b lg:border-b-0 lg:border-r"
          style={{ borderColor: 'var(--th-border)' }}
        >
          <StrategyBuilder
            legs={legs}
            underlyingPrice={underlyingPrice}
            riskFreeRate={riskFreeRate}
            isDark={isDark}
            onLegsChange={setLegs}
            onUnderlyingChange={setUnderlyingPrice}
            onRateChange={setRiskFreeRate}
          />
        </div>

        {/* ── Right: chart → summary → greeks ── */}
        <div className="flex-1 flex flex-col p-3 lg:p-4 gap-4 lg:overflow-y-auto">

          {/* Chart */}
          <div
            className="shrink-0 rounded-xl overflow-hidden transition-colors duration-300 h-[260px] sm:h-[320px] lg:h-[380px]"
            style={{
              border: '1px solid var(--th-border)',
              background: isDark ? '#12122a' : '#ffffff',
            }}
          >
            <PayoffChart
              data={payoffData}
              underlyingPrice={underlyingPrice}
              instrument={instrumentName}
              breakevenPoints={metrics.breakevenPoints}
              legs={legs}
              isDark={isDark}
            />
          </div>

          {/* P&L Table */}
          <PnLTable
            underlyingPrice={underlyingPrice}
            riskFreeRate={riskFreeRate}
            legs={legs}
            breakevenPoints={metrics.breakevenPoints}
            isDark={isDark}
          />

          {/* Strategy Summary */}
          <section className="flex flex-col gap-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--th-muted)' }}>
              Strategy Summary
            </p>
            <SummaryPanel metrics={metrics} isDark={isDark} />
          </section>

          {/* Position Greeks */}
          <section className="flex flex-col gap-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--th-muted)' }}>
              Position Greeks
            </p>
            <div
              className="rounded-xl overflow-hidden transition-colors duration-300"
              style={{ background: 'var(--th-card)', border: '1px solid var(--th-border)' }}
            >
              <GreeksTable greeks={greeks} isDark={isDark} />
            </div>
          </section>

          {/* Margin Calculator */}
          <section className="pb-4">
            <MarginPanel legs={legs} futuresPrice={underlyingPrice} isDark={isDark} />
          </section>

        </div>
      </div>
    </div>
  );
}
