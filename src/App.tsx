import { useState, useMemo, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { StrategyBuilder } from '@/components/strategy/StrategyBuilder';
import { DraftRecoveryDialog } from '@/components/strategy/DraftRecoveryDialog';
import { PayoffChart } from '@/components/chart/PayoffChart';
import { SummaryPanel } from '@/components/analysis/SummaryPanel';
import { GreeksTable } from '@/components/analysis/GreeksTable';
import { PnLTable } from '@/components/analysis/PnLTable';
import { MarginPanel } from '@/components/analysis/MarginPanel';
import { generatePayoffData, calculateMetrics } from '@/lib/payoff';
import { calculatePositionGreeks } from '@/lib/greeks';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { useStrategyDraft } from '@/hooks/useStrategyDraft';
import { useMarketData } from '@/hooks/useMarketData';
import { MarketDataPanel } from '@/components/market/MarketDataPanel';
import { expiryTime, marketPnL, matchesMarketContract, refreshMarketModel } from '@/lib/marketData';
import type { OptionLeg } from '@/types';
import { buildStrategyLegs } from '@/lib/strategies';
import { ArrowRight, BarChart3, MousePointerClick, Radio, Sparkles } from 'lucide-react';

const money = (value: number | null | undefined) => value == null ? '—' :
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);

