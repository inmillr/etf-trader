import type { AutomationJobRun } from "./AutomationTypes.js";
import { formatEtDay } from "./AutomationStore.js";

export interface SignalFreshnessInfo {
  latestDataDate: string | null;
  lastSignalDate: string | null;
  lastSignalRunAt: string | null;
  needsBackfill: boolean;
  backfillHint: string | null;
  isStale: boolean;
  staleReason: string | null;
  canManualExecute: boolean;
  manualExecuteHint: string | null;
}

function compareDays(
  left: string,
  right: string
): number {
  return left.localeCompare(right);
}

function isWeekdayEt(date = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: "America/New_York",
      weekday: "short"
    }
  ).format(date);

  return weekday !== "Sat" && weekday !== "Sun";
}

export function assessSignalFreshness(input: {
  latestDataDate: string | null;
  lastSignalRun: AutomationJobRun | null;
  lastBackfillRun: AutomationJobRun | null;
  lastTradeRun: AutomationJobRun | null;
  marketOpen: boolean | null;
  tradeTimeEt: string;
  now?: Date;
}): SignalFreshnessInfo {
  const now = input.now ?? new Date();
  const todayEt = formatEtDay(now);
  const lastSignalDate =
    input.lastSignalRun?.signalDate ?? null;
  const lastSignalRunAt =
    input.lastSignalRun?.at ?? null;

  const base = {
    latestDataDate: input.latestDataDate,
    lastSignalDate,
    lastSignalRunAt,
    isStale: false,
    staleReason: null as string | null,
    needsBackfill: false,
    backfillHint: null as string | null,
    canManualExecute: false,
    manualExecuteHint: null as string | null
  };

  if (!input.latestDataDate) {
    return {
      ...base,
      isStale: true,
      needsBackfill: true,
      backfillHint:
        "Download daily bars to populate SQLite.",
      staleReason:
        "No daily bars found in SQLite. Update Market Data, then Run Signal Now."
    };
  }

  const backfillSucceededToday =
    input.lastBackfillRun?.success === true &&
    input.lastBackfillRun.day === todayEt;

  if (backfillSucceededToday) {
    // Data is as current as today's backfill could make it.
    // Fall through to normal stale / execute checks below.
  } else if (
    isWeekdayEt(now) &&
    input.marketOpen === false &&
    compareDays(
      input.latestDataDate,
      todayEt
    ) < 0
  ) {
    return {
      ...base,
      isStale: true,
      needsBackfill: true,
      backfillHint:
        "Download the latest daily bars before running signal.",
      staleReason:
        `Market has closed for ${todayEt}, but SQLite still ends at ${input.latestDataDate}. Update Market Data, then Run Signal Now.`
    };
  } else if (
    compareDays(
      input.latestDataDate,
      todayEt
    ) < 0 &&
    isWeekdayEt(now)
  ) {
    return {
      ...base,
      isStale: true,
      needsBackfill: true,
      backfillHint:
        "SQLite is behind today's session — update market data first.",
      staleReason:
        `SQLite ends at ${input.latestDataDate}. Update Market Data if you expect a bar for ${todayEt}.`
    };
  }

  if (!lastSignalDate) {
    return {
      ...base,
      isStale: true,
      staleReason: input.lastSignalRun
        ? "Last signal run needs a refresh. Run Signal Now to incorporate the latest close."
        : "Signal has not been computed yet. Run Signal Now after the latest close."
    };
  }

  if (
    compareDays(
      lastSignalDate,
      input.latestDataDate
    ) < 0
  ) {
    return {
      ...base,
      isStale: true,
      staleReason:
        `Signal is through ${lastSignalDate}, but SQLite has data through ${input.latestDataDate}. Run Signal Now before trading.`
    };
  }

  const tradedToday =
    input.lastTradeRun?.day === todayEt;

  if (tradedToday) {
    return {
      ...base,
      isStale: false,
      canManualExecute: true,
      manualExecuteHint:
        `Signal is current through ${lastSignalDate}. Scheduled trade already ran today — use Execute Trade only to re-sync early.`
    };
  }

  if (input.marketOpen) {
    return {
      ...base,
      isStale: false,
      canManualExecute: true,
      manualExecuteHint:
        `Signal is current through ${lastSignalDate}. Execute Trade acts now instead of waiting for the ${input.tradeTimeEt} ET scheduled run.`
    };
  }

  return {
    ...base,
    isStale: false,
    canManualExecute: false,
    manualExecuteHint:
      `Signal is current through ${lastSignalDate}. Wait for the ${input.tradeTimeEt} ET trade run while the market is closed.`
  };
}
