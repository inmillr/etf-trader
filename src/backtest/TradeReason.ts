export type TradeReason =
  | "BUY_REBALANCE"
  | "BUY_ROTATION"
  | "BUY_STRATEGY"
  | "SELL_ROTATION"
  | "SELL_CASH"
  | "SELL_STRATEGY"
  | "SELL_STOP"
  | "SELL_TARGET"
  | "SELL_SIGNAL"
  | "SELL_END_OF_DAY";

export interface TradeContext {
  reason: TradeReason;
  detail?: string;
}

export const TRADE_REASON_LABELS: Record<
  TradeReason,
  string
> = {
  BUY_REBALANCE:
    "Rebalance entry",
  BUY_ROTATION:
    "Rotation entry",
  BUY_STRATEGY:
    "Strategy entry",
  SELL_ROTATION:
    "Rotation exit",
  SELL_CASH:
    "Cash exit (absolute momentum)",
  SELL_STRATEGY:
    "Strategy exit",
  SELL_STOP:
    "Stop loss",
  SELL_TARGET:
    "Take profit",
  SELL_SIGNAL:
    "Signal exit",
  SELL_END_OF_DAY:
    "End of day exit"
};

export function formatTradeReason(
  reason: TradeReason
): string {
  return TRADE_REASON_LABELS[reason];
}
