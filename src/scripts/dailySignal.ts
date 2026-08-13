import { writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import "dotenv/config";

import {
  StrategyDashboardService
} from "../services/StrategyDashboardService.js";

const defaultStatePath =
  process.env.SIGNAL_STATE_PATH ??
  "./data/signal-state.json";

const args = process.argv.slice(2);

function readFlag(name: string): string | undefined {
  const index = args.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

const signalDateArg = readFlag("--date");
const heldArg = readFlag("--held");
const sinceArg = readFlag("--since");
const statePath =
  readFlag("--state-file") ??
  defaultStatePath;

const saveState =
  args.includes("--save") ||
  !args.includes("--no-save");

interface SignalState {
  symbol: string;
  since: string;
}

function saveStateFile(
  path: string,
  state: SignalState | null
): void {
  mkdirSync(
    dirname(path),
    { recursive: true }
  );

  if (!state) {
    writeFileSync(
      path,
      "{}\n"
    );

    return;
  }

  writeFileSync(
    path,
    `${JSON.stringify(state, null, 2)}\n`
  );
}

function formatAction(
  action: string
): string {
  return action
    .replace("_", " ")
    .toUpperCase();
}

const service =
  new StrategyDashboardService();

const savedState =
  service.loadSignalState();

const signal = await service.getSignal({
  ...(signalDateArg ? { date: signalDateArg } : {}),
  ...(heldArg !== undefined
    ? { heldSymbol: heldArg }
    : {}),
  ...(sinceArg !== undefined
    ? { heldSinceDay: sinceArg }
    : {})
});

if (saveState) {
  if (
    signal.action === "buy" ||
    signal.action === "rotate"
  ) {
    saveStateFile(statePath, {
      symbol: signal.targetSymbol!,
      since: signal.signalDate
    });
  } else if (signal.action === "exit") {
    saveStateFile(statePath, null);
  }
}

console.log(
  "=== Daily Signal (Hybrid) ==="
);
console.log(
  `Data through:          ${signal.signalDate}`
);
console.log(
  `Selection as of:       ${signal.selectionAsOfDate}`
);
console.log(
  "Universe:              SPY, QQQ, IWM, DIA (liquid + 5m)"
);
console.log(
  `Rebalance day:         ${signal.isRebalanceDay ? "yes (Monday)" : "no"}`
);
console.log("");

console.log(
  `Action:                ${formatAction(signal.action)}`
);
console.log(
  `Target:                ${signal.targetSymbol ?? signal.heldSymbol ?? "(flat)"}`
);

if (savedState?.symbol || signal.heldSymbol) {
  console.log(
    `Current hold:          ${signal.heldSymbol ?? savedState?.symbol}${signal.heldSinceDay ? ` since ${signal.heldSinceDay}` : ""}`
  );
}

if (signal.rawPick) {
  console.log(
    `Universe pick:         ${signal.rawPick}`
  );
}

console.log(
  `Daily trend:           ${signal.trendBullish ? "bullish" : "not bullish"}`
);
console.log(
  `5m setup:              ${signal.intradaySetup ? "ready" : signal.inEntryWindow ? "watching" : "outside window"}`
);
console.log("");
console.log(
  `Reason:                ${signal.reason}`
);
console.log("");

console.log(
  "=== Rankings (30d score) ==="
);

for (const entry of signal.rankings.slice(0, 10)) {
  console.log(
    `  ${entry.symbol.padEnd(5)}  ${entry.score.toFixed(2)}`
  );
}

console.log("");
console.log(
  "Local SQLite only — no API calls."
);

if (saveState) {
  console.log(
    `State file:            ${statePath}`
  );
} else {
  console.log(
    "State file:            not updated (--no-save)"
  );
}
