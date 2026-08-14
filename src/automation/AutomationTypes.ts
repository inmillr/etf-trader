export type AutomationJob =
  | "backfill"
  | "signal"
  | "trade-dry"
  | "trade-execute";

export type AutomationTrigger =
  | "scheduled"
  | "manual"
  | "startup";

export const DEFAULT_AUTOMATION_SCHEDULE: AutomationSchedule = {
  backfillTimeEt: "15:50",
  signalTimeEt: "15:55",
  tradeTimeEt: "15:55",
  timezone: "America/New_York"
};

export interface AutomationSchedule {
  backfillTimeEt: string;
  signalTimeEt: string;
  tradeTimeEt: string;
  timezone: string;
}

export interface AutomationJobRun {
  at: string;
  day: string;
  success: boolean;
  message: string;
  mode?: "dry-run" | "execute" | "offline";
  signalDate?: string;
}

export interface AutomationRunLogEntry {
  id: string;
  at: string;
  job: AutomationJob;
  trigger: AutomationTrigger;
  success: boolean;
  message: string;
}

export interface AutomationDaemonState {
  pid: number | null;
  startedAt: string | null;
  lastHeartbeat: string | null;
}

export interface AutomationState {
  enabled: boolean;
  schedule: AutomationSchedule;
  daemon: AutomationDaemonState;
  lastRuns: {
    backfill: AutomationJobRun | null;
    signal: AutomationJobRun | null;
    trade: AutomationJobRun | null;
  };
  runLog: AutomationRunLogEntry[];
  lastActionLog: {
    at: string;
    job: AutomationJob;
    success: boolean;
    log: string[];
  } | null;
}

export interface FillJournalEntry {
  id: string;
  at: string;
  day: string;
  trigger: AutomationTrigger;
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

export interface AccountSnapshotResponse {
  snapshot: AccountSnapshot | null;
  error: string | null;
}

export interface AutomationStatusResponse {
  enabled: boolean;
  daemonRunning: boolean;
  daemon: AutomationDaemonState;
  schedule: AutomationSchedule;
  nextRuns: {
    backfill: string | null;
    signal: string | null;
    trade: string | null;
  };
  lastRuns: AutomationState["lastRuns"];
  runLog: AutomationRunLogEntry[];
  lastActionLog: AutomationState["lastActionLog"];
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
  account: AccountSnapshotResponse | null;
}
