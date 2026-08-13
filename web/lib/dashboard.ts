import { runDashboardApi } from "@/lib/runDashboardApi";
import type {
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
