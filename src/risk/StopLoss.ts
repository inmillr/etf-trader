import type { TradeDirection } from "../types/trading.js";

export interface StopLossInput {
  entryPrice: number;
  atr: number;
  atrMultiplier: number;
  direction: TradeDirection;
}

export function calculateStopPrice(
  input: StopLossInput
): number {
  const {
    entryPrice,
    atr,
    atrMultiplier,
    direction
  } = input;

  if (entryPrice <= 0) {
    throw new Error(
      "Entry price must be greater than zero."
    );
  }

  if (atr <= 0) {
    throw new Error(
      "ATR must be greater than zero."
    );
  }

  if (atrMultiplier <= 0) {
    throw new Error(
      "ATR multiplier must be greater than zero."
    );
  }

  const stopDistance =
    atr * atrMultiplier;

  if (direction === "long") {
    return entryPrice - stopDistance;
  }

  return entryPrice + stopDistance;
}