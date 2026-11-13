export type OptionType = 'CE' | 'PE';
export type PositionType = 'BUY' | 'SELL';

export interface Instrument {
  symbol: string;
  name: string;
  lotSize: number;
  tickSize: number;
  unit: string;
  priceUnit: string;
}

export interface OptionLeg {
  id: string;
  instrument: Instrument;
  positionType: PositionType;
  optionType: OptionType;
  strikePrice: number;
  premium: number;
  lots: number;
  iv: number;
  daysToExpiry: number;
  marketContract?: {
    instrumentId: number;
    underlyingInstrumentId: number;
    expiry: string;
    symbol: string;
    name: string;
    brokerLotSize?: number;
    priceMultiplier?: number;
  };
}

export interface StrategyInputs {
  underlyingPrice: number;
  riskFreeRate: number;
  legs: OptionLeg[];
}

export interface PayoffPoint {
  price: number;
  expiryPnL: number;
  currentPnL: number;
}

export interface StrategyMetrics {
  maxProfit: number | 'Unlimited';
  maxLoss: number | 'Unlimited';
  breakevenPoints: number[];
  netPremium: number;
  probabilityOfProfit: number;
}

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export interface PrebuiltStrategyTemplate {
  name: string;
  description: string;
  legs: Array<{
    positionType: PositionType;
    optionType: OptionType;
    strikeOffset: number;
  }>;
}
