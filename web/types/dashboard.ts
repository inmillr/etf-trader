export interface DashboardSignalResponse {
  strategy: "hybrid";
  signalDate: string;
  selectionAsOfDate: string;
  action: string;
  targetSymbol: string | null;
  heldSymbol: string | null;
  rawPick: string | null;
  isRebalanceDay: boolean;
  trendBullish: boolean;
  bearishCrossover: boolean;
  intradaySetup: boolean;
  inEntryWindow: boolean;
  trendFast: number | null;
  trendSlow: number | null;
  rankings: Array<{
    symbol: string;
    score: number;
  }>;
  reason: string;
  heldSinceDay?: string | null;
}

export interface DashboardTrade {
  id: string;
  date: string;
  side: "buy" | "sell";
  symbol: string;
  quantity: number;
  price: number;
  commission: number;
  reason: string;
  reasonLabel: string;
  detail?: string;
}

export interface DashboardBacktestResponse {
  strategy: "hybrid";
  start: string;
  end: string;
  lookbackDays: number;
  initialCash: number;
  finalEquity: number;
  returnPercent: number;
  maxDrawdown: number;
  trades: number;
  exposurePercent: number;
  stopExits: number;
  targetExits: number;
  trendExits: number;
  rotationExits: number;
  spyReturn: number;
  metrics: Record<string, number>;
  equityCurve: Array<{
    date: string;
    equity: number;
  }>;
  selections: Array<{
    date: string;
    symbols: string[];
  }>;
  tradeLog: DashboardTrade[];
}

export interface JournalEntry {
  date: string;
  equity: number;
  dayReturnPercent: number;
  position: string;
  rebalance: boolean;
}

export interface DashboardJournalResponse {
  start: string;
  end: string;
  entries: JournalEntry[];
  trades: DashboardTrade[];
  summary: {
    returnPercent: number;
    maxDrawdown: number;
    trades: number;
  };
}
