export type TradeDirection = "long" | "short";

export interface TradingSignal {
  symbol: string;
  direction: TradeDirection;

  timestamp: Date;

  entryPrice: number;
  stopPrice: number;
  targetPrice: number;

  confidence: number;

  reasons: string[];
}