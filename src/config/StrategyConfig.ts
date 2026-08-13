export const DEFAULT_LOOKBACK_DAYS = 126;

export const DEFAULT_MOMENTUM_FALLBACK_SYMBOL =
  "SPY";

export const TUNED_UNIVERSE_FILTER = {
  minAvgDailyVolume: 500_000,
  minAvgDailyDollarVolume: 10_000_000,
  minPrice: 10,
  minHistoryDays: 30,
  maxAtrPercent: 5.0
};

export const DEFAULT_ROTATION_POLICY = {
  minHoldDays: 5,
  minScoreImprovement: 5
};

export const HYBRID_SELECTION_LOOKBACK_DAYS = 30;

export const HYBRID_ROTATION_POLICY = {
  minHoldDays: 10,
  minScoreImprovement: 10
};

export const HYBRID_TREND_GATE = {
  fastPeriod: 20,
  slowPeriod: 50
};

export const HYBRID_WARMUP_DAYS =
  HYBRID_SELECTION_LOOKBACK_DAYS +
  HYBRID_TREND_GATE.slowPeriod +
  5;

export const AGGRESSIVE_LOOKBACK_DAYS = 10;

export const AGGRESSIVE_ROTATION_POLICY = {
  minHoldDays: 0,
  minScoreImprovement: 0
};

export const AGGRESSIVE_WARMUP_DAYS =
  AGGRESSIVE_LOOKBACK_DAYS + 35;
