import type { TradeDirection } from "../types/trading.js";

export interface ProfitTargetInput {
  entryPrice: number;
  stopPrice: number;
  rewardRiskRatio: number;
  direction: TradeDirection;
}

export function calculateProfitTarget(
  input: ProfitTargetInput
): number {
  const {
    entryPrice,
    stopPrice,
    rewardRiskRatio,
    direction
  } = input;

  if (entryPrice <= 0) {
    throw new Error(
      "Entry price must be greater than zero."
    );
  }

  if (stopPrice <= 0) {
    throw new Error(
      "Stop price must be greater than zero."
    );
  }

  if (rewardRiskRatio <= 0) {
    throw new Error(
      "Reward/risk ratio must be greater than zero."
    );
  }

  const riskPerShare =
    Math.abs(entryPrice - stopPrice);

  if (riskPerShare === 0) {
    throw new Error(
      "Entry price and stop price cannot be equal."
    );
  }

  const targetDistance =
    riskPerShare * rewardRiskRatio;

  if (direction === "long") {
    return entryPrice + targetDistance;
  }

  return entryPrice - targetDistance;
}