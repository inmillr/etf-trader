import type { Candle } from "../types/market.js";
import type { TradingSignal } from "../types/trading.js";
import type { Strategy } from "./Strategy.js";

export class MomentumStrategy implements Strategy {
  evaluate(
    candles: Candle[]
  ): TradingSignal | null {
    if (candles.length === 0) {
      return null;
    }

    return null;
  }
}