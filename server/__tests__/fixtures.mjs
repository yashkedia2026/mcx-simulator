// Synthetic contracts, never broker credentials or captured account responses.
export const futureFields = [
  'MCXFO', '101', '1', 'GOLD', 'GOLD NOV FUT', 'FUTCOM', 'GOLD-FUTCOM',
  '51000000000101', '200000', '10000', '100', '1', '1000', '1', '-1', 'GOLD',
  '2026-11-30T23:30:00', 'GOLD 30NOV2026', '1', '10', 'GOLD NOV FUT',
];
export const callFields = [
  'MCXFO', '201', '2', 'GOLD', 'GOLD NOV CE', 'OPTFUT', 'GOLD-OPTFUT',
  '51000000000201', '10000', '1', '100', '0.5', '1000', '1', '51000000000101', 'GOLD',
  '2026-11-25T23:30:00', '74000', '3', 'GOLD 25NOV2026 CE 74000', '1', '10', 'GOLD NOV CE',
];
export const putFields = callFields.map((value, index) => ({ 1: '202', 7: '51000000000202', 18: '4', 19: 'GOLD 25NOV2026 PE 74000' })[index] ?? value);
export const masterFixture = [futureFields, callFields, putFields].map((fields) => fields.join('|')).join('\n');

export function quoteFixture(id = 201, price = 100) {
  return {
    MessageCode: 1502, ExchangeSegment: 51, ExchangeInstrumentID: id,
    Bids: [{ Size: 2, Price: price - 1 }], Asks: [{ Size: 3, Price: price + 1 }],
    Touchline: { LastTradedPrice: price, LastTradedTime: 1_300_000_000 },
  };
}

export const success = (result) => new Response(JSON.stringify({ type: 'success', result }), { status: 200 });
