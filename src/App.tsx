import { useState, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { StrategyBuilder } from '@/components/strategy/StrategyBuilder';
import { PayoffChart } from '@/components/chart/PayoffChart';
import { SummaryPanel } from '@/components/analysis/SummaryPanel';
import { GreeksTable } from '@/components/analysis/GreeksTable';
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
      className="flex flex-col h-screen overflow-hidden transition-colors duration-300"
      style={{ background: 'var(--th-bg)', color: 'var(--th-text)' }}
    >
      {/* 3px gradient accent bar */}
      <div
        className="h-[3px] shrink-0"
        style={{ background: 'linear-gradient(90deg, #2979ff 0%, #7c3aed 50%, #2979ff 100%)' }}
      />

      <Header isDark={isDark} onToggleTheme={toggleTheme} />

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: scrollable strategy builder ── */}
        <div
          className="w-[420px] shrink-0 overflow-y-auto transition-colors duration-300"
          style={{ borderRight: '1px solid var(--th-border)' }}
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
        <div className="flex-1 flex flex-col overflow-y-auto p-4 gap-4">

          {/* Chart */}
          <div
            className="shrink-0 rounded-xl overflow-hidden transition-colors duration-300"
            style={{
              height: 380,
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

          {/* Strategy Summary */}
          <section className="flex flex-col gap-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--th-muted)' }}>
              Strategy Summary
            </p>
            <SummaryPanel metrics={metrics} isDark={isDark} />
          </section>

          {/* Position Greeks */}
          <section className="flex flex-col gap-2.5 pb-4">
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

        </div>
      </div>
    </div>
  );
}
