import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Radio, RefreshCw } from 'lucide-react';
import type { OptionLeg, PositionType } from '@/types';
import type { MarketContract, MarketQuote, MarketStatus } from '@/types/market';
import { createMarketLeg, expiryTime, isFreshQuote, marketPnL, matchesMarketContract, quoteMark } from '@/lib/marketData';
import { isNonAgriculturalSymbol } from '@/lib/commodities';

interface Props {
  contracts: MarketContract[];
  quotes: Record<number, MarketQuote>;
  status: MarketStatus | null;
  enabled: boolean;
  loading: boolean;
  error: string;
  now: number;
  legs: OptionLeg[];
  riskFreeRate: number;
  onConnect: () => void;
  onWatchIds: (ids: number[]) => void;
  onAddLeg: (leg: OptionLeg, futuresPrice: number) => void;
}

const money = (value: number | null | undefined) => value == null ? '—' :
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
const dateLabel = (expiry: string) => new Date(expiryTime(expiry)).toLocaleDateString('en-IN',
  { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

interface MarketOption {
  value: string;
  label: string;
}

interface MarketComboBoxProps {
  id: string;
  value: string;
  options: MarketOption[];
  ariaLabel: string;
  className: string;
  style: React.CSSProperties;
  onChange: (value: string) => void;
}

/**
 * A text-backed select keeps the compact select appearance while making long
 * market lists usable from the keyboard. Users can type to jump to a value,
 * use ArrowDown to open the browser suggestions, and press Enter to commit.
 */
function MarketComboBox({ id, value, options, ariaLabel, className, style, onChange }: MarketComboBoxProps) {
  const selectedLabel = options.find(option => option.value === value)?.label ?? '';
  const [text, setText] = useState(selectedLabel);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(selectedLabel);
  }, [selectedLabel]);

  function commit(nextText: string) {
    const match = options.find(option => option.label.toLocaleLowerCase() === nextText.trim().toLocaleLowerCase());
    if (match) {
      onChange(match.value);
      setText(match.label);
    }
  }

  return (
    <div className="relative mt-1">
      <input
        type="text"
        id={id}
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        autoComplete="off"
        list={`${id}-options`}
        value={text}
        className={`${className} pr-8`}
        style={style}
        onFocus={event => {
          focused.current = true;
          event.currentTarget.select();
        }}
        onChange={event => {
          const nextText = event.target.value;
          setText(nextText);
          commit(nextText);
        }}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit(text);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setText(selectedLabel);
            event.currentTarget.blur();
          }
        }}
        onBlur={() => {
          commit(text);
          focused.current = false;
          setText(options.find(option => option.value === value)?.label ?? '');
        }}
      />
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--th-muted)' }} />
      <datalist id={`${id}-options`}>
        {options.map(option => <option key={option.value} value={option.label} />)}
      </datalist>
    </div>
  );
}

