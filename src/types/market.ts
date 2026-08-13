export type Timeframe =
  | "1m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "1d";

export interface Candle {
  symbol: string;
  timeframe: Timeframe;

  timestamp: Date;

  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}