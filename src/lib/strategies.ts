import type { PrebuiltStrategyTemplate } from '@/types';

export const PREBUILT_STRATEGIES: PrebuiltStrategyTemplate[] = [
  {
    name: 'Long Call',
    description: 'Bullish. Unlimited profit, limited loss.',
    legs: [{ positionType: 'BUY', optionType: 'CE', strikeOffset: 0 }],
  },
  {
    name: 'Long Put',
    description: 'Bearish. High profit potential, limited loss.',
    legs: [{ positionType: 'BUY', optionType: 'PE', strikeOffset: 0 }],
  },
  {
    name: 'Short Call',
    description: 'Bearish/Neutral. Limited profit, unlimited risk.',
    legs: [{ positionType: 'SELL', optionType: 'CE', strikeOffset: 0 }],
  },
  {
    name: 'Short Put',
    description: 'Bullish/Neutral. Limited profit, high risk.',
    legs: [{ positionType: 'SELL', optionType: 'PE', strikeOffset: 0 }],
  },
  {
    name: 'Bull Call Spread',
    description: 'Bullish. Capped profit and loss.',
    legs: [
      { positionType: 'BUY', optionType: 'CE', strikeOffset: -1 },
      { positionType: 'SELL', optionType: 'CE', strikeOffset: +1 },
    ],
  },
  {
    name: 'Bear Put Spread',
    description: 'Bearish. Capped profit and loss.',
    legs: [
      { positionType: 'BUY', optionType: 'PE', strikeOffset: +1 },
      { positionType: 'SELL', optionType: 'PE', strikeOffset: -1 },
    ],
  },
  {
    name: 'Bull Put Spread',
    description: 'Bullish. Credit received upfront.',
    legs: [
      { positionType: 'SELL', optionType: 'PE', strikeOffset: 0 },
      { positionType: 'BUY', optionType: 'PE', strikeOffset: -1 },
    ],
  },
  {
    name: 'Bear Call Spread',
    description: 'Bearish. Credit received upfront.',
    legs: [
      { positionType: 'SELL', optionType: 'CE', strikeOffset: 0 },
      { positionType: 'BUY', optionType: 'CE', strikeOffset: +1 },
    ],
  },
  {
    name: 'Long Straddle',
    description: 'Neutral. Profit from big moves either way.',
    legs: [
      { positionType: 'BUY', optionType: 'CE', strikeOffset: 0 },
      { positionType: 'BUY', optionType: 'PE', strikeOffset: 0 },
    ],
  },
  {
    name: 'Short Straddle',
    description: 'Neutral. Profit from low volatility.',
    legs: [
      { positionType: 'SELL', optionType: 'CE', strikeOffset: 0 },
      { positionType: 'SELL', optionType: 'PE', strikeOffset: 0 },
    ],
  },
  {
    name: 'Long Strangle',
    description: 'Neutral. Cheaper than straddle, needs bigger move.',
    legs: [
      { positionType: 'BUY', optionType: 'CE', strikeOffset: +1 },
      { positionType: 'BUY', optionType: 'PE', strikeOffset: -1 },
    ],
  },
  {
    name: 'Short Strangle',
    description: 'Neutral. Premium collection with wider range.',
    legs: [
      { positionType: 'SELL', optionType: 'CE', strikeOffset: +1 },
      { positionType: 'SELL', optionType: 'PE', strikeOffset: -1 },
    ],
  },
  {
    name: 'Iron Condor',
    description: 'Neutral. Profit in a range, limited risk.',
    legs: [
      { positionType: 'BUY', optionType: 'PE', strikeOffset: -2 },
      { positionType: 'SELL', optionType: 'PE', strikeOffset: -1 },
      { positionType: 'SELL', optionType: 'CE', strikeOffset: +1 },
      { positionType: 'BUY', optionType: 'CE', strikeOffset: +2 },
    ],
  },
  {
    name: 'Iron Butterfly',
    description: 'Neutral. Maximum profit at ATM strike.',
    legs: [
      { positionType: 'BUY', optionType: 'PE', strikeOffset: -1 },
      { positionType: 'SELL', optionType: 'PE', strikeOffset: 0 },
      { positionType: 'SELL', optionType: 'CE', strikeOffset: 0 },
      { positionType: 'BUY', optionType: 'CE', strikeOffset: +1 },
    ],
  },
];
