import type {
  Strategy,
  StrategyContext,
  StrategyOrder
} from "../backtest/Strategy.js";
import { calculateTradeRisk } from "../risk/TradeRisk.js";
import type { Candle } from "../types/market.js";
import {
  evaluateSignal,
  type StrategyParameters
} from "./SignalEvaluator.js";
import { buildStrategySnapshot } from "./StrategySnapshotBuilder.js";

export interface IntradayMomentumOptions {
  signalParameters?: StrategyParameters;
  atrMultiplier?: number;
  riskPercent?: number;
  maxPositionPercent?: number;
  rewardRiskRatio?: number;
  entryWindowStartMinutes?: number;
  entryWindowEndMinutes?: number;
}

export interface PositionRiskLevels {
  stopPrice: number;
  targetPrice: number;
}

export interface IntradayStrategy extends Strategy {
  getPositionRisk(
    symbol: string
  ): PositionRiskLevels | undefined;

  clearPositionRisk(
    symbol: string
  ): void;
}

export const DEFAULT_INTRADAY_SIGNAL_PARAMETERS: StrategyParameters = {
  minimumRelativeVolume: 1.2,
  minimumBullishRSI: 55,
  maximumBearishRSI: 45
};

export const TUNED_INTRADAY_OPTIONS: IntradayMomentumOptions = {
  signalParameters: {
    minimumRelativeVolume: 1.3,
    minimumBullishRSI: 55,
    maximumBearishRSI: 40
  },
  atrMultiplier: 2.5,
  riskPercent: 1,
  maxPositionPercent: 100,
  rewardRiskRatio: 2.0,
  entryWindowStartMinutes: 14 * 60 + 30,
  entryWindowEndMinutes: 17 * 60
};

export const HYBRID_INTRADAY_OPTIONS: IntradayMomentumOptions = {
  signalParameters: {
    minimumRelativeVolume: 1.2,
    minimumBullishRSI: 52,
    maximumBearishRSI: 38
  },
  atrMultiplier: 3.0,
  riskPercent: 1,
  maxPositionPercent: 100,
  rewardRiskRatio: 2.5,
  entryWindowStartMinutes: 14 * 60 + 30,
  entryWindowEndMinutes: 17 * 60
};

export class IntradayMomentumStrategy
  implements IntradayStrategy {

  private readonly signalParameters: StrategyParameters;
  private readonly atrMultiplier: number;
  private readonly riskPercent: number;
  private readonly maxPositionPercent: number;
  private readonly rewardRiskRatio: number;
  private readonly entryWindowStartMinutes: number;
  private readonly entryWindowEndMinutes: number;

  private readonly riskBySymbol =
    new Map<string, PositionRiskLevels>();

  constructor(
    options: IntradayMomentumOptions = {}
  ) {
    this.signalParameters =
      options.signalParameters ??
      DEFAULT_INTRADAY_SIGNAL_PARAMETERS;

    this.atrMultiplier =
      options.atrMultiplier ?? 1.5;

    this.riskPercent =
      options.riskPercent ?? 1;

    this.maxPositionPercent =
      options.maxPositionPercent ?? 100;

    this.rewardRiskRatio =
      options.rewardRiskRatio ?? 2;

    this.entryWindowStartMinutes =
      options.entryWindowStartMinutes ??
      14 * 60 + 30;

    this.entryWindowEndMinutes =
      options.entryWindowEndMinutes ??
      20 * 60;
  }

  private isWithinEntryWindow(
    timestamp: Date
  ): boolean {
    const minutes =
      timestamp.getUTCHours() * 60 +
      timestamp.getUTCMinutes();

    return (
      minutes >=
        this.entryWindowStartMinutes &&
      minutes <= this.entryWindowEndMinutes
    );
  }

  onCandle(
    context: StrategyContext
  ): StrategyOrder | null {
    const snapshot = buildStrategySnapshot(
      context.history,
      context.candle
    );

    if (!snapshot) {
      return null;
    }

    const symbol =
      context.candle.symbol;

    if (context.positionQuantity > 0) {
      const signal = evaluateSignal(
        snapshot,
        this.signalParameters
      );

      if (signal?.direction === "short") {
        this.clearPositionRisk(symbol);

        return {
          side: "sell",
          quantity:
            context.positionQuantity
        };
      }

      return null;
    }

    const signal = evaluateSignal(
      snapshot,
      this.signalParameters
    );

    if (
      !signal ||
      signal.direction !== "long"
    ) {
      return null;
    }

    if (
      !this.isWithinEntryWindow(
        context.candle.timestamp
      )
    ) {
      return null;
    }

    const equity =
      context.cash +
      context.positionQuantity *
      context.candle.close;

    const trade = calculateTradeRisk({
      accountEquity: equity,
      entryPrice: context.candle.close,
      atr: snapshot.atr,
      atrMultiplier: this.atrMultiplier,
      direction: "long",
      riskPercent: this.riskPercent,
      maxPositionPercent:
        this.maxPositionPercent,
      rewardRiskRatio:
        this.rewardRiskRatio
    });

    if (trade.quantity <= 0) {
      return null;
    }

    const quantity = Math.min(
      trade.quantity,
      context.estimatedBuyQuantity
    );

    if (quantity <= 0) {
      return null;
    }

    this.riskBySymbol.set(
      symbol,
      {
        stopPrice: trade.stopPrice,
        targetPrice: trade.targetPrice
      }
    );

    return {
      side: "buy",
      quantity
    };
  }

  getPositionRisk(
    symbol: string
  ): PositionRiskLevels | undefined {
    return this.riskBySymbol.get(symbol);
  }

  clearPositionRisk(
    symbol: string
  ): void {
    this.riskBySymbol.delete(symbol);
  }
}

export function isIntradayStrategy(
  strategy: Strategy
): strategy is IntradayStrategy {
  return (
    "getPositionRisk" in strategy &&
    "clearPositionRisk" in strategy
  );
}
