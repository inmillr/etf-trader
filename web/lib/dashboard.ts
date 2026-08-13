import { runDashboardApi } from "@/lib/runDashboardApi";
import type {
  AutomationControlResponse,
  AutomationStatusResponse,
  DashboardBacktestResponse,
  DashboardJournalResponse,
  DashboardSignalResponse
} from "@/types/dashboard";

export async function getDashboardSignal(): Promise<DashboardSignalResponse> {
  return runDashboardApi<DashboardSignalResponse>(
    "signal"
  );
}

export async function getDashboardBacktest(
  start: string,
  end: string,
  lookback = 126
): Promise<DashboardBacktestResponse> {
  return runDashboardApi<DashboardBacktestResponse>(
    "backtest",
    { start, end, lookback }
  );
}

export async function getDashboardJournal(
  start: string,
  end: string,
  lookback = 126
): Promise<DashboardJournalResponse> {
  return runDashboardApi<DashboardJournalResponse>(
    "journal",
    { start, end, lookback }
  );
}

export async function getAutomationStatus(): Promise<AutomationStatusResponse> {
  return runDashboardApi<AutomationStatusResponse>(
    "automation-status"
  );
}

export async function controlAutomation(
  action: string
): Promise<AutomationControlResponse> {
  return runDashboardApi<AutomationControlResponse>(
    "automation-control",
    { action }
  );
}
