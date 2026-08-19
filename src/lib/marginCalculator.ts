import type { OptionLeg } from '@/types';

interface MarginRates { span: number; exposure: number }

const RATES: Record<string, MarginRates> = {
  GOLD:       { span: 0.04, exposure: 0.03 },
  GOLDM:      { span: 0.04, exposure: 0.03 },
  SILVER:     { span: 0.05, exposure: 0.04 },
  SILVERM:    { span: 0.05, exposure: 0.04 },
  CRUDEOIL:   { span: 0.07, exposure: 0.05 },
  CRUDEOILM:  { span: 0.07, exposure: 0.05 },
  NATURALGAS: { span: 0.10, exposure: 0.06 },
  NATGASMINI: { span: 0.10, exposure: 0.06 },
  COPPER:     { span: 0.05, exposure: 0.04 },
  ZINC:       { span: 0.05, exposure: 0.04 },
  ALUMINIUM:  { span: 0.05, exposure: 0.04 },
};

export interface MarginResult {
  spanMargin: number;
  exposureMargin: number;
  totalMargin: number;
  premiumRequired: number;
  totalCapitalRequired: number;
}

export function calculateMargin(legs: OptionLeg[], futuresPrice: number): MarginResult {
  let spanMargin = 0;
  let exposureMargin = 0;
  let premiumRequired = 0;

  for (const leg of legs) {
    const rates = RATES[leg.instrument.symbol] ?? { span: 0.05, exposure: 0.04 };
    const contractValue = futuresPrice * leg.instrument.lotSize * leg.lots;

    if (leg.positionType === 'SELL') {
      spanMargin     += contractValue * rates.span;
      exposureMargin += contractValue * rates.exposure;
    } else {
      premiumRequired += leg.premium * leg.instrument.lotSize * leg.lots;
    }
  }

  // Hedge benefit: if both BUY and SELL legs exist, SPAN is reduced by 30%
  const hasBuy  = legs.some(l => l.positionType === 'BUY');
  const hasSell = legs.some(l => l.positionType === 'SELL');
  if (hasBuy && hasSell) spanMargin *= 0.70;

  const totalMargin = spanMargin + exposureMargin;
  return {
    spanMargin,
    exposureMargin,
    totalMargin,
    premiumRequired,
    totalCapitalRequired: totalMargin + premiumRequired,
  };
}
