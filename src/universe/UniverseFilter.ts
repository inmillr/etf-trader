import type { Candle } from "../types/market.js";

export interface UniverseFilterOptions {
  minAvgDailyVolume: number;
  minAvgDailyDollarVolume: number;
  minPrice: number;
  minHistoryDays: number;
}

export const DEFAULT_UNIVERSE_FILTER: UniverseFilterOptions = {
  minAvgDailyVolume: 500_000,
  minAvgDailyDollarVolume: 10_000_000,
  minPrice: 10,
  minHistoryDays: 30
};

export interface FilterMetrics {
  avgDailyVolume: number;
  avgDailyDollarVolume: number;
  latestPrice: number;
  historyDays: number;
}

export interface FilterResult {
  passed: boolean;
  reasons: string[];
  metrics: FilterMetrics;
}

export function applyUniverseFilter(
  candles: Candle[],
  options: UniverseFilterOptions
): FilterResult {
  const reasons: string[] = [];

  if (candles.length === 0) {
    return {
      passed: false,
      reasons: ["No candle history available."],
      metrics: {
        avgDailyVolume: 0,
        avgDailyDollarVolume: 0,
        latestPrice: 0,
        historyDays: 0
      }
    };
  }

  const sorted = [...candles].sort(
    (a, b) =>
      a.timestamp.getTime() -
      b.timestamp.getTime()
  );

  const latest = sorted[sorted.length - 1]!;

  const historyDays = countTradingDays(sorted);

  const recentCandles = sorted.slice(
    -Math.min(20, sorted.length)
  );

  const avgDailyVolume =
    recentCandles.reduce(
      (sum, candle) =>
        sum + candle.volume,
      0
    ) / recentCandles.length;

  const avgDailyDollarVolume =
    recentCandles.reduce(
      (sum, candle) =>
        sum +
        candle.volume * candle.close,
      0
    ) / recentCandles.length;

  const latestPrice = latest.close;

  if (historyDays < options.minHistoryDays) {
    reasons.push(
      `Insufficient history: ${historyDays} days ` +
      `(minimum ${options.minHistoryDays}).`
    );
  }

  if (latestPrice < options.minPrice) {
    reasons.push(
      `Price ${latestPrice.toFixed(2)} below minimum ` +
      `${options.minPrice.toFixed(2)}.`
    );
  }

  if (
    avgDailyVolume <
    options.minAvgDailyVolume
  ) {
    reasons.push(
      `Average volume ${Math.round(avgDailyVolume).toLocaleString()} ` +
      `below minimum ${options.minAvgDailyVolume.toLocaleString()}.`
    );
  }

  if (
    avgDailyDollarVolume <
    options.minAvgDailyDollarVolume
  ) {
    reasons.push(
      `Average dollar volume ` +
      `$${Math.round(avgDailyDollarVolume).toLocaleString()} ` +
      `below minimum ` +
      `$${options.minAvgDailyDollarVolume.toLocaleString()}.`
    );
  }

  return {
    passed: reasons.length === 0,
    reasons,
    metrics: {
      avgDailyVolume,
      avgDailyDollarVolume,
      latestPrice,
      historyDays
    }
  };
}

function countTradingDays(
  candles: Candle[]
): number {
  const days = new Set<string>();

  for (const candle of candles) {
    days.add(
      candle.timestamp
        .toISOString()
        .slice(0, 10)
    );
  }

  return days.size;
}
