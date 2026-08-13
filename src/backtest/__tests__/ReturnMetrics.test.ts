import { describe, expect, test } from "vitest";
import type { EquityPoint } from "../BacktestEngine.js";
import { calculatePeriodReturnMetrics } from "../ReturnMetrics.js";

describe("ReturnMetrics", () => {
  test("calculates average daily and weekly returns", () => {
    const equityCurve: EquityPoint[] = [
      {
        timestamp: new Date("2026-01-05T00:00:00Z"),
        equity: 10_000
      },
      {
        timestamp: new Date("2026-01-06T00:00:00Z"),
        equity: 10_100
      },
      {
        timestamp: new Date("2026-01-07T00:00:00Z"),
        equity: 10_050
      },
      {
        timestamp: new Date("2026-01-08T00:00:00Z"),
        equity: 10_200
      },
      {
        timestamp: new Date("2026-01-12T00:00:00Z"),
        equity: 10_300
      }
    ];

    const metrics =
      calculatePeriodReturnMetrics(
        equityCurve
      );

    expect(metrics.totalDays).toBe(4);
    expect(metrics.averageDailyReturn).toBeCloseTo(0.744, 2);
    expect(metrics.totalWeeks).toBe(1);
    expect(metrics.averageWeeklyReturn).toBeCloseTo(0.98, 1);
    expect(metrics.positiveDays).toBe(3);
    expect(metrics.dailyWinRate).toBe(75);
  });

  test("returns zeros for empty equity curve", () => {
    const metrics =
      calculatePeriodReturnMetrics([]);

    expect(metrics.averageDailyReturn).toBe(0);
    expect(metrics.averageWeeklyReturn).toBe(0);
  });
});
