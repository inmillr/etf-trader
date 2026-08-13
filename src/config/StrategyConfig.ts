export const DEFAULT_LOOKBACK_DAYS = 126;

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
