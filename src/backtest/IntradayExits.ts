import type { Candle } from "../types/market.js";
import {
  PortfolioSimulator,
  type OrderSide
} from "./PortfolioSimulator.js";
import type { TradeContext } from "./TradeReason.js";
import type { PositionRiskLevels } from "../strategy/IntradayMomentumStrategy.js";

export type StopTargetExitReason =
  | "stop"
  | "target";

export interface StopTargetExit {
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  reason: StopTargetExitReason;
}

export function checkStopTargetExit(
  candle: Candle,
  positionQuantity: number,
  risk: PositionRiskLevels
): StopTargetExit | null {
  if (positionQuantity <= 0) {
    return null;
  }

  if (candle.open <= risk.stopPrice) {
    return {
      symbol: candle.symbol,
      side: "sell",
      quantity: positionQuantity,
      price: candle.open,
      reason: "stop"
    };
  }

  if (candle.low <= risk.stopPrice) {
    return {
      symbol: candle.symbol,
      side: "sell",
      quantity: positionQuantity,
      price: risk.stopPrice,
      reason: "stop"
    };
  }

  if (candle.open >= risk.targetPrice) {
    return {
      symbol: candle.symbol,
      side: "sell",
      quantity: positionQuantity,
      price: candle.open,
      reason: "target"
    };
  }

  if (candle.high >= risk.targetPrice) {
    return {
      symbol: candle.symbol,
      side: "sell",
      quantity: positionQuantity,
      price: risk.targetPrice,
      reason: "target"
    };
  }

  return null;
}

export function closePositionAtPrice(
  portfolio: PortfolioSimulator,
  candle: Candle,
  quantity: number,
  price: number,
  context?: TradeContext
): void {
  if (quantity <= 0) {
    return;
  }

  portfolio.sell(
    candle.symbol,
    quantity,
    candle,
    price,
    context
  );
}

export function dayKey(
  timestamp: Date
): string {
  return timestamp.toISOString().slice(0, 10);
}
