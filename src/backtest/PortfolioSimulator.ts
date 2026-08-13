import type { Candle } from "../types/market.js";

export type OrderSide =
  "buy" |
  "sell";

export interface PortfolioSimulatorOptions {
  initialCash: number;
  commissionPerTrade?: number;
  slippagePercent?: number;
}

export interface Trade {
  side: OrderSide;
  symbol: string;
  quantity: number;
  price: number;
  timestamp: Date;
  commission: number;
}

export interface Position {
  symbol: string;
  quantity: number;
  averagePrice: number;
}

export interface PortfolioSnapshot {
  timestamp: Date;
  cash: number;
  equity: number;
  marketValue: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

export class PortfolioSimulator {
  private cash: number;

  private readonly initialCash: number;
  private readonly commissionPerTrade: number;
  private readonly slippagePercent: number;

  private readonly positions =
    new Map<string, Position>();

  private readonly trades: Trade[] = [];

  private realizedPnl = 0;

  private winningTrades = 0;
private losingTrades = 0;

private totalWinningPnl = 0;
private totalLosingPnl = 0;

  private latestPrices =
    new Map<string, number>();

  private peakEquity: number;

  private maxDrawdown = 0;

  constructor(
    options: PortfolioSimulatorOptions
  ) {
    if (options.initialCash <= 0) {
      throw new Error(
        "Initial cash must be greater than zero."
      );
    }

    if (
      options.commissionPerTrade !== undefined &&
      options.commissionPerTrade < 0
    ) {
      throw new Error(
        "Commission cannot be negative."
      );
    }

    if (
      options.slippagePercent !== undefined &&
      options.slippagePercent < 0
    ) {
      throw new Error(
        "Slippage cannot be negative."
      );
    }

    this.initialCash =
      options.initialCash;

    this.cash =
      options.initialCash;

    this.peakEquity =
      options.initialCash;

    this.commissionPerTrade =
      options.commissionPerTrade ?? 0;

    this.slippagePercent =
      options.slippagePercent ?? 0;
  }

  buy(
    symbol: string,
    quantity: number,
    candle: Candle,
    executionPrice: number =
      candle.close
  ): void {
    this.validateOrder(
      symbol,
      quantity,
      candle
    );

    this.validateExecutionPrice(
      executionPrice
    );

    const adjustedPrice =
      executionPrice *
      (1 + this.slippagePercent / 100);

    const grossCost =
  executionPrice * quantity;

const commission =
  this.commissionPerTrade;

const totalCost =
  grossCost + commission;

if (totalCost > this.cash) {
  throw new Error(
    "Insufficient cash."
  );
}

    const existing =
      this.positions.get(symbol);

    if (existing) {
      const totalQuantity =
        existing.quantity + quantity;

      const totalCostBasis =
        existing.quantity *
          existing.averagePrice +
        quantity *
          adjustedPrice;

      existing.quantity =
        totalQuantity;

      existing.averagePrice =
        totalCostBasis /
        totalQuantity;
    } else {
      this.positions.set(symbol, {
        symbol,
        quantity,
        averagePrice:
          adjustedPrice
      });
    }

    this.cash -= totalCost;

    this.latestPrices.set(
      symbol,
      candle.close
    );

    this.trades.push({
      side: "buy",
      symbol,
      quantity,
      price: adjustedPrice,
      timestamp: candle.timestamp,
      commission
    });
  }

  sell(
    symbol: string,
    quantity: number,
    candle: Candle,
    executionPrice: number =
      candle.close
  ): void {
    this.validateOrder(
      symbol,
      quantity,
      candle
    );

    this.validateExecutionPrice(
      executionPrice
    );

    const position =
      this.positions.get(symbol);

    if (
      !position ||
      position.quantity < quantity
    ) {
      throw new Error(
        "Insufficient position."
      );
    }

    const adjustedPrice =
      executionPrice *
      (1 - this.slippagePercent / 100);

    const commission =
      this.commissionPerTrade;

    const grossProceeds =
      adjustedPrice * quantity;

    const netProceeds =
      grossProceeds - commission;

    const costBasis =
  position.averagePrice *
  quantity;

const tradePnl =
  netProceeds -
  costBasis;

this.realizedPnl +=
  tradePnl;

if (tradePnl > 0) {
  this.winningTrades++;

  this.totalWinningPnl +=
    tradePnl;
} else if (tradePnl < 0) {
  this.losingTrades++;

  this.totalLosingPnl +=
    tradePnl;
}

    this.cash += netProceeds;

    position.quantity -= quantity;

    if (position.quantity === 0) {
      this.positions.delete(symbol);
    }

    this.latestPrices.set(
      symbol,
      candle.close
    );

    this.trades.push({
      side: "sell",
      symbol,
      quantity,
      price: adjustedPrice,
      timestamp: candle.timestamp,
      commission
    });
  }

