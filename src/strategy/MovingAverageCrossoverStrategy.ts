  import type { Candle } from "../types/market.js";

import type {
  Strategy,
  StrategyContext,
  StrategyOrder
} from "../backtest/Strategy.js";

export interface MovingAverageCrossoverOptions {
  fastPeriod: number;
  slowPeriod: number;

  rsiPeriod?: number;
  rsiThreshold?: number;
  trendPeriod?: number;
}

export class MovingAverageCrossoverStrategy
  implements Strategy {

private readonly fastPeriod: number;
private readonly slowPeriod: number;

private readonly rsiPeriod: number | undefined;
private readonly rsiThreshold: number | undefined;
private readonly trendPeriod: number | undefined;

private bullishCrossovers = 0;
private bullishTrendEntries = 0;
private rsiRejectedEntries = 0;
private trendRejectedEntries = 0;
private successfulEntries = 0;
private bearishExits = 0;

  constructor(
    options: MovingAverageCrossoverOptions
  ) {
    if (
      options.fastPeriod <= 0 ||
      options.slowPeriod <= 0
    ) {
      throw new Error(
        "Moving average periods must be greater than zero."
      );
    }

    if (
      options.fastPeriod >= options.slowPeriod
    ) {
      throw new Error(
        "fastPeriod must be less than slowPeriod."
      );
    }

    this.fastPeriod =
      options.fastPeriod;

    this.slowPeriod =
      options.slowPeriod;

    /*
     * RSI and trend filters are opt-in.
     *
     * This preserves the original moving-average
     * crossover behavior when these options are not
     * supplied.
     */
    this.rsiPeriod =
      options.rsiPeriod;

    this.rsiThreshold =
      options.rsiThreshold;

    this.trendPeriod =
      options.trendPeriod;

    if (
      this.rsiPeriod !== undefined &&
      this.rsiPeriod <= 0
    ) {
      throw new Error(
        "rsiPeriod must be greater than zero."
      );
    }

    if (
  this.rsiThreshold !== undefined &&
  (
    this.rsiThreshold <= 0 ||
    this.rsiThreshold >= 100
  )
) {
  throw new Error(
    "rsiThreshold must be between 0 and 100."
  );
}

    if (
      this.trendPeriod !== undefined &&
      this.trendPeriod <= 0
    ) {
      throw new Error(
        "trendPeriod must be greater than zero."
      );
    }
  }

  onCandle(
  context: StrategyContext
): StrategyOrder | null {

  const history = [
    ...context.history,
    context.candle
  ];

  /*
   * Only require enough history for the filters
   * that are actually enabled.
   */
  const requiredHistory = [
    this.slowPeriod + 1
  ];

  if (this.rsiPeriod !== undefined) {
    requiredHistory.push(
      this.rsiPeriod + 1
    );
  }

  if (this.trendPeriod !== undefined) {
    requiredHistory.push(
      this.trendPeriod
    );
  }

  const minimumHistory =
    Math.max(...requiredHistory);

  if (
    history.length <
    minimumHistory
  ) {
    return null;
  }

  const previousFast =
    this.averageClose(
      history.slice(
        -(this.fastPeriod + 1),
        -1
      )
    );

  const currentFast =
    this.averageClose(
      history.slice(
        -this.fastPeriod
      )
    );

  const previousSlow =
    this.averageClose(
      history.slice(
        -(this.slowPeriod + 1),
        -1
      )
    );

  const currentSlow =
    this.averageClose(
      history.slice(
        -this.slowPeriod
      )
    );

  const bullishCrossover =
    previousFast <= previousSlow &&
    currentFast > currentSlow;

  const bearishCrossover =
    previousFast >= previousSlow &&
    currentFast < currentSlow;

  /*
   * Entry can occur either on a bullish crossover
   * or during an existing bullish trend.
   *
   * This allows the strategy to participate in
   * an established upward move instead of waiting
   * for another crossover.
   */
  const bullishTrend =
    currentFast > currentSlow &&
    context.candle.close > currentFast;

  const bullishEntry =
    bullishCrossover ||
    bullishTrend;

  /*
   * Evaluate entry conditions.
   */
  if (
    bullishEntry &&
    context.positionQuantity === 0
  ) {

    if (bullishCrossover) {
    this.bullishCrossovers++;
} else if (bullishTrend) {
    this.bullishTrendEntries++;
}

    let passesRsiFilter = true;
    let passesTrendFilter = true;

    /*
     * RSI is used as a momentum confirmation.
     *
     * Example:
     * RSI > 55 means momentum must be positive
     * enough to justify the entry.
     */
    if (
      this.rsiPeriod !== undefined &&
      this.rsiThreshold !== undefined
    ) {

      const rsi =
        this.calculateRsi(
          history,
          this.rsiPeriod
        );

      passesRsiFilter =
        rsi > this.rsiThreshold;

      if (!passesRsiFilter) {
        this.rsiRejectedEntries++;
      }
    }

    /*
     * Optional longer-term trend filter.
     */
    if (
      this.trendPeriod !== undefined
    ) {

      const trendAverage =
        this.averageClose(
          history.slice(
            -this.trendPeriod
          )
        );

      const price =
        context.candle.close;

      passesTrendFilter =
        price > trendAverage;

      if (!passesTrendFilter) {
        this.trendRejectedEntries++;
      }
    }

    /*
     * Enter only when all enabled filters pass.
     */
    if (
      passesRsiFilter &&
      passesTrendFilter
    ) {

      const quantity =
        context.estimatedBuyQuantity;

      if (quantity <= 0) {
        return null;
      }

      this.successfulEntries++;

      return {
        side: "buy",
        quantity
      };
    }
  }

  /*
   * Exit on bearish crossover.
   *
   * Exit behavior remains unchanged for this test.
   */
  if (
    bearishCrossover &&
    context.positionQuantity > 0
  ) {

    this.bearishExits++;

    return {
      side: "sell",
      quantity:
        context.positionQuantity
    };
  }

  return null;
}

  private averageClose(
    candles: Candle[]
  ): number {
    if (candles.length === 0) {
      return 0;
    }

    const total =
      candles.reduce(
        (sum, candle) =>
          sum + candle.close,
        0
      );

    return total / candles.length;
  }

  private calculateRsi(
    candles: Candle[],
    period: number
  ): number {
    if (
      candles.length <= period
    ) {
      return 50;
    }

    let gains = 0;
    let losses = 0;

    for (
      let index = 1;
      index <= period;
      index++
    ) {
      const previous =
        candles[
          candles.length -
          period -
          1 +
          index -
          1
        ];

      const current =
        candles[
          candles.length -
          period -
          1 +
          index
        ];

      if (
        !previous ||
        !current
      ) {
        continue;
      }

      const change =
        current.close -
        previous.close;

      if (change > 0) {
        gains += change;
      } else {
        losses -= change;
      }
    }

    const averageGain =
      gains / period;

    const averageLoss =
      losses / period;

    if (averageLoss === 0) {
      return 100;
    }

    const relativeStrength =
      averageGain /
      averageLoss;

    return (
      100 -
      100 /
        (1 + relativeStrength)
    );
  }

getDiagnostics(): {
    bullishCrossovers: number;
    bullishTrendEntries: number;
    rsiRejectedEntries: number;
    trendRejectedEntries: number;
    successfulEntries: number;
    bearishExits: number;
} {
  return {
    bullishCrossovers: this.bullishCrossovers,
    bullishTrendEntries: this.bullishTrendEntries,
    rsiRejectedEntries: this.rsiRejectedEntries,
    trendRejectedEntries: this.trendRejectedEntries,
    successfulEntries: this.successfulEntries,
    bearishExits: this.bearishExits
};
}
}