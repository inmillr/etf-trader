export type AutomationJob =
  | "signal"
  | "trade-dry"
  | "trade-execute";

export type AutomationTrigger =
  | "scheduled"
  | "manual"
  | "startup";

export interface AutomationSchedule {
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
    signal: AutomationJobRun | null;
    trade: AutomationJobRun | null;
  };
  runLog: AutomationRunLogEntry[];
}

export interface AutomationStatusResponse {
  enabled: boolean;
  daemonRunning: boolean;
  daemon: AutomationDaemonState;
  schedule: AutomationSchedule;
  nextRuns: {
    signal: string | null;
    trade: string | null;
  };
  lastRuns: AutomationState["lastRuns"];
  runLog: AutomationRunLogEntry[];
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
}
