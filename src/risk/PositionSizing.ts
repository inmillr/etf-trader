export interface PositionSizingInput {
  accountEquity: number;
  entryPrice: number;
  stopPrice: number;
  riskPercent: number;
  maxPositionPercent: number;
}

export interface PositionSizingResult {
  riskAmount: number;
  riskPerShare: number;
  quantity: number;
  positionValue: number;
}

export function calculatePositionSize(
  input: PositionSizingInput
): PositionSizingResult {
  const {
    accountEquity,
    entryPrice,
    stopPrice,
    riskPercent,
    maxPositionPercent
  } = input;

  if (accountEquity <= 0) {
    throw new Error("Account equity must be greater than zero.");
  }

  if (entryPrice <= 0) {
    throw new Error("Entry price must be greater than zero.");
  }

  if (stopPrice <= 0) {
    throw new Error("Stop price must be greater than zero.");
  }

  if (riskPercent <= 0) {
    throw new Error("Risk percent must be greater than zero.");
  }

  if (maxPositionPercent <= 0) {
    throw new Error(
      "Maximum position percent must be greater than zero."
    );
  }

  const riskAmount =
    accountEquity * (riskPercent / 100);

  const riskPerShare =
    Math.abs(entryPrice - stopPrice);

  if (riskPerShare === 0) {
    throw new Error(
      "Entry price and stop price cannot be equal."
    );
  }

  const riskBasedQuantity = Math.floor(
    riskAmount / riskPerShare
  );

  const maximumPositionValue =
    accountEquity * (maxPositionPercent / 100);

  const allocationBasedQuantity = Math.floor(
    maximumPositionValue / entryPrice
  );

  const quantity = Math.min(
    riskBasedQuantity,
    allocationBasedQuantity
  );

  const positionValue =
    quantity * entryPrice;

  return {
    riskAmount,
    riskPerShare,
    quantity,
    positionValue
  };
}