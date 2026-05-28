import type { Instrument } from '@/types';

export const MCX_INSTRUMENTS: Instrument[] = [
  { symbol: 'GOLD',       name: 'Gold',           lotSize: 100,  tickSize: 1,    unit: 'grams',   priceUnit: '₹/10g'   },
  { symbol: 'GOLDM',      name: 'Gold Mini',       lotSize: 10,   tickSize: 1,    unit: 'grams',   priceUnit: '₹/10g'   },
  { symbol: 'GOLDPETAL',  name: 'Gold Petal',      lotSize: 1,    tickSize: 1,    unit: 'grams',   priceUnit: '₹/g'     },
  { symbol: 'SILVER',     name: 'Silver',          lotSize: 30,   tickSize: 1,    unit: 'kg',      priceUnit: '₹/kg'    },
  { symbol: 'SILVERM',    name: 'Silver Mini',     lotSize: 5,    tickSize: 1,    unit: 'kg',      priceUnit: '₹/kg'    },
  { symbol: 'SILVERMIC',  name: 'Silver Micro',    lotSize: 1,    tickSize: 1,    unit: 'kg',      priceUnit: '₹/kg'    },
  { symbol: 'CRUDEOIL',   name: 'Crude Oil',       lotSize: 100,  tickSize: 1,    unit: 'barrels', priceUnit: '₹/bbl'   },
  { symbol: 'CRUDEOILM',  name: 'Crude Oil Mini',  lotSize: 10,   tickSize: 1,    unit: 'barrels', priceUnit: '₹/bbl'   },
  { symbol: 'NATURALGAS', name: 'Natural Gas',     lotSize: 1250, tickSize: 0.10, unit: 'mmBtu',   priceUnit: '₹/mmBtu' },
  { symbol: 'COPPER',     name: 'Copper',          lotSize: 2500, tickSize: 0.05, unit: 'kg',      priceUnit: '₹/kg'    },
  { symbol: 'ZINC',       name: 'Zinc',            lotSize: 5000, tickSize: 0.05, unit: 'kg',      priceUnit: '₹/kg'    },
  { symbol: 'ALUMINIUM',  name: 'Aluminium',       lotSize: 5000, tickSize: 0.05, unit: 'kg',      priceUnit: '₹/kg'    },
  { symbol: 'LEAD',       name: 'Lead',            lotSize: 5000, tickSize: 0.05, unit: 'kg',      priceUnit: '₹/kg'    },
  { symbol: 'NICKEL',     name: 'Nickel',          lotSize: 1500, tickSize: 0.10, unit: 'kg',      priceUnit: '₹/kg'    },
];

export const DEFAULT_INSTRUMENT = MCX_INSTRUMENTS[0];

export function getStrikeGap(instrument: Instrument, price: number): number {
  const sym = instrument.symbol;
  if (sym === 'GOLD' || sym === 'GOLDM' || sym === 'GOLDPETAL') {
    if (price < 60000) return 500;
    if (price < 80000) return 500;
    return 1000;
  }
  if (sym === 'SILVER' || sym === 'SILVERM' || sym === 'SILVERMIC') {
    return 1000;
  }
  if (sym === 'CRUDEOIL' || sym === 'CRUDEOILM') {
    return 100;
  }
  if (sym === 'NATURALGAS') {
    return 10;
  }
  if (sym === 'COPPER') {
    return 5;
  }
  return 1;
}

export function roundToStrike(price: number, strikeGap: number): number {
  return Math.round(price / strikeGap) * strikeGap;
}
