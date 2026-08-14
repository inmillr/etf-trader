import type {
  AlpacaAccount,
  AlpacaPosition
} from "./AlpacaTradingTypes.js";
import {
  resolveBrokerHoldings
} from "./PaperTradingService.js";
import {
  loadSignalState,
  type SignalState
} from "./SignalStateStore.js";

export interface AccountPositionSnapshot {
  symbol: string;
  qty: number;
  marketValue: number;
  avgEntryPrice: number;
  currentPrice: number;
}

export interface AccountSnapshot {
  asOf: string;
  mode: "paper" | "live";
  status: string;
  currency: string;
  cash: number;
  invested: number;
  total: number;
  buyingPower: number;
  portfolioValue: number;
  positions: AccountPositionSnapshot[];
  strategySymbol: string | null;
  strategySince: string | null;
  brokerSymbol: string | null;
  brokerQty: number;
  alignedWithStrategy: boolean;
}

export interface AccountSnapshotResult {
  snapshot: AccountSnapshot | null;
  error: string | null;
}

function mapPositions(
  positions: AlpacaPosition[]
): AccountPositionSnapshot[] {
  return positions
    .filter(
      (position) =>
        position.side === "long" &&
        Number(position.qty) > 0
    )
    .map((position) => ({
      symbol: position.symbol,
      qty: Math.floor(Number(position.qty)),
      marketValue: Number(position.market_value),
      avgEntryPrice: Number(
        position.avg_entry_price
      ),
      currentPrice: Number(
        position.current_price
      )
    }));
}

function readStrategyState(
  signalStatePath: string
): SignalState | null {
  return loadSignalState(signalStatePath);
}

export function buildAccountSnapshot(
  account: AlpacaAccount,
  positions: AlpacaPosition[],
  mode: "paper" | "live",
  signalStatePath: string
): AccountSnapshot {
  const cash = Number(account.cash);
  const total = Number(account.equity);
  const buyingPower = Number(
    account.buying_power
  );
  const portfolioValue = Number(
    account.portfolio_value
  );
  const positionSnapshots =
    mapPositions(positions);
  const invested = positionSnapshots.reduce(
    (sum, position) =>
      sum + position.marketValue,
    0
  );
  const broker =
    resolveBrokerHoldings(positions);
  const strategy =
    readStrategyState(signalStatePath);
  const strategySymbol =
    strategy?.symbol ?? null;
  const strategySince =
    strategy?.since ?? null;
  const alignedWithStrategy =
    strategySymbol === broker.symbol;

  return {
    asOf: new Date().toISOString(),
    mode,
    status: account.status,
    currency: account.currency,
    cash,
    invested,
    total,
    buyingPower,
    portfolioValue,
    positions: positionSnapshots,
    strategySymbol,
    strategySince,
    brokerSymbol: broker.symbol,
    brokerQty: broker.qty,
    alignedWithStrategy
  };
}
