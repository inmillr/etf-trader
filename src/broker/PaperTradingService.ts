import type { TradingConfig } from "../config/TradingConfig.js";
import type {
  DualMomentumSignalResult
} from "../signals/DualMomentumSignal.js";
import type {
  AlpacaAccount,
  AlpacaPosition
} from "./AlpacaTradingTypes.js";

export interface PaperTradeStep {
  side: "buy" | "sell";
  symbol: string;
  qty: number;
  reason: string;
}

export interface PaperTradePlan {
  signalAction: DualMomentumSignalResult["action"];
  signalReason: string;
  targetSymbol: string | null;
  brokerSymbol: string | null;
  brokerQty: number;
  steps: PaperTradeStep[];
  noTrade: boolean;
  noTradeReason?: string;
}

export interface BrokerHoldings {
  symbol: string | null;
  qty: number;
}

export function resolveBrokerHoldings(
  positions: AlpacaPosition[]
): BrokerHoldings {
  const longPositions = positions.filter(
    (position) =>
      position.side === "long" &&
      Number(position.qty) > 0
  );

  if (longPositions.length === 0) {
    return { symbol: null, qty: 0 };
  }

  if (longPositions.length > 1) {
    throw new Error(
      "Multiple long positions found. Aggressive paper trading expects a single ETF position or cash."
    );
  }

  const position = longPositions[0]!;

  return {
    symbol: position.symbol,
    qty: Math.floor(Number(position.qty))
  };
}

export function calculateBuyQty(
  buyingPower: number,
  referencePrice: number,
  cashReservePercent: number
): number {
  if (
    buyingPower <= 0 ||
    referencePrice <= 0
  ) {
    return 0;
  }

  const budget =
    buyingPower * (1 - cashReservePercent);

  return Math.floor(budget / referencePrice);
}

export function buildPaperTradePlan(
  signal: Pick<
    DualMomentumSignalResult,
    | "action"
    | "targetSymbol"
    | "reason"
  >,
  account: Pick<
    AlpacaAccount,
    "buying_power"
  >,
  holdings: BrokerHoldings,
  referencePrice: number | null,
  tradingConfig: Pick<
    TradingConfig,
    "cashReservePercent"
  >
): PaperTradePlan {
  const base: Omit<
    PaperTradePlan,
    "steps" | "noTrade" | "noTradeReason"
  > = {
    signalAction: signal.action,
    signalReason: signal.reason,
    targetSymbol: signal.targetSymbol,
    brokerSymbol: holdings.symbol,
    brokerQty: holdings.qty
  };

  const buyingPower =
    Number(account.buying_power);

  if (signal.action === "hold") {
    return {
      ...base,
      steps: [],
      noTrade: true,
      noTradeReason:
        "Signal is HOLD — no order required."
    };
  }

  if (
    signal.action === "exit" ||
    signal.action === "stay_cash"
  ) {
    if (!holdings.symbol || holdings.qty <= 0) {
      return {
        ...base,
        steps: [],
        noTrade: true,
        noTradeReason:
          "Already flat — no sell required."
      };
    }

    return {
      ...base,
      steps: [
        {
          side: "sell",
          symbol: holdings.symbol,
          qty: holdings.qty,
          reason:
            signal.action === "exit"
              ? "Exit signal — close position."
              : "Stay cash — close position."
        }
      ],
      noTrade: false
    };
  }

  if (
    signal.action === "buy" ||
    signal.action === "rotate"
  ) {
    if (!signal.targetSymbol) {
      return {
        ...base,
        steps: [],
        noTrade: true,
        noTradeReason:
          "Signal has no target symbol."
      };
    }

    if (
      holdings.symbol === signal.targetSymbol &&
      holdings.qty > 0
    ) {
      return {
        ...base,
        steps: [],
        noTrade: true,
        noTradeReason:
          `Already holding ${signal.targetSymbol}.`
      };
    }

    const steps: PaperTradeStep[] = [];

    if (
      holdings.symbol &&
      holdings.qty > 0 &&
      holdings.symbol !== signal.targetSymbol
    ) {
      steps.push({
        side: "sell",
        symbol: holdings.symbol,
        qty: holdings.qty,
        reason:
          signal.action === "rotate"
            ? `Rotate out of ${holdings.symbol}.`
            : `Close ${holdings.symbol} before entry.`
      });
    }

    if (referencePrice === null) {
      return {
        ...base,
        steps,
        noTrade: true,
        noTradeReason:
          steps.length > 0
            ? "Sell planned but no reference price for buy sizing."
            : "No reference price available for buy sizing."
      };
    }

    const buyQty = calculateBuyQty(
      buyingPower,
      referencePrice,
      tradingConfig.cashReservePercent
    );

    if (buyQty <= 0) {
      return {
        ...base,
        steps,
        noTrade: true,
        noTradeReason:
          "Insufficient buying power for at least one share."
      };
    }

    steps.push({
      side: "buy",
      symbol: signal.targetSymbol,
      qty: buyQty,
      reason:
        signal.action === "rotate"
          ? `Rotate into ${signal.targetSymbol}.`
          : `Enter ${signal.targetSymbol}.`
    });

    return {
      ...base,
      steps,
      noTrade: false
    };
  }

  return {
    ...base,
    steps: [],
    noTrade: true,
    noTradeReason: "Unhandled signal action."
  };
}

export function formatPaperTradePlan(
  plan: PaperTradePlan
): string {
  const lines = [
    `Signal action: ${plan.signalAction.toUpperCase()}`,
    `Reason:        ${plan.signalReason}`,
    `Broker:        ${plan.brokerSymbol ?? "flat"} (${plan.brokerQty} shares)`,
    `Target:        ${plan.targetSymbol ?? "—"}`
  ];

  if (plan.noTrade) {
    lines.push(
      `Trade:         SKIP — ${plan.noTradeReason ?? "no action"}`
    );

    return lines.join("\n");
  }

  lines.push("Planned orders:");

  for (const step of plan.steps) {
    lines.push(
      `  ${step.side.toUpperCase()} ${step.qty} ${step.symbol} — ${step.reason}`
    );
  }

  return lines.join("\n");
}
