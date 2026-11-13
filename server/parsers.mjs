// XTS master layouts: https://symphonyfintech.com/xts-market-data-front-end-api-v2/
// Cash conversion: quantity * price difference * Multiplier * PriceNumerator /
// PriceDenominator (official XTS Interactive API's MTM example).

const positiveNumber = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const instrumentId = (value) => {
  const parsed = positiveNumber(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

function expiryValue(value) {
  // Preserve naive exchange timestamps. The browser must explicitly choose an
  // exchange timezone; interpreting them in this server's timezone is unsafe.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value)) return null;
  const day = value.slice(0, 10);
  const calendar = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== day) return null;
  if (value.length > 10 && !Number.isFinite(Date.parse(/[Z]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`))) return null;
  return value;
}

/** Parse only MCX futures and plain call/put options. No symbol/expiry guesses. */
export function parseMaster(master) {
  if (typeof master !== 'string') return [];
  const parsed = [];
  for (const line of master.split(/\r?\n/)) {
    const fields = line.trim().split('|').map((field) => field.trim());
    if (!['MCXFO', '51'].includes(fields[0])) continue;
    const type = Number(fields[2]);
    if (type !== 1 && type !== 2) continue;
    const id = instrumentId(fields[1]);
    const expiry = expiryValue(fields[16]);
    const lotSize = positiveNumber(fields[12]);
    const tickSize = positiveNumber(fields[11]);
    const multiplier = positiveNumber(fields[13]);
    // The legacy unified derivative layout explicitly includes two zero / -1
    // placeholders for futures. Newer futures masters omit those two fields.
    const legacyFuture = type === 1 && fields.length >= 22 &&
      ['0', '-1'].includes(fields[17]) && ['0', '-1'].includes(fields[18]);
    const displayIndex = type === 2 || legacyFuture ? 19 : 17;
    const priceNumerator = positiveNumber(fields[displayIndex + 1]);
    const priceDenominator = positiveNumber(fields[displayIndex + 2]);
    const priceMultiplier = multiplier * priceNumerator / priceDenominator;
    const optionType = fields[18];
    const kind = type === 1 ? 'FUT' : optionType === '3' ? 'CE' : optionType === '4' ? 'PE' : null;
    const strike = type === 2 ? positiveNumber(fields[17]) : null;
    if (!id || !expiry || !lotSize || !tickSize || !multiplier || !priceNumerator || !priceDenominator ||
        !Number.isFinite(priceMultiplier) || priceMultiplier <= 0 || !kind || !fields[3] || (type === 2 && !strike)) continue;
    parsed.push({
      contract: {
        id, symbol: fields[3], name: fields[displayIndex] || fields[4] || fields[3],
        kind, expiry, strike, lotSize, tickSize, underlyingId: null,
        priceMultiplier, multiplier, priceNumerator, priceDenominator,
      },
      internalId: fields[7],
      underlyingReference: fields[14],
    });
  }

  // Some deployments refer to InstrumentID, others to ExchangeInstrumentID.
  // Resolve only a unique, explicit reference to a futures contract of the same
  // symbol. Never infer a futures expiry from an option's (different) expiry.
  const byReference = new Map();
  for (const item of parsed) {
    if (item.contract.kind !== 'FUT') continue;
    for (const reference of new Set([String(item.contract.id), item.internalId])) {
      if (!reference || reference === '-1') continue;
      const candidates = byReference.get(reference) ?? [];
      candidates.push(item.contract);
      byReference.set(reference, candidates);
    }
  }
  const seen = new Set();
  return parsed.filter(({ contract }) => {
    if (seen.has(contract.id)) return false;
    seen.add(contract.id);
    return true;
  }).map(({ contract, underlyingReference }) => {
    const candidates = (byReference.get(underlyingReference) ?? []).filter((candidate) => candidate.symbol === contract.symbol);
    return { ...contract, underlyingId: contract.kind !== 'FUT' && candidates.length === 1 ? candidates[0].id : null };
  }).sort((a, b) => a.symbol.localeCompare(b.symbol) || a.expiry.localeCompare(b.expiry) || a.id - b.id);
}

function explicitTimestamp(value) {
  // XTS deployments use different numeric epochs. Until Eureka's epoch is
  // confirmed, numeric trade times are unknown, never silently treated as Unix.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function bookPrice(info) {
  if (!info || (info.Size !== undefined && Number(info.Size) <= 0)) return null;
  return positiveNumber(info.Price);
}

/** Normalize 1502 depth payloads, accepting JSON-string and object entries. */
export function parseQuotes(entries, receivedAt) {
  if (!Array.isArray(entries)) return [];
  const quotes = new Map();
  for (const entry of entries) {
    let value;
    try { value = typeof entry === 'string' ? JSON.parse(entry) : entry; } catch { continue; }
    if (!value || !['MCXFO', '51'].includes(String(value.ExchangeSegment))) continue;
    const id = instrumentId(value.ExchangeInstrumentID);
    if (!id) continue;
    const touchline = value.Touchline ?? value.TouchLine ?? value;
    const bids = Array.isArray(value.Bids) ? value.Bids.map(bookPrice).filter((price) => price !== null) : [];
    const asks = Array.isArray(value.Asks) ? value.Asks.map(bookPrice).filter((price) => price !== null) : [];
    quotes.set(id, {
      instrumentId: id,
      lastPrice: positiveNumber(touchline.LastTradedPrice),
      bid: bookPrice(touchline.BidInfo) ?? (bids.length ? Math.max(...bids) : null),
      ask: bookPrice(touchline.AskInfo) ?? (asks.length ? Math.min(...asks) : null),
      lastTradedAt: explicitTimestamp(touchline.LastTradedTime),
      receivedAt,
    });
  }
  return [...quotes.values()];
}
