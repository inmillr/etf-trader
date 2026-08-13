import { calculateATR } from "../indicators/ATR.js";
import { calculateEMA } from "../indicators/EMA.js";
import { calculateRSI } from "../indicators/RSI.js";
import { calculateVWAP } from "../indicators/VWAP.js";
import { calculateRelativeVolume } from "../indicators/Volume.js";
import type { Candle } from "../types/market.js";
import type { StrategySnapshot } from "./SignalEvaluator.js";

export interface SnapshotBuilderOptions {
  emaFastPeriod?: number;
  emaSlowPeriod?: number;
  rsiPeriod?: number;
  volumePeriod?: number;
  atrPeriod?: number;
}

const DEFAULT_OPTIONS: Required<SnapshotBuilderOptions> = {
  emaFastPeriod: 9,
  emaSlowPeriod: 20,
  rsiPeriod: 14,
  volumePeriod: 20,
  atrPeriod: 14
};

function sameUtcDay(
  left: Date,
  right: Date
): boolean {
  return (
    left.toISOString().slice(0, 10) ===
    right.toISOString().slice(0, 10)
  );
}

export function buildStrategySnapshot(
  history: Candle[],
  candle: Candle,
  options: SnapshotBuilderOptions = {}
): StrategySnapshot | null {
  const resolved = {
    ...DEFAULT_OPTIONS,
    ...options
  };

  const sessionCandles = [
    ...history.filter((bar) =>
      sameUtcDay(bar.timestamp, candle.timestamp)
    ),
    candle
  ];

  const closes = sessionCandles.map(
    (bar) => bar.close
  );

  const minimumBars = Math.max(
    resolved.emaSlowPeriod + 1,
    resolved.rsiPeriod + 1,
    resolved.volumePeriod + 1,
    resolved.atrPeriod + 1
  );

  if (closes.length < minimumBars) {
    return null;
  }

  const ema9Values = calculateEMA(
    closes,
    resolved.emaFastPeriod
  );

  const ema20Values = calculateEMA(
    closes,
    resolved.emaSlowPeriod
  );

  const rsiValues = calculateRSI(
    closes,
    resolved.rsiPeriod
  );

  const vwapValues = calculateVWAP(
    sessionCandles
  );

  const relativeVolumeValues =
    calculateRelativeVolume(
      sessionCandles,
      resolved.volumePeriod
    );

  const atrValues = calculateATR(
    sessionCandles,
    resolved.atrPeriod
  );

  if (
    ema9Values.length === 0 ||
    ema20Values.length === 0 ||
    rsiValues.length === 0 ||
    vwapValues.length === 0 ||
    relativeVolumeValues.length === 0 ||
    atrValues.length === 0
  ) {
    return null;
  }

  return {
    symbol: candle.symbol,
    timestamp: candle.timestamp,
    price: candle.close,
    ema9: ema9Values[ema9Values.length - 1]!,
    ema20: ema20Values[ema20Values.length - 1]!,
    vwap: vwapValues[vwapValues.length - 1]!,
    relativeVolume:
      relativeVolumeValues[
        relativeVolumeValues.length - 1
      ]!,
    rsi: rsiValues[rsiValues.length - 1]!,
    atr: atrValues[atrValues.length - 1]!
  };
}
