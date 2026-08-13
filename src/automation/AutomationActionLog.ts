import type {
  PaperTradeRunResult,
  SignalRunResult
} from "../broker/PaperTradingRunner.js";
import type { BackfillRunResult } from "../data/MarketDataBackfillRunner.js";
import type { SignalState } from "../broker/SignalStateStore.js";

export function buildSignalActionLog(
  priorState: SignalState | null,
  result: SignalRunResult
): string[] {
  const log = [
    "▶ Run Signal Now",
    priorState
      ? `Previous hold: ${priorState.symbol} since ${priorState.since}`
      : "Previous hold: flat (cash)"
  ];

  if (!result.success) {
    log.push(`✗ Failed: ${result.message}`);
    return log;
  }

  const signal = result.signal;

  if (!signal) {
    log.push(`✓ ${result.message}`);
    return log;
  }

  log.push(
    `Loaded SQLite daily bars through ${signal.signalDate}`
  );
  log.push(
    "Evaluated aggressive dual momentum (30 ETFs · 10-day lookback · daily rebalance)"
  );
  log.push(`Action: ${signal.action.toUpperCase()}`);

  if (signal.targetSymbol) {
    log.push(`Target: ${signal.targetSymbol}`);
  }

  if (signal.heldSymbol) {
    log.push(`Tracked hold: ${signal.heldSymbol}`);
  }

  log.push(`Reason: ${signal.reason}`);

  if (
    signal.action === "buy" ||
    signal.action === "rotate"
  ) {
    log.push(
      `Updated data/signal-state.json → ${signal.targetSymbol} since ${signal.signalDate}`
    );
  } else if (
    signal.action === "exit" ||
    signal.action === "stay_cash"
  ) {
    log.push(
      "Cleared data/signal-state.json (flat)"
    );
  } else {
    log.push(
      "Left data/signal-state.json unchanged"
    );
  }

  log.push(
    "No Alpaca orders submitted (signal computation only)"
  );
  log.push("✓ Done");

  return log;
}

export function buildTradeActionLog(
  result: PaperTradeRunResult,
  label: string
): string[] {
  const log = [`▶ ${label}`];

  if (!result.success) {
    log.push(`✗ Failed: ${result.message}`);
    return log;
  }

  if (result.signal) {
    log.push(
      `Signal (${result.signal.signalDate}): ${result.signal.action.toUpperCase()}`
    );
    log.push(`Reason: ${result.signal.reason}`);
  }

  if (result.mode === "offline") {
    log.push(
      "Using offline preview (local signal state + INITIAL_CASH)"
    );
  } else if (result.mode === "dry-run") {
    log.push(
      "Connected to Alpaca paper account (read-only for planning)"
    );
  } else {
    log.push(
      "Connected to Alpaca paper account (submitting orders)"
    );
  }

  if (result.planText) {
    log.push("");
    log.push(...result.planText.split("\n"));
  }

  if (
    result.referencePrice != null &&
    result.signal?.targetSymbol
  ) {
    log.push("");
    log.push(
      `Reference price (${result.signal.targetSymbol}): $${result.referencePrice.toFixed(2)}`
    );
  }

  if (result.plan?.noTrade) {
    log.push("");
    log.push(
      `No orders needed — ${result.plan.noTradeReason ?? result.message}`
    );
  } else if (
    result.mode === "dry-run" &&
    result.plan?.steps.length
  ) {
    log.push("");
    log.push(
      `Dry run only — ${result.plan.steps.length} order(s) planned, none submitted`
    );
  } else if (result.orders?.length) {
    log.push("");
    log.push("Submitted orders:");

    for (const order of result.orders) {
      log.push(
        `  ${order.side.toUpperCase()} ${order.qty} ${order.symbol} · status ${order.status} · id ${order.id}`
      );
    }

    log.push(
      "Updated data/signal-state.json from trade result"
    );
  }

  log.push("");
  log.push(`✓ ${result.message}`);

  return log;
}

export function buildBackfillActionLog(
  result: BackfillRunResult
): string[] {
  const log = [
    "▶ Update Market Data",
    "Uses Alpaca market data API only — no orders.",
    `Range: ${result.startDate} → ${result.endDate} (${result.timeframe})`,
    `SQLite before: ${result.latestDataDateBefore ?? "empty"}`
  ];

  if (!result.success) {
    log.push(`✗ Failed: ${result.message}`);
    return log;
  }

  log.push(
    `Downloaded ${result.newCandles} new bar(s) across ${result.symbolsUpdated}/${result.symbolCount} ETFs`
  );
  log.push(
    `SQLite after: ${result.latestDataDateAfter ?? "empty"}`
  );
  log.push(
    "Next step: Run Signal Now to refresh the momentum pick."
  );
  log.push(`✓ ${result.message}`);

  return log;
}

export function buildControlActionLog(
  action: string,
  message: string
): string[] {
  const labels: Record<string, string> = {
    enable: "Turn On automation",
    disable: "Turn Off automation",
    "start-daemon": "Start Scheduler",
    "stop-daemon": "Stop Scheduler"
  };

  return [
    `▶ ${labels[action] ?? action}`,
    message,
    "✓ Done"
  ];
}
