import type { Candle } from "../types/market.js";
import type { TradingSignal } from "../types/trading.js";

export interface Strategy {
  evaluate(
    candles: Candle[]
  ): TradingSignal | null;
}