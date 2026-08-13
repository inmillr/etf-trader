import type { AlpacaConfig } from "./AlpacaConfig.js";

export interface TradingConfig {
  /** Must be true to submit orders (dry-run ignores this). */
  paperTradingEnabled: boolean;
  /** Must be true when ALPACA_PAPER=false to allow live endpoints. */
  allowLiveTrading: boolean;
  /** Fraction of buying power kept in reserve when sizing buys (0.01 = 1%). */
  cashReservePercent: number;
  signalStatePath: string;
}

export function getTradingConfig(): TradingConfig {
  const cashReserveRaw =
    process.env.PAPER_CASH_RESERVE_PERCENT ??
    "0.01";

  const cashReservePercent =
    Number(cashReserveRaw);

  if (
    Number.isNaN(cashReservePercent) ||
    cashReservePercent < 0 ||
    cashReservePercent >= 1
  ) {
    throw new Error(
      "PAPER_CASH_RESERVE_PERCENT must be a number between 0 and 1."
    );
  }

  return {
    paperTradingEnabled:
      process.env.PAPER_TRADING_ENABLED === "true",
    allowLiveTrading:
      process.env.ALPACA_ALLOW_LIVE === "true",
    cashReservePercent,
    signalStatePath:
      process.env.SIGNAL_STATE_PATH ??
      "./data/signal-state.json"
  };
}

export function assertExecutionAllowed(
  alpacaConfig: AlpacaConfig,
  tradingConfig: TradingConfig
): void {
  if (
    !alpacaConfig.paper &&
    !tradingConfig.allowLiveTrading
  ) {
    throw new Error(
      "Live trading is blocked. Set ALPACA_PAPER=true (default) " +
        "or set ALPACA_ALLOW_LIVE=true to acknowledge live trading."
    );
  }

  if (!tradingConfig.paperTradingEnabled) {
    throw new Error(
      "Order execution is disabled. Set PAPER_TRADING_ENABLED=true in .env " +
        "after your Alpaca paper account is ready."
    );
  }
}
