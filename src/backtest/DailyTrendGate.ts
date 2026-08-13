import type { Candle } from "../types/market.js";

export interface DailyTrendOptions {
  fastPeriod: number;
  slowPeriod: number;
}

export interface DailyTrendSnapshot {
  bullishEntry: boolean;
  bearishCrossover: boolean;
  currentFast: number;
  currentSlow: number;
}

function averageClose(
  candles: Candle[]
): number {
  if (candles.length === 0) {
    return 0;
  }

  const total = candles.reduce(
    (sum, candle) => sum + candle.close,
    0
  );

  return total / candles.length;
}

export function evaluateDailyTrend(
  dailyHistory: Candle[],
  options: DailyTrendOptions
): DailyTrendSnapshot | null {
  const { fastPeriod, slowPeriod } = options;

  const minimumHistory = slowPeriod + 1;

  if (dailyHistory.length < minimumHistory) {
    return null;
  }

  const history = dailyHistory;

  const previousFast = averageClose(
    history.slice(-(fastPeriod + 1), -1)
  );

  const currentFast = averageClose(
    history.slice(-fastPeriod)
  );

  const previousSlow = averageClose(
    history.slice(-(slowPeriod + 1), -1)
  );

  const currentSlow = averageClose(
    history.slice(-slowPeriod)
  );

  const lastClose =
    history.at(-1)?.close ?? 0;

  const bullishCrossover =
    previousFast <= previousSlow &&
    currentFast > currentSlow;

  const bearishCrossover =
    previousFast >= previousSlow &&
    currentFast < currentSlow;

  const bullishTrend =
    currentFast > currentSlow &&
    lastClose > currentFast;

  const bullishEntry =
    bullishCrossover || bullishTrend;

  return {
    bullishEntry,
    bearishCrossover,
    currentFast,
    currentSlow
  };
}