  getEstimatedBuyQuantity(
    price: number
  ): number {
    if (
      !Number.isFinite(price) ||
      price <= 0
    ) {
      return 0;
    }

    /*
     * Reserve enough cash for both:
     *
     *   1. estimated slippage
     *   2. commission
     *
     * This prevents a strategy from requesting
     * one more share than the portfolio can
     * actually afford.
     */
    const estimatedPrice =
      price *
      (1 + this.slippagePercent / 100);

    const availableForShares =
      this.cash -
      this.commissionPerTrade;

    if (
      availableForShares <= 0
    ) {
      return 0;
    }

    return Math.max(
      0,
      Math.floor(
        availableForShares /
        estimatedPrice
      )
    );
  }

  updateMarket(
    candle: Candle
  ): void {
    this.latestPrices.set(
      candle.symbol,
      candle.close
    );

    const equity =
      this.getEquity();

    if (
      equity >
      this.peakEquity
    ) {
      this.peakEquity =
        equity;
    }

    const drawdown =
      this.peakEquity > 0
        ? (
            (
              this.peakEquity -
              equity
            ) /
            this.peakEquity
          ) * 100
        : 0;

    if (
      drawdown >
      this.maxDrawdown
    ) {
      this.maxDrawdown =
        drawdown;
    }
  }

  getCash(): number {
    return this.cash;
  }

  getPosition(
    symbol: string
  ): Position | undefined {
    const position =
      this.positions.get(symbol);

    if (!position) {
      return undefined;
    }

    return {
      ...position
    };
  }

  getPositions(): Position[] {
    return Array.from(
      this.positions.values()
    ).map(
      (position) => ({
        ...position
      })
    );
  }

  getTrades(): Trade[] {
    return [
      ...this.trades
    ];
  }

  getMarketValue(): number {
    let value = 0;

    for (
      const position of
      this.positions.values()
    ) {
      const price =
        this.latestPrices.get(
          position.symbol
        );

      if (
        price !== undefined
      ) {
        value +=
          position.quantity *
          price;
      }
    }

    return value;
  }

  getEquity(): number {
    return (
      this.cash +
      this.getMarketValue()
    );
  }

  getRealizedPnl(): number {
    return this.realizedPnl;
  }

  getUnrealizedPnl(): number {
    let pnl = 0;

    for (
      const position of
      this.positions.values()
    ) {
      const price =
        this.latestPrices.get(
          position.symbol
        );

      if (
        price !== undefined
      ) {
        pnl +=
          (
            price -
            position.averagePrice
          ) *
          position.quantity;
      }
    }

    return pnl;
  }

  getSnapshot(
    timestamp: Date
  ): PortfolioSnapshot {
    const marketValue =
      this.getMarketValue();

    return {
      timestamp,
      cash: this.cash,
      equity:
        this.cash +
        marketValue,
      marketValue,
      realizedPnl:
        this.realizedPnl,
      unrealizedPnl:
        this.getUnrealizedPnl()
    };
  }

  private validateOrder(
    symbol: string,
    quantity: number,
    candle: Candle
  ): void {
    if (!symbol.trim()) {
      throw new Error(
        "Symbol cannot be empty."
      );
    }

    if (
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      throw new Error(
        "Quantity must be greater than zero."
      );
    }

    if (
      candle.symbol !== symbol
    ) {
      throw new Error(
        "Candle symbol does not match order symbol."
      );
    }

    if (
      !Number.isFinite(
        candle.close
      ) ||
      candle.close <= 0
    ) {
      throw new Error(
        "Candle close price must be greater than zero."
      );
    }
  }

  private validateExecutionPrice(
    price: number
  ): void {
    if (
      !Number.isFinite(price) ||
      price <= 0
    ) {
      throw new Error(
        "Execution price must be greater than zero."
      );
    }
  }

  getInitialCash(): number {
    return this.initialCash;
  }

  getMaxDrawdown(): number {
    return this.maxDrawdown;
  }

  getWinningTrades(): number {
  return this.winningTrades;
}

getLosingTrades(): number {
  return this.losingTrades;
}

getWinRate(): number {
  const completedTrades =
    this.winningTrades +
    this.losingTrades;

  if (completedTrades === 0) {
    return 0;
  }

  return (
    this.winningTrades /
    completedTrades
  ) * 100;
}

getAverageWinningTrade(): number {
  if (this.winningTrades === 0) {
    return 0;
  }

  return (
    this.totalWinningPnl /
    this.winningTrades
  );
}

getAverageLosingTrade(): number {
  if (this.losingTrades === 0) {
    return 0;
  }

  return (
    this.totalLosingPnl /
    this.losingTrades
  );
}

getProfitFactor(): number {
  if (
    this.totalLosingPnl === 0
  ) {
    return this.totalWinningPnl > 0
      ? Infinity
      : 0;
  }

  return (
    this.totalWinningPnl /
    Math.abs(
      this.totalLosingPnl
    )
  );
}
}

