import type { Candle } from "../types/market.js";

import type {
  OrderSide
} from "./PortfolioSimulator.js";

export interface StrategyContext {
  candle: Candle;

  history: Candle[];

  cash: number;

  positionQuantity: number;

  estimatedBuyQuantity: number;
}

export interface StrategyOrder {
  side: OrderSide;

  quantity: number;
}

export interface Strategy {
  onCandle(
    context: StrategyContext
  ): StrategyOrder | null;
}
