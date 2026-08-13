export interface DashboardSignalResponse {
  signalDate: string;
  selectionAsOfDate: string;
  action: string;
  targetSymbol: string | null;
  heldSymbol: string | null;
  rawPick: string | null;
  isRebalanceDay: boolean;
  absoluteMomentumPassed: boolean;
  rotationBlocked: boolean;
  rankings: Array<{
    symbol: string;
    trailingReturn: number;
  }>;
  reason: string;
  heldSinceDay?: string | null;
}

export interface DashboardBacktestResponse {
  start: string;
  end: string;
  lookbackDays: number;
  initialCash: number;
  finalEquity: number;
  returnPercent: number;
  maxDrawdown: number;
  trades: number;
  exposurePercent: number;
  cashRebalances: number;
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
  summary: {
    returnPercent: number;
    maxDrawdown: number;
    trades: number;
  };
}