export function MarketDataPanel(props: Props) {
  const { contracts, quotes, status, enabled, loading, error, now, legs, riskFreeRate,
    onConnect, onWatchIds, onAddLeg } = props;
  const [symbolChoice, setSymbolChoice] = useState('GOLD');
  const [expiryChoice, setExpiryChoice] = useState('');
  const [kind, setKind] = useState<'CE' | 'PE'>('CE');
  const [optionChoice, setOptionChoice] = useState(0);
  const [lots, setLots] = useState(1);
  const [customEntryPrice, setCustomEntryPrice] = useState<{ optionId: number; value: number } | null>(null);
  const [addError, setAddError] = useState('');
  const available = contracts.filter(c => c.kind !== 'FUT' && isNonAgriculturalSymbol(c.symbol) && expiryTime(c.expiry) > now);
  const symbols = [...new Set(available.map(c => c.symbol))].sort();
  const symbol = symbols.includes(symbolChoice) ? symbolChoice : symbols[0] ?? '';
  const expiries = [...new Set(available.filter(c => c.symbol === symbol).map(c => c.expiry))]
    .sort((a, b) => expiryTime(a) - expiryTime(b));
  const expiry = expiries.includes(expiryChoice) ? expiryChoice : expiries[0] ?? '';
  const options = available.filter(c => c.symbol === symbol && c.expiry === expiry && c.kind === kind)
    .sort((a, b) => (a.strike ?? 0) - (b.strike ?? 0));
  const option = options.find(c => c.id === optionChoice) ?? options[Math.floor(options.length / 2)];
  const future = option && contracts.find(c => c.id === option.underlyingId && c.kind === 'FUT' && c.symbol === option.symbol);
  const optionId = option?.id;
  const futureId = future?.id;
  useEffect(() => {
    onWatchIds([optionId, futureId].filter((id): id is number => id !== undefined));
  }, [optionId, futureId, onWatchIds]);

  const quote = option && quotes[option.id];
  const futureQuote = future && quotes[future.id];
  const liveLtp = isFreshQuote(quote, now) && quote?.lastPrice != null ? quote.lastPrice : quoteMark(quote);
  const entryPrice = option && customEntryPrice?.optionId === option.id ? customEntryPrice.value : liveLtp;
  const ready = enabled && !error && isFreshQuote(quote, now) && isFreshQuote(futureQuote, now);
  const compatible = !legs.length || legs.every(leg => leg.marketContract &&
    leg.marketContract.underlyingInstrumentId === future?.id && option && expiryTime(leg.marketContract.expiry) === expiryTime(option.expiry));
  const validLegs = legs.every(leg => matchesMarketContract(leg, contracts.find(c => c.id === leg.marketContract?.instrumentId)));
  const pnl = enabled && !error && validLegs ? marketPnL(legs, quotes, now) : null;
  const hasLinkedLegs = legs.some(leg => leg.marketContract);
  const selectStyle = { background: 'var(--th-input)', border: '1px solid var(--th-border2)', color: 'var(--th-text)' };
  const selectClass = 'w-full rounded-md px-2 py-2 text-xs min-w-0 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-colors';
  let connectionLabel = 'Not connected';
  if (enabled) connectionLabel = error ? 'Connection issue' : ready ? 'Receiving quotes' : 'Waiting for quotes';
  else if (contracts.length) connectionLabel = 'Ready';

  function add(position: PositionType) {
    setAddError('');
    try {
      if (legs.length >= 20) throw new Error('A strategy can contain up to 20 legs.');
      if (!option || !future || !quote || !futureQuote || !compatible) throw new Error('Select a compatible quoted contract.');
      const leg = createMarketLeg(option, future, quote, futureQuote, position, riskFreeRate, undefined, lots, entryPrice ?? undefined);
      onAddLeg(leg, quoteMark(futureQuote)!);
    } catch (err) { setAddError(err instanceof Error ? err.message : 'Could not add this contract.'); }
  }

  return <section className="mx-4 mt-4 rounded-xl p-3 flex flex-col gap-3" aria-label="Eureka market data"
    style={{ border: '1px solid var(--th-border2)', background: 'var(--th-card)' }}>
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2"><Radio size={15} className="text-blue-400" />
        <div>
          <span className="block text-xs font-semibold">Live MCX prices</span>
          <span className="block text-[10px]" style={{ color: 'var(--th-muted)' }}>Eureka connection</span>
        </div></div>
      <span className="text-[10px]" style={{ color: ready ? 'var(--th-positive)' : 'var(--th-muted)' }}>{connectionLabel}</span>
    </div>
    {loading && <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs" style={{ borderColor: 'var(--th-border2)', color: 'var(--th-muted)' }}>
      <RefreshCw size={12} className="animate-spin" /> Connecting to Eureka automatically…
    </div>}
    {error && <button type="button" onClick={onConnect} disabled={loading}
      className="flex items-center justify-center gap-1.5 rounded-md bg-blue-600 py-2 text-xs text-white disabled:opacity-50">
      <RefreshCw size={12} /> Retry live connection
    </button>}
    {status && !status.configured && <p className="text-xs leading-relaxed" style={{ color: 'var(--th-muted)' }}>
      Manual simulation is available now. To use live prices, add your Eureka app key and secret to the market-data server environment. Credentials stay out of the browser.
    </p>}
    {!contracts.length && !error && <p className="text-[10px] leading-relaxed" style={{ color: 'var(--th-muted)' }}>
      Manual mode works without a website account. This sign-in only authenticates the server-side Eureka market-data connection.
    </p>}
    {error && <p role="status" className="text-xs" style={{ color: 'var(--th-warning)' }}>{error}</p>}
    {contracts.length > 0 && !symbols.length && <p className="text-xs" style={{ color: 'var(--th-warning)' }}>No unexpired MCX options were returned for this account.</p>}
    {symbols.length > 0 && <>
      {future ? <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: 'var(--th-border2)', background: 'var(--th-input)' }}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--th-muted)' }}>Selected future</span>
          <span className="text-[10px] font-semibold" style={{ color: isFreshQuote(futureQuote, now) ? 'var(--th-positive)' : 'var(--th-muted)' }}>{isFreshQuote(futureQuote, now) ? 'LIVE' : 'Waiting'}</span>
        </div>
        <strong className="mt-1 block text-2xl font-bold tracking-tight tabular-nums">{money(isFreshQuote(futureQuote, now) ? quoteMark(futureQuote) : null)}</strong>
        <span className="text-[10px]" style={{ color: 'var(--th-muted)' }}>{future.symbol} future · {dateLabel(future.expiry)}</span>
        <div className="mt-2 grid grid-cols-3 gap-2 border-t pt-2 text-center text-xs" style={{ borderColor: 'var(--th-border2)' }}>
          <div><span className="block text-[10px]" style={{ color: 'var(--th-muted)' }}>Bid</span><strong className="mt-0.5 block text-sm font-semibold tabular-nums">{money(quote?.bid)}</strong></div>
          <div><span className="block text-[10px]" style={{ color: 'var(--th-muted)' }}>Ask</span><strong className="mt-0.5 block text-sm font-semibold tabular-nums">{money(quote?.ask)}</strong></div>
          <div><span className="block text-[10px]" style={{ color: 'var(--th-muted)' }}>Last trade</span><strong className="mt-0.5 block text-sm font-semibold tabular-nums">{money(quote?.lastPrice)}</strong></div>
        </div>
      </div> : <p className="text-xs" style={{ color: 'var(--th-warning)' }}>The matching underlying future is unavailable in the contract master. This option cannot be linked safely.</p>}
    </>}
    {symbols.length > 0 && <>
      <div className="grid grid-cols-2 gap-2">
        <label htmlFor="market-commodity" className="text-[11px]">Commodity
          <MarketComboBox id="market-commodity" ariaLabel="Live commodity" value={symbol}
            options={symbols.map(s => ({ value: s, label: s }))} className={selectClass} style={selectStyle}
            onChange={next => { setSymbolChoice(next); setOptionChoice(0); setAddError(''); }} />
        </label>
        <label htmlFor="market-expiry" className="text-[11px]">Option expiry
          <MarketComboBox id="market-expiry" ariaLabel="Live option expiry" value={expiry}
            options={expiries.map(next => ({ value: next, label: dateLabel(next) }))} className={selectClass} style={selectStyle}
            onChange={next => { setExpiryChoice(next); setOptionChoice(0); setAddError(''); }} />
        </label>
        <label htmlFor="market-option-type" className="text-[11px]">Option type
          <MarketComboBox id="market-option-type" ariaLabel="Live option type" value={kind}
            options={[{ value: 'CE', label: 'Call · CE' }, { value: 'PE', label: 'Put · PE' }]} className={selectClass} style={selectStyle}
            onChange={next => { setKind(next as 'CE' | 'PE'); setOptionChoice(0); setAddError(''); }} />
        </label>
        <label htmlFor="market-strike" className="text-[11px]">Strike
          <MarketComboBox id="market-strike" ariaLabel="Live strike" value={option?.id == null ? '' : String(option.id)}
            options={options.map(c => ({ value: String(c.id), label: c.strike?.toLocaleString('en-IN') ?? String(c.id) }))} className={selectClass} style={selectStyle}
            onChange={next => { setOptionChoice(Number(next)); setAddError(''); }} />
        </label>
      </div>
      <label className="block text-[11px]">Lots to add
        <input type="number" min={1} max={1000} step={1} value={lots} inputMode="numeric" aria-label="Lots to add" className="mt-1 w-full rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" style={selectStyle}
          onFocus={event => event.currentTarget.select()}
          onChange={event => { const value = event.target.valueAsNumber; if (Number.isInteger(value) && value >= 1 && value <= 1000) setLots(value); }} />
      </label>
      <label className="block text-[11px]">Entry price / LTP <span style={{ color: 'var(--th-muted)' }}>(editable)</span>
        <input type="number" min={0.01} step="any" value={entryPrice ?? ''} inputMode="decimal" aria-label="Entry price or LTP" className="mt-1 w-full rounded-md px-2 py-2 text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/50" style={selectStyle}
          onFocus={event => event.currentTarget.select()}
          onChange={event => { const value = event.target.valueAsNumber; if (option && Number.isFinite(value) && value > 0) setCustomEntryPrice({ optionId: option.id, value }); }} />
        <span className="mt-1 block text-[10px]" style={{ color: 'var(--th-muted)' }}>Defaults to the live LTP. Change it to replay your original fill price.</span>
      </label>
      {quote && <p className="text-[10px]" style={{ color: 'var(--th-muted)' }}>
        Retrieved {new Date(quote.receivedAt).toLocaleTimeString('en-IN')} · {!enabled ? 'Waiting for connection' : isFreshQuote(quote, now) ? '5s refresh' : 'Stale'}
        {quote.lastTradedAt ? ' · Trade ' + new Date(quote.lastTradedAt).toLocaleTimeString('en-IN') : ' · Trade time unavailable'}
      </p>}
      {option && <p className="text-[10px]" style={{ color: 'var(--th-muted)' }}>
        Broker lot: {option.lotSize} · P&amp;L per ₹1 move / lot: {money(option.lotSize * option.priceMultiplier)}
      </p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={!ready || !compatible || legs.length >= 20} onClick={() => add('BUY')}
          className="rounded-md py-2 text-xs font-bold bg-emerald-600 text-white disabled:opacity-40">Add BUY at entry price</button>
        <button type="button" disabled={!ready || !compatible || legs.length >= 20} onClick={() => add('SELL')}
          className="rounded-md py-2 text-xs font-bold bg-red-600 text-white disabled:opacity-40">Add SELL at entry price</button>
      </div>
      {!compatible && <p className="text-xs" style={{ color: 'var(--th-warning)' }}>Clear the current legs to start a different expiry or underlying. Manual legs stay in manual mode.</p>}
      {legs.length >= 20 && <p className="text-xs" style={{ color: 'var(--th-warning)' }}>20-leg limit reached.</p>}
      {addError && <p role="alert" className="text-xs" style={{ color: 'var(--th-warning)' }}>{addError}</p>}
      <p className="text-[10px] leading-relaxed" style={{ color: 'var(--th-muted)' }}>Entry premiums are snapshots. Quote updates never change your saved entry prices.</p>
    </>}
    {hasLinkedLegs && <div className="border-t pt-2" style={{ borderColor: 'var(--th-border)' }}>
      {contracts.length > 0 && !validLegs && <p className="text-xs mb-2" style={{ color: 'var(--th-warning)' }}>A saved contract no longer matches the current contract master. Rebuild those legs from the selector to resume live analysis.</p>}
      <div className="flex justify-between text-xs gap-2"><span>Market P&amp;L estimate</span>
        <strong style={{ color: pnl == null ? 'var(--th-muted)' : pnl >= 0 ? 'var(--th-positive)' : 'var(--th-negative)' }}>{money(pnl)}</strong></div>
      <p className="text-[10px] mt-1" style={{ color: 'var(--th-muted)' }}>Midpoint, or last trade if a two-sided quote is unavailable. Excludes fees and slippage. {pnl === null && 'Waiting for all leg quotes.'}</p>
    </div>}
  </section>;
}
