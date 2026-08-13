import {
  evaluateTrend,
  evaluateVWAP,
  evaluateVolume,
  evaluateRSI
} from "./conditions.js";

import type { TradingSignal } from "../types/trading.js";

export interface StrategySnapshot {
  symbol: string;
  timestamp: Date;

  price: number;

  ema9: number;
  ema20: number;

  vwap: number;

  relativeVolume: number;

  rsi: number;

  atr: number;
}

export interface StrategyParameters {
  minimumRelativeVolume: number;

  minimumBullishRSI: number;
  maximumBearishRSI: number;
}

export function evaluateSignal(
  snapshot: StrategySnapshot,
  parameters: StrategyParameters
): TradingSignal | null {
  const trend = evaluateTrend(
    snapshot.price,
    snapshot.ema9,
    snapshot.ema20
  );

  const vwap = evaluateVWAP(
    snapshot.price,
    snapshot.vwap
  );

  const volume = evaluateVolume(
    snapshot.relativeVolume,
    parameters.minimumRelativeVolume
  );

  const rsi = evaluateRSI(
    snapshot.rsi,
    parameters.minimumBullishRSI,
    parameters.maximumBearishRSI
  );

  const bullish =
    trend.bullish &&
    vwap.bullish &&
    volume.confirmed &&
    rsi.bullish;

  const bearish =
    trend.bearish &&
    vwap.bearish &&
    volume.confirmed &&
    rsi.bearish;

  if (!bullish && !bearish) {
    return null;
  }

  const direction = bullish ? "long" : "short";

  const reasons: string[] = [];

  if (direction === "long") {
    reasons.push("Bullish EMA alignment");
    reasons.push("Price above VWAP");
    reasons.push(
      `RVOL ${snapshot.relativeVolume.toFixed(2)}`
    );
    reasons.push(
      `RSI ${snapshot.rsi.toFixed(2)}`
    );
  } else {
    reasons.push("Bearish EMA alignment");
    reasons.push("Price below VWAP");
    reasons.push(
      `RVOL ${snapshot.relativeVolume.toFixed(2)}`
    );
    reasons.push(
      `RSI ${snapshot.rsi.toFixed(2)}`
    );
  }

  return {
    symbol: snapshot.symbol,
    direction,
    timestamp: snapshot.timestamp,

    entryPrice: snapshot.price,

    // Temporary values.
    // The risk engine will determine these later.
    stopPrice: snapshot.price,
    targetPrice: snapshot.price,

    confidence: 100,

    reasons
  };
}