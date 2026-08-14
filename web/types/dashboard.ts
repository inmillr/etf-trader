export interface DashboardSignalResponse {
  strategy: "aggressive";
  signalDate: string;
  selectionAsOfDate: string;
  action: string;
  targetSymbol: string | null;
  heldSymbol: string | null;
  rawPick: string | null;
  isRebalanceDay: boolean;
  absoluteMomentumPassed: boolean;
  usingFallback: boolean;
  fallbackSymbol: string | null;
  rotationBlocked: boolean;
  rankings: Array<{
    symbol: string;
    trailingReturn: number;
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
  strategy: "aggressive";
  start: string;
  end: string;
  lookbackDays: number;
  initialCash: number;
  finalEquity: number;
  returnPercent: number;
  maxDrawdown: number;
  trades: number;
  exposurePercent: number;
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

export interface AutomationJobRun {
  at: string;
  day: string;
  success: boolean;
  message: string;
  mode?: "dry-run" | "execute" | "offline";
}

export interface AutomationRunLogEntry {
  id: string;
  at: string;
  job: string;
  trigger: string;
  success: boolean;
  message: string;
}

export interface FillJournalEntry {
  id: string;
  at: string;
  day: string;
  trigger: string;
  mode: "dry-run" | "execute" | "offline";
  signalAction: string;
  side: "buy" | "sell";
  symbol: string;
  qty: number;
  backtestPrice: number | null;
  alpacaFillPrice: number | null;
  nextClose: number | null;
  nextCloseDate: string | null;
}

export interface AutomationStatusResponse {
  enabled: boolean;
  daemonRunning: boolean;
  daemon: {
    pid: number | null;
    startedAt: string | null;
    lastHeartbeat: string | null;
  };
  schedule: {
    backfillTimeEt: string;
    signalTimeEt: string;
    tradeTimeEt: string;
    timezone: string;
  };
  nextRuns: {
    backfill: string | null;
    signal: string | null;
    trade: string | null;
  };
  lastRuns: {
    backfill: AutomationJobRun | null;
    signal: AutomationJobRun | null;
    trade: AutomationJobRun | null;
  };
  runLog: AutomationRunLogEntry[];
  lastActionLog: {
    at: string;
    job: string;
    success: boolean;
    log: string[];
  } | null;
  fillJournal: FillJournalEntry[];
  env: {
    paperTradingEnabled: boolean;
    alpacaPaper: boolean;
    allowLiveTrading: boolean;
  };
  market: {
    isOpen: boolean | null;
    nextOpen: string | null;
    nextClose: string | null;
  } | null;
  signalFreshness: {
    latestDataDate: string | null;
    lastSignalDate: string | null;
    lastSignalRunAt: string | null;
    isStale: boolean;
    staleReason: string | null;
    needsBackfill: boolean;
    backfillHint: string | null;
    canManualExecute: boolean;
    manualExecuteHint: string | null;
  } | null;
}

export interface AutomationControlResponse
  extends AutomationStatusResponse {
  actionLog?: string[];
  success?: boolean;
  message?: string;
}
