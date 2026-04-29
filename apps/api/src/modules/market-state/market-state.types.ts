export type MarketTrend = 'BULLISH' | 'NEUTRAL' | 'BEARISH';
export type ExtensionState = 'EXTENDED' | 'NEUTRAL' | 'PULLBACK';
export type VolatilityRegime = 'CALM' | 'NORMAL' | 'ELEVATED' | 'UNKNOWN';
export type BreadthState = 'STRONG' | 'MIXED' | 'WEAK';

export type MarketState =
  | 'TRENDING_BULL'
  | 'PULLBACK_RESET'
  | 'BEARISH_WEAK'
  | 'CHOPPY_MIXED';

export type GuidanceLevel = 'FAVORABLE' | 'NEUTRAL' | 'UNFAVORABLE';

export type MarketStateResponse = {
  state: MarketState;
  label: string;
  summary: string;
  conditions: string[];
  strategyGuidance: {
    trendPullback: GuidanceLevel;
    relativeStrengthBreakout: GuidanceLevel;
    oversoldBounce: GuidanceLevel;
  };
  volatilityRegime: VolatilityRegime;
  breadthState: BreadthState;
};
