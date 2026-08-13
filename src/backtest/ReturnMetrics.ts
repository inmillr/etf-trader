import type { EquityPoint } from "./BacktestEngine.js";

export interface PeriodReturnMetrics {
  averageDailyReturn: number;
  medianDailyReturn: number;
  averageWeeklyReturn: number;
  medianWeeklyReturn: number;
  compoundedReturn: number;
  bestDailyReturn: number;
  worstDailyReturn: number;
  bestWeeklyReturn: number;
  worstWeeklyReturn: number;
  positiveDays: number;
  totalDays: number;
  positiveWeeks: number;
  totalWeeks: number;
  dailyWinRate: number;
  weeklyWinRate: number;
}

const EMPTY_METRICS: PeriodReturnMetrics = {
  averageDailyReturn: 0,
  medianDailyReturn: 0,
  averageWeeklyReturn: 0,
  medianWeeklyReturn: 0,
  compoundedReturn: 0,
  bestDailyReturn: 0,
  worstDailyReturn: 0,
  bestWeeklyReturn: 0,
  worstWeeklyReturn: 0,
  positiveDays: 0,
  totalDays: 0,
  positiveWeeks: 0,
  totalWeeks: 0,
  dailyWinRate: 0,
  weeklyWinRate: 0
};

function calculatePeriodReturns(
  equityByKey: Map<string, number>
): number[] {
  const entries = Array.from(
    equityByKey.entries()
  ).sort(
    ([a], [b]) =>
      a.localeCompare(b)
  );

  const returns: number[] = [];

  for (
    let i = 1;
    i < entries.length;
    i++
  ) {
    const previousEquity =
      entries[i - 1]?.[1];

    const currentEquity =
      entries[i]?.[1];

    if (
      previousEquity === undefined ||
      currentEquity === undefined ||
      previousEquity <= 0
    ) {
      continue;
    }

    returns.push(
      (
        (currentEquity - previousEquity) /
        previousEquity
      ) * 100
    );
  }

  return returns;
}

function summarizeReturns(
  returns: number[]
): {
  average: number;
  median: number;
  compounded: number;
  best: number;
  worst: number;
  positive: number;
  total: number;
  winRate: number;
} {
  if (returns.length === 0) {
    return {
      average: 0,
      median: 0,
      compounded: 0,
      best: 0,
      worst: 0,
      positive: 0,
      total: 0,
      winRate: 0
    };
  }

  const average =
    returns.reduce(
      (sum, value) =>
        sum + value,
      0
    ) / returns.length;

  const growthFactor =
    returns.reduce(
      (factor, value) =>
        factor * (1 + value / 100),
      1
    );

  const sorted = [...returns].sort(
    (a, b) => a - b
  );

  const middle = Math.floor(
    sorted.length / 2
  );

  const median =
    sorted.length % 2 === 0
      ? (
          sorted[middle - 1]! +
          sorted[middle]!
        ) / 2
      : sorted[middle]!;

  const positive =
    returns.filter(
      (value) => value > 0
    ).length;

  return {
    average,
    median,
    compounded: (growthFactor - 1) * 100,
    best: Math.max(...returns),
    worst: Math.min(...returns),
    positive,
    total: returns.length,
    winRate: (positive / returns.length) * 100
  };
}

export function calculatePeriodReturnMetrics(
  equityCurve: EquityPoint[]
): PeriodReturnMetrics {
  if (equityCurve.length === 0) {
    return { ...EMPTY_METRICS };
  }

  const dailyEquity = new Map<string, number>();

  for (const point of equityCurve) {
    const key = point.timestamp
      .toISOString()
      .slice(0, 10);

    dailyEquity.set(
      key,
      point.equity
    );
  }

  const weeklyEquity = new Map<string, number>();

  for (const point of equityCurve) {
    const date = new Date(point.timestamp);
    const day = date.getUTCDay();
    const daysFromMonday =
      day === 0 ? 6 : day - 1;

    const weekStart = new Date(date);

    weekStart.setUTCDate(
      date.getUTCDate() - daysFromMonday
    );

    weekStart.setUTCHours(0, 0, 0, 0);

    const key = weekStart
      .toISOString()
      .slice(0, 10);

    weeklyEquity.set(
      key,
      point.equity
    );
  }

  const dailyReturns =
    calculatePeriodReturns(dailyEquity);

  const weeklyReturns =
    calculatePeriodReturns(weeklyEquity);

  const daily = summarizeReturns(
    dailyReturns
  );

  const weekly = summarizeReturns(
    weeklyReturns
  );

  return {
    averageDailyReturn: daily.average,
    medianDailyReturn: daily.median,
    averageWeeklyReturn: weekly.average,
    medianWeeklyReturn: weekly.median,
    compoundedReturn: weekly.compounded,
    bestDailyReturn: daily.best,
    worstDailyReturn: daily.worst,
    bestWeeklyReturn: weekly.best,
    worstWeeklyReturn: weekly.worst,
    positiveDays: daily.positive,
    totalDays: daily.total,
    positiveWeeks: weekly.positive,
    totalWeeks: weekly.total,
    dailyWinRate: daily.winRate,
    weeklyWinRate: weekly.winRate
  };
}
