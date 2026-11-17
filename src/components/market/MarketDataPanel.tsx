import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ChevronDown, Radio, RefreshCw } from 'lucide-react';
import type { OptionLeg, PositionType } from '@/types';
import type { MarketContract, MarketQuote, MarketStatus } from '@/types/market';
import { createMarketLeg, expiryTime, isFreshQuote, quoteMark } from '@/lib/marketData';
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
  style?: React.CSSProperties;
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

  function normalizeOptionText(nextText: string) {
    // Strike labels are formatted as “8,600”, while keyboard users naturally
    // type “8600”. Removing separators also makes date labels forgiving.
    return nextText.trim().toLocaleLowerCase().replace(/[\s,]/g, '');
  }

  function commit(nextText: string): MarketOption | undefined {
    const normalized = normalizeOptionText(nextText);
    const match = options.find(option =>
      normalizeOptionText(option.label) === normalized || normalizeOptionText(option.value) === normalized,
    );
    if (match) {
      onChange(match.value);
      setText(match.label);
    }
    return match;
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
          const match = commit(text);
          focused.current = false;
          setText(match?.label ?? options.find(option => option.value === value)?.label ?? '');
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
  const [lotsText, setLotsText] = useState('1');
  const [entryDraft, setEntryDraft] = useState<{ optionId: number; text: string } | null>(null);
  const [addError, setAddError] = useState('');
  const lastLinkedSelectionKey = useRef<string | undefined>(undefined);
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

  // A loaded live strategy carries an exact broker contract identity. Sync the
  // selector/card to it when the first linked leg changes, but do not reset the
  // selector when the user adds a second leg to the same strategy.
  const linkedLeg = legs.find(leg => leg.marketContract);
  const linkedOptionId = linkedLeg?.marketContract?.instrumentId;
  const linkedSelectionKey = linkedLeg && linkedOptionId !== undefined
    ? `${linkedLeg.id}:${linkedOptionId}` : undefined;
  const syncLinkedSelection = useEffectEvent((linked: MarketContract) => {
    setSymbolChoice(linked.symbol);
    setExpiryChoice(linked.expiry);
    if (linked.kind === 'CE' || linked.kind === 'PE') setKind(linked.kind);
    setOptionChoice(linked.id);
  });
  useEffect(() => {
    if (linkedSelectionKey === undefined || linkedOptionId === undefined) {
      lastLinkedSelectionKey.current = undefined;
      return;
    }
    const linked = contracts.find(contract => contract.id === linkedOptionId);
    if (!linked || lastLinkedSelectionKey.current === linkedSelectionKey) return;
    lastLinkedSelectionKey.current = linkedSelectionKey;
    syncLinkedSelection(linked);
  }, [contracts, linkedOptionId, linkedSelectionKey]);

  useEffect(() => {
    onWatchIds([optionId, futureId].filter((id): id is number => id !== undefined));
  }, [optionId, futureId, onWatchIds]);

  const quote = option && quotes[option.id];
  const futureQuote = future && quotes[future.id];
  const liveLtp = isFreshQuote(quote, now) && quote?.lastPrice != null ? quote.lastPrice : quoteMark(quote);
  const optionSpread = quote?.bid != null && quote?.ask != null && Number.isFinite(quote.bid) && Number.isFinite(quote.ask) && quote.ask >= quote.bid
    ? quote.ask - quote.bid : null;
  const entryText = option && entryDraft?.optionId === option.id
    ? entryDraft.text
    : liveLtp == null ? '' : String(liveLtp);
  const entryPrice = option && entryDraft?.optionId === option.id
    ? Number(entryDraft.text)
    : liveLtp;
  const lots = Number(lotsText);
  const ready = enabled && !error && isFreshQuote(quote, now) && isFreshQuote(futureQuote, now);
  const compatible = !legs.length || legs.every(leg => leg.marketContract &&
    leg.marketContract.underlyingInstrumentId === future?.id && option && expiryTime(leg.marketContract.expiry) === expiryTime(option.expiry));
  const selectClass = 'ui-input w-full';
  let connectionLabel = 'Not connected';
  if (enabled) connectionLabel = error ? 'Connection issue' : ready ? 'Receiving quotes' : 'Waiting for quotes';
  else if (contracts.length) connectionLabel = 'Ready';

  function add(position: PositionType) {
    setAddError('');
    try {
      if (legs.length >= 20) throw new Error('A strategy can contain up to 20 legs.');
      if (!Number.isInteger(lots) || lots < 1 || lots > 1000) throw new Error('Lots must be a whole number between 1 and 1,000.');
      if (typeof entryPrice !== 'number' || !Number.isFinite(entryPrice) || entryPrice <= 0) throw new Error('Enter a valid entry price before adding this position.');
      if (!option || !future || !quote || !futureQuote || !compatible) throw new Error('Select a compatible quoted contract.');
      const leg = createMarketLeg(option, future, quote, futureQuote, position, riskFreeRate, undefined, lots, Number(entryPrice));
      onAddLeg(leg, quoteMark(futureQuote)!);
    } catch (err) { setAddError(err instanceof Error ? err.message : 'Could not add this contract.'); }
  }

  return <section className="px-4 pt-4 pb-4 flex flex-col gap-3" aria-label="Eureka market data">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2"><Radio size={15} className="text-brand-text" />
        <div>
          <span className="block text-xs font-semibold">Live MCX prices</span>
          <span className="block text-xs" style={{ color: 'var(--th-muted)' }}>Eureka connection</span>
        </div></div>
      <span className="text-xs" style={{ color: ready ? 'var(--th-positive)' : 'var(--th-muted)' }}>{connectionLabel}</span>
    </div>
    {loading && <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--th-border2)', color: 'var(--th-muted)' }}>
      <RefreshCw size={12} className="animate-spin" /> Connecting to Eureka automatically…
    </div>}
    {error && <button type="button" onClick={onConnect} disabled={loading}
      className="ui-btn ui-btn-primary">
      <RefreshCw size={12} /> Retry live connection
    </button>}
    {status && !status.configured && <p className="text-xs leading-relaxed" style={{ color: 'var(--th-muted)' }}>
      Manual simulation is available now. To use live prices, add your Eureka app key and secret to the market-data server environment. Credentials stay out of the browser.
    </p>}
    {!contracts.length && !error && <p className="text-xs leading-relaxed" style={{ color: 'var(--th-muted)' }}>
      Manual mode works without a website account. This sign-in only authenticates the server-side Eureka market-data connection.
    </p>}
    {error && <p role="status" className="text-xs" style={{ color: 'var(--th-warning)' }}>{error}</p>}
    {contracts.length > 0 && !symbols.length && <p className="text-xs" style={{ color: 'var(--th-warning)' }}>No unexpired MCX options were returned for this account.</p>}
    {symbols.length > 0 && <>
      {future ? <div className="rounded-xl border p-3" style={{ borderColor: 'var(--th-border)', background: 'var(--th-card)' }}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--th-muted)' }}>Selected future</span>
          <span className="text-xs font-semibold" style={{ color: isFreshQuote(futureQuote, now) ? 'var(--th-positive)' : 'var(--th-muted)' }}>{isFreshQuote(futureQuote, now) ? 'LIVE' : 'Waiting'}</span>
        </div>
        <strong className="mt-1 block text-2xl font-bold tracking-tight tabular-nums">{money(isFreshQuote(futureQuote, now) ? quoteMark(futureQuote) : null)}</strong>
        <span className="text-xs" style={{ color: 'var(--th-muted)' }}>{future.symbol} future · {dateLabel(future.expiry)}</span>
        <div className="mt-2 grid grid-cols-3 gap-2 border-t pt-2 text-center text-xs" style={{ borderColor: 'var(--th-border2)' }}>
          <div><span className="block text-xs" style={{ color: 'var(--th-muted)' }}>Bid</span><strong className="mt-1 block text-sm font-semibold tabular-nums">{money(futureQuote?.bid)}</strong></div>
          <div><span className="block text-xs" style={{ color: 'var(--th-muted)' }}>Ask</span><strong className="mt-1 block text-sm font-semibold tabular-nums">{money(futureQuote?.ask)}</strong></div>
          <div><span className="block text-xs" style={{ color: 'var(--th-muted)' }}>Last trade</span><strong className="mt-1 block text-sm font-semibold tabular-nums">{money(futureQuote?.lastPrice)}</strong></div>
        </div>
      </div> : <p className="text-xs" style={{ color: 'var(--th-warning)' }}>The matching underlying future is unavailable in the contract master. This option cannot be linked safely.</p>}
      {option && <div className="rounded-xl border p-3" style={{ borderColor: 'var(--th-border)', background: 'var(--th-card)' }}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--th-muted)' }}>Selected option</span>
          <span className="text-xs font-semibold" style={{ color: isFreshQuote(quote, now) ? 'var(--th-positive)' : 'var(--th-muted)' }}>{isFreshQuote(quote, now) ? 'LIVE' : 'Waiting'}</span>
        </div>
        <strong className="mt-1 block text-xl font-bold tracking-tight tabular-nums">{money(isFreshQuote(quote, now) ? quoteMark(quote) : null)}</strong>
        <span className="text-xs" style={{ color: 'var(--th-muted)' }}>
          {option.symbol} {option.strike?.toLocaleString('en-IN')} {option.kind} · {dateLabel(option.expiry)}
        </span>
        <div className="mt-2 grid grid-cols-4 gap-1 border-t pt-2 text-center text-xs" style={{ borderColor: 'var(--th-border2)' }}>
          <div><span className="block text-xs" style={{ color: 'var(--th-muted)' }}>Bid</span><strong className="mt-1 block text-xs font-semibold tabular-nums">{money(quote?.bid)}</strong></div>
          <div><span className="block text-xs" style={{ color: 'var(--th-muted)' }}>Ask</span><strong className="mt-1 block text-xs font-semibold tabular-nums">{money(quote?.ask)}</strong></div>
          <div><span className="block text-xs" style={{ color: 'var(--th-muted)' }}>Last</span><strong className="mt-1 block text-xs font-semibold tabular-nums">{money(quote?.lastPrice)}</strong></div>
          <div><span className="block text-xs" style={{ color: 'var(--th-muted)' }}>Spread</span><strong className="mt-1 block text-xs font-semibold tabular-nums">{money(optionSpread)}</strong></div>
        </div>
      </div>}
    </>}
    {symbols.length > 0 && <>
      <div className="grid grid-cols-2 gap-2">
        <label htmlFor="market-commodity" className="text-xs">Commodity
          <MarketComboBox id="market-commodity" ariaLabel="Live commodity" value={symbol}
            options={symbols.map(s => ({ value: s, label: s }))} className={selectClass}
            onChange={next => { setSymbolChoice(next); setOptionChoice(0); setAddError(''); }} />
        </label>
        <label htmlFor="market-expiry" className="text-xs">Option expiry
          <MarketComboBox id="market-expiry" ariaLabel="Live option expiry" value={expiry}
            options={expiries.map(next => ({ value: next, label: dateLabel(next) }))} className={selectClass}
            onChange={next => { setExpiryChoice(next); setOptionChoice(0); setAddError(''); }} />
        </label>
        <label htmlFor="market-option-type" className="text-xs">Option type
          <MarketComboBox id="market-option-type" ariaLabel="Live option type" value={kind}
            options={[{ value: 'CE', label: 'Call · CE' }, { value: 'PE', label: 'Put · PE' }]} className={selectClass}
            onChange={next => { setKind(next as 'CE' | 'PE'); setOptionChoice(0); setAddError(''); }} />
        </label>
        <label htmlFor="market-strike" className="text-xs">Strike
          <MarketComboBox id="market-strike" ariaLabel="Live strike" value={option?.id == null ? '' : String(option.id)}
            options={options.map(c => ({ value: String(c.id), label: c.strike?.toLocaleString('en-IN') ?? String(c.id) }))} className={selectClass}
            onChange={next => { setOptionChoice(Number(next)); setAddError(''); }} />
        </label>
      </div>
      <label className="block text-xs">Lots to add
        <input type="number" min={1} max={1000} step={1} value={lotsText} inputMode="numeric" aria-label="Lots to add" className="ui-input mt-1 w-full"
          onFocus={event => event.currentTarget.select()}
          onChange={event => setLotsText(event.target.value)} />
      </label>
      <label className="block text-xs">Entry price / LTP <span style={{ color: 'var(--th-muted)' }}>(editable)</span>
        <input type="number" min={0.01} step="any" value={entryText} inputMode="decimal" aria-label="Entry price or LTP" className="ui-input mt-1 w-full font-semibold"
          onFocus={event => {
            event.currentTarget.select();
            if (option) setEntryDraft({ optionId: option.id, text: event.currentTarget.value });
          }}
          onChange={event => { if (option) setEntryDraft({ optionId: option.id, text: event.target.value }); }} />
        <span className="mt-1 block text-xs" style={{ color: 'var(--th-muted)' }}>Defaults to the live LTP. Change it to replay your original fill price.</span>
      </label>
      {quote && <p className="text-xs" style={{ color: 'var(--th-muted)' }}>
        Retrieved {new Date(quote.receivedAt).toLocaleTimeString('en-IN')} · {!enabled ? 'Waiting for connection' : isFreshQuote(quote, now) ? '5s refresh' : 'Stale'}
        {quote.lastTradedAt ? ' · Trade ' + new Date(quote.lastTradedAt).toLocaleTimeString('en-IN') : ' · Trade time unavailable'}
      </p>}
      {option && <p className="text-xs" style={{ color: 'var(--th-muted)' }}>
        Broker lot: {option.lotSize} · P&amp;L per ₹1 move / lot: {money(option.lotSize * option.priceMultiplier)}
      </p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={!ready || !compatible || legs.length >= 20} onClick={() => add('BUY')}
          className="ui-btn ui-btn-positive px-2 text-xs">Add BUY at entry price</button>
        <button type="button" disabled={!ready || !compatible || legs.length >= 20} onClick={() => add('SELL')}
          className="ui-btn ui-btn-negative px-2 text-xs">Add SELL at entry price</button>
      </div>
      {!compatible && <p className="text-xs" style={{ color: 'var(--th-warning)' }}>Click <strong>New strategy</strong> to clear the current legs and start a different expiry or underlying. Manual legs stay in manual mode.</p>}
      {legs.length >= 20 && <p className="text-xs" style={{ color: 'var(--th-warning)' }}>20-leg limit reached.</p>}
      {addError && <p role="alert" className="text-xs" style={{ color: 'var(--th-warning)' }}>{addError}</p>}
      <p className="text-xs leading-relaxed" style={{ color: 'var(--th-muted)' }}>Entry premiums are snapshots. Quote updates never change your saved entry prices.</p>
    </>}
  </section>;
}