export default function App() {
  const { isDark, toggleTheme } = useTheme();
  const { session, user, loading, passwordRecovery, signOut } = useAuth();

  const [legs, setLegs] = useState<OptionLeg[]>([]);
  const [underlyingPrice, setUnderlyingPrice] = useState(74000);
  const [riskFreeRate, setRiskFreeRate] = useState(6.5);
  const [watchIds, setWatchIds] = useState<number[]>([]);
  const [followMarket, setFollowMarket] = useState(true);
  const [namedStrategyActive, setNamedStrategyActive] = useState(false);
  const [lastModelUpdate, setLastModelUpdate] = useState<number | null>(null);
  const currentUserId = user?.id ?? null;
  const [activeUserId, setActiveUserId] = useState(currentUserId);
  useEffect(() => {
    const nextUserId = user?.id ?? null;
    if (activeUserId === nextUserId) return;
    const timer = setTimeout(() => {
      setLegs([]);
      setUnderlyingPrice(74000);
      setRiskFreeRate(6.5);
      setWatchIds([]);
      setFollowMarket(true);
      setNamedStrategyActive(false);
      setLastModelUpdate(null);
      setActiveUserId(nextUserId);
    }, 0);
    return () => clearTimeout(timer);
  }, [activeUserId, user?.id]);
  const draft = useStrategyDraft({
    userId: currentUserId,
    legs,
    underlyingPrice,
    riskFreeRate,
    followMarket,
    disabled: namedStrategyActive,
    onRestore: (snapshot) => {
      setNamedStrategyActive(false);
      setLegs(snapshot.legs.map(leg => ({ ...leg, id: crypto.randomUUID() })));
      setUnderlyingPrice(snapshot.underlyingPrice);
      setRiskFreeRate(snapshot.riskFreeRate);
      setFollowMarket(snapshot.followMarket);
      setLastModelUpdate(null);
    },
  });
  const market = useMarketData([...watchIds, ...legs.flatMap(leg => leg.marketContract
    ? [leg.marketContract.instrumentId, leg.marketContract.underlyingInstrumentId] : [])], (quotes, now, contracts) => {
    if (!followMarket || legs.some(leg => !matchesMarketContract(leg, contracts.find(c => c.id === leg.marketContract?.instrumentId)))) return;
    const snapshot = refreshMarketModel(legs, quotes, riskFreeRate, now);
    if (!snapshot) return;
    setLegs(snapshot.legs);
    setUnderlyingPrice(snapshot.underlyingPrice);
    setLastModelUpdate(Math.min(...snapshot.legs.flatMap(leg => [
      Date.parse(quotes[leg.marketContract!.instrumentId].receivedAt),
      Date.parse(quotes[leg.marketContract!.underlyingInstrumentId].receivedAt),
    ])));
  }, { active: Boolean(session), accessToken: session?.access_token });
  const underlyingId = legs[0]?.marketContract?.underlyingInstrumentId;
  const analysisPrice = underlyingPrice;
  const analysisLegs = legs;
  const modelIsCurrent = followMarket && market.enabled && !market.error && lastModelUpdate !== null && market.now - lastModelUpdate <= 15_000;

  const payoffData = useMemo(
    () => generatePayoffData({ underlyingPrice: analysisPrice, riskFreeRate, legs: analysisLegs }),
    [analysisPrice, riskFreeRate, analysisLegs]
  );

  const metrics = useMemo(() => calculateMetrics(payoffData, analysisLegs, { underlyingPrice: analysisPrice, riskFreeRate }),
    [payoffData, analysisLegs, analysisPrice, riskFreeRate]);

  const greeks = useMemo(
    () => calculatePositionGreeks(analysisLegs, analysisPrice, riskFreeRate),
    [analysisLegs, analysisPrice, riskFreeRate]
  );

  const instrumentName = legs[0]?.instrument.name ?? 'MCX';
  const hasStrategy = legs.length > 0;
  const hasLinkedLegs = analysisLegs.some(leg => !!leg.marketContract);
  const validMarketLegs = analysisLegs.every(leg => matchesMarketContract(
    leg, market.contracts.find(contract => contract.id === leg.marketContract?.instrumentId),
  ));
  const liveMarketPnl = useMemo(() => {
    if (!market.enabled || !!market.error || !validMarketLegs) return null;
    return marketPnL(analysisLegs, market.quotes, market.now);
  }, [analysisLegs, market.enabled, market.error, market.now, market.quotes, validMarketLegs]);

  function jumpTo(id: string) {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => target.querySelector<HTMLElement>('button, input, select')?.focus(), 300);
  }

  return (
    <AuthGuard
      session={session}
      loading={loading}
      passwordRecovery={passwordRecovery}
      isDark={isDark}
      onToggleTheme={toggleTheme}
    >
      <>
      {activeUserId === currentUserId && <>
      {draft.pendingDraft && (
        <DraftRecoveryDialog
          draft={draft.pendingDraft}
          onRestore={draft.restoreDraft}
          onDiscard={draft.discardDraft}
        />
      )}
      <div
      className="flex min-w-0 flex-col min-h-screen overflow-x-hidden lg:h-screen lg:overflow-hidden transition-colors duration-300"
      style={{ background: 'var(--th-bg)', color: 'var(--th-text)' }}
    >
      {/* 3px gradient accent bar */}
      <div
        className="h-[3px] shrink-0"
        style={{ background: 'linear-gradient(90deg, #2979ff 0%, #7c3aed 50%, #2979ff 100%)' }}
      />

      <Header
        isDark={isDark}
        onToggleTheme={toggleTheme}
        marketConnected={market.enabled && market.status?.connected === true && !market.error}
        userEmail={user?.email}
        onSignOut={signOut}
      />

      <div className="flex min-w-0 flex-col lg:flex-row lg:flex-1 lg:overflow-hidden">

        {/* ── Left: full-width on mobile, 420px fixed on desktop ── */}
        <div
          className="w-full min-w-0 lg:w-[420px] lg:shrink-0 lg:overflow-y-auto transition-colors duration-300 border-b lg:border-b-0 lg:border-r"
          style={{ borderColor: 'var(--th-border)' }}
        >
          <div className="px-4 pt-4 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-400">Strategy workspace</p>
            <div className="mt-1 flex items-end justify-between gap-3">
              <h1 className="text-base font-semibold tracking-tight">Build your setup</h1>
              <span className="text-[10px]" style={{ color: 'var(--th-muted)' }}>{hasStrategy ? `${legs.length} leg${legs.length === 1 ? '' : 's'}` : 'Start here'}</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--th-muted)' }}>
              Start with live MCX quotes or model a scenario manually.
            </p>
            {draft.status !== 'idle' && (
              <p role="status" className="mt-2 text-[10px]" style={{ color: draft.syncError ? 'var(--th-warning)' : 'var(--th-muted)' }}>
                {draft.status === 'draft-found' ? 'Unsaved draft found' : draft.status === 'saving' ? 'Saving draft…' : 'Draft saved'}
                {draft.lastSavedAt && draft.status === 'saved' && ` · ${new Date(draft.lastSavedAt).toLocaleTimeString('en-IN')}`}
                {draft.syncError && ' · local copy is safe; cloud sync unavailable'}
              </p>
            )}
          </div>

          <div id="live-market">
            <MarketDataPanel contracts={market.contracts} quotes={market.quotes} status={market.status}
              enabled={market.enabled} loading={market.loading} error={market.error} now={market.now}
              legs={legs} riskFreeRate={riskFreeRate} onConnect={market.connect}
              onWatchIds={setWatchIds}
              onAddLeg={(leg, futuresPrice) => {
                if (legs.length >= 20 || legs.some(existing =>
                  existing.marketContract?.underlyingInstrumentId !== leg.marketContract?.underlyingInstrumentId ||
                  expiryTime(existing.marketContract?.expiry ?? '') !== expiryTime(leg.marketContract?.expiry ?? ''))) return;
                setLegs(previous => previous.length >= 20 || previous.some(existing =>
                  existing.marketContract?.underlyingInstrumentId !== leg.marketContract?.underlyingInstrumentId ||
                  expiryTime(existing.marketContract?.expiry ?? '') !== expiryTime(leg.marketContract?.expiry ?? '')) ? previous : [...previous, leg]);
                setUnderlyingPrice(futuresPrice);
                setLastModelUpdate(null);
                setFollowMarket(true);
              }} />
          </div>
          {underlyingId && <div className="px-4 pt-3 flex items-center justify-between gap-2 text-xs">
            <span style={{ color: 'var(--th-muted)' }}>{!followMarket ? 'Frozen scenario inputs' : modelIsCurrent ? 'Model inputs follow quotes' : 'Waiting · holding last model inputs'}
              {lastModelUpdate !== null && <span className="block text-[10px]">As of {new Date(lastModelUpdate).toLocaleTimeString('en-IN')}</span>}</span>
            <button type="button" className="text-blue-400 underline" onClick={() => {
              if (followMarket) setFollowMarket(false); else { setFollowMarket(true); market.setEnabled(true); }
            }}>{followMarket ? 'Freeze snapshot' : 'Follow quotes'}</button>
          </div>}
          <div id="strategy-controls">
            <StrategyBuilder
              legs={analysisLegs}
              underlyingPrice={analysisPrice}
              riskFreeRate={riskFreeRate}
              followMarket={followMarket}
              isDark={isDark}
              userId={currentUserId}
              onStrategySaved={draft.clearDraft}
              onNamedStrategyChange={active => {
                setNamedStrategyActive(active);
                if (active) draft.clearDraft();
              }}
              onLegsChange={update => { setFollowMarket(false); setLegs(update); }}
              onUnderlyingChange={value => { setFollowMarket(false); setUnderlyingPrice(value); }}
              onRateChange={value => { setFollowMarket(false); setRiskFreeRate(value); }}
              onLoadSnapshot={(followLive = false) => {
                setFollowMarket(followLive);
                setLastModelUpdate(null);
                if (followLive) market.setEnabled(true);
              }}
            />
          </div>
        </div>

        {/* ── Right: chart → summary → greeks ── */}
        <div className="flex min-w-0 flex-1 flex-col p-3 lg:p-4 gap-4 lg:overflow-y-auto">
          {!hasStrategy ? (
            <section
              className="flex-1 min-h-[520px] rounded-xl border p-6 sm:p-10 flex items-center transition-colors duration-300"
              style={{ borderColor: 'var(--th-border)', background: isDark ? 'linear-gradient(145deg, #12122a 0%, #101020 100%)' : 'linear-gradient(145deg, #ffffff 0%, #f8f9ff 100%)' }}
              aria-label="Start building a strategy"
            >
              <div className="w-full max-w-3xl mx-auto">
                <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-400 bg-blue-500/10 border border-blue-500/20">
                  <Sparkles className="w-3.5 h-3.5" /> Ready when you are
                </div>
                <h2 className="mt-5 max-w-xl text-2xl sm:text-3xl font-semibold tracking-tight">Build your first MCX options strategy</h2>
                <p className="mt-3 max-w-xl text-sm leading-relaxed" style={{ color: 'var(--th-muted)' }}>
                  Choose a starting point and the payoff chart, P&amp;L, Greeks, and margin view will appear as you build.
                </p>

                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  <button type="button" onClick={() => {
                    const templateLegs = buildStrategyLegs('Long Call', analysisPrice, riskFreeRate);
                    setFollowMarket(false);
                    setLegs(templateLegs);
                    jumpTo('strategy-controls');
                  }} className="group text-left rounded-xl border p-4 transition-all hover:-translate-y-0.5 hover:border-blue-400/60 hover:bg-blue-500/5" style={{ borderColor: 'var(--th-border2)', background: 'var(--th-card)' }}>
                    <span className="flex items-center justify-between">
                      <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400"><Sparkles className="w-4 h-4" /></span>
                      <ArrowRight className="w-4 h-4 opacity-40 transition-transform group-hover:translate-x-1" />
                    </span>
                    <span className="mt-4 block text-sm font-semibold">Start with Long Call</span>
                    <span className="mt-1 block text-xs leading-relaxed" style={{ color: 'var(--th-muted)' }}>One click creates a simple bullish setup you can edit.</span>
                  </button>
                  <button type="button" onClick={() => jumpTo('live-market')} className="group text-left rounded-xl border p-4 transition-all hover:-translate-y-0.5 hover:border-emerald-400/60 hover:bg-emerald-500/5" style={{ borderColor: 'var(--th-border2)', background: 'var(--th-card)' }}>
                    <span className="flex items-center justify-between">
                      <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400"><Radio className="w-4 h-4" /></span>
                      <ArrowRight className="w-4 h-4 opacity-40 transition-transform group-hover:translate-x-1" />
                    </span>
                    <span className="mt-4 block text-sm font-semibold">Use live quotes</span>
                    <span className="mt-1 block text-xs leading-relaxed" style={{ color: 'var(--th-muted)' }}>Connect Eureka and add a quoted contract at bid or ask.</span>
                  </button>
                  <button type="button" onClick={() => jumpTo('strategy-controls')} className="group text-left rounded-xl border p-4 transition-all hover:-translate-y-0.5 hover:border-violet-400/60 hover:bg-violet-500/5" style={{ borderColor: 'var(--th-border2)', background: 'var(--th-card)' }}>
                    <span className="flex items-center justify-between">
                      <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-violet-500/15 text-violet-400"><MousePointerClick className="w-4 h-4" /></span>
                      <ArrowRight className="w-4 h-4 opacity-40 transition-transform group-hover:translate-x-1" />
                    </span>
                    <span className="mt-4 block text-sm font-semibold">Build manually</span>
                    <span className="mt-1 block text-xs leading-relaxed" style={{ color: 'var(--th-muted)' }}>Add legs one by one and tune strikes, IV, expiry, and lots.</span>
                  </button>
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'var(--th-muted)' }}>
                  <BarChart3 className="w-4 h-4 text-blue-400" />
                  <span>Once a leg is added:</span>
                  {['Payoff', 'P&L', 'Greeks', 'Margin'].map(item => <span key={item} className="rounded-full px-2.5 py-1 border" style={{ borderColor: 'var(--th-border2)' }}>{item}</span>)}
                </div>
              </div>
            </section>
          ) : <>
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
                underlyingPrice={analysisPrice}
                instrument={instrumentName}
                breakevenPoints={metrics.breakevenPoints}
                legs={analysisLegs}
                isDark={isDark}
              />
            </div>

            {hasLinkedLegs && <section className="flex flex-col gap-2.5" aria-label="Market P&L estimate">
              <div
                className="rounded-xl border px-4 py-3 transition-colors duration-300"
                style={{ borderColor: 'var(--th-border)', background: 'var(--th-card)' }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--th-muted)' }}>
                      Market P&amp;L estimate
                    </p>
                    <p className="mt-1 text-[11px]" style={{ color: 'var(--th-muted)' }}>
                      Based on each leg&apos;s last traded price (LTP). Excludes fees and slippage.
                    </p>
                  </div>
                  <strong
                    className="shrink-0 text-lg tabular-nums"
                    style={{ color: liveMarketPnl == null ? 'var(--th-muted)' : liveMarketPnl >= 0 ? 'var(--th-positive)' : 'var(--th-negative)' }}
                  >
                    {money(liveMarketPnl)}
                  </strong>
                </div>
                {market.contracts.length > 0 && !validMarketLegs && (
                  <p className="mt-2 text-xs" style={{ color: 'var(--th-warning)' }}>
                    A saved contract no longer matches the current contract master. Rebuild those legs from the selector to resume live analysis.
                  </p>
                )}
                {liveMarketPnl === null && validMarketLegs && (
                  <p className="mt-2 text-[10px]" style={{ color: 'var(--th-muted)' }}>
                    Waiting for fresh quotes for every leg.
                  </p>
                )}
              </div>
            </section>}

            {/* P&L Table */}
            <PnLTable
              underlyingPrice={analysisPrice}
              riskFreeRate={riskFreeRate}
              legs={analysisLegs}
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
              <MarginPanel legs={analysisLegs} futuresPrice={analysisPrice} isDark={isDark} />
            </section>
          </>}

        </div>
      </div>
      </div>
      </>
      }
      </>
    </AuthGuard>
  );
}
