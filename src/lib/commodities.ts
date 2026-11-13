/** MCX commodity futures currently included in the live board. Agriculture and index contracts are intentionally excluded. */
export const NON_AGRICULTURAL_SYMBOLS = new Set([
  'ALUMINI', 'ALUMINIUM', 'COPPER',
  'CRUDEOIL', 'CRUDEOILM',
  'GOLD', 'GOLDGUINEA', 'GOLDM', 'GOLDPETAL', 'GOLDTEN',
  'LEAD', 'LEADMINI',
  'NATGASMINI', 'NATURALGAS', 'NICKEL',
  'SILVER', 'SILVER100', 'SILVERM', 'SILVERMIC',
  'STEELREBAR', 'ZINC', 'ZINCMINI',
]);

export function isNonAgriculturalSymbol(symbol: string): boolean {
  return NON_AGRICULTURAL_SYMBOLS.has(symbol.toUpperCase());
}
