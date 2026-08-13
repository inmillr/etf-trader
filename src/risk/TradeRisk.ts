import type { TradeDirection } from "../types/trading.js";
import { calculateStopPrice } from "./StopLoss.js";
import { calculatePositionSize } from "./PositionSizing.js";
import { calculateProfitTarget } from "./ProfitTarget.js";

export interface TradeRiskInput {
  accountEquity: number;

  entryPrice: number;
  atr: number;
  atrMultiplier: number;

  direction: TradeDirection;

  riskPercent: number;
  maxPositionPercent: number;

  rewardRiskRatio: number;
}

export interface TradeRiskResult {
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;

  riskAmount: number;
  riskPerShare: number;

  quantity: number;
  positionValue: number;

  potentialLoss: number;
  potentialProfit: number;
}

export function calculateTradeRisk(
  input: TradeRiskInput
): TradeRiskResult {
  const stopPrice = calculateStopPrice({
    entryPrice: input.entryPrice,
    atr: input.atr,
    atrMultiplier: input.atrMultiplier,
    direction: input.direction
  });

  const targetPrice = calculateProfitTarget({
    entryPrice: input.entryPrice,
    stopPrice,
    rewardRiskRatio: input.rewardRiskRatio,
    direction: input.direction
  });

  const position = calculatePositionSize({
    accountEquity: input.accountEquity,
    entryPrice: input.entryPrice,
    stopPrice,
    riskPercent: input.riskPercent,
    maxPositionPercent: input.maxPositionPercent
  });

  const potentialLoss =
    position.riskPerShare * position.quantity;

  const potentialProfit =
    Math.abs(targetPrice - input.entryPrice) *
    position.quantity;

  return {
    entryPrice: input.entryPrice,
    stopPrice,
    targetPrice,

    riskAmount: position.riskAmount,
    riskPerShare: position.riskPerShare,

    quantity: position.quantity,
    positionValue: position.positionValue,

    potentialLoss,
    potentialProfit
  };
}