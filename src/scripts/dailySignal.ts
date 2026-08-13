import { readFileSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import "dotenv/config";

import { BacktestDataLoader } from "../backtest/BacktestDataLoader.js";
import { SQLiteCandleRepository } from "../data/SQLiteCandleRepository.js";
import { aggregateToDailyCandles } from "../market/DailyCandleAggregator.js";
import {
  evaluateDualMomentumSignal,
  findLatestTradingDay
} from "../signals/DualMomentumSignal.js";
import type { Candle } from "../types/market.js";
import {
  LIQUID_ETF_UNIVERSE,
  StaticUniverseProvider
} from "../universe/EtfUniverse.js";

const databasePath =
  process.env.DATABASE_PATH ??
  "./data/market.db";

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
const lookbackDays = Number(
  readFlag("--lookback") ?? 126
);
const statePath =
  readFlag("--state-file") ??
  defaultStatePath;

const saveState =
  args.includes("--save") ||
  !args.includes("--no-save");

const tunedFilter = {
  minAvgDailyVolume: 500_000,
  minAvgDailyDollarVolume: 10_000_000,
  minPrice: 10,
  minHistoryDays: 30,
  maxAtrPercent: 5.0
};

const rotationPolicy = {
  minHoldDays: 5,
  minScoreImprovement: 5
};

interface SignalState {
  symbol: string;
  since: string;
}

function loadState(
  path: string
): SignalState | null {
  try {
    const raw = readFileSync(
      path,
      "utf8"
    );

    const parsed = JSON.parse(
      raw
    ) as SignalState;

    if (
      !parsed.symbol ||
      !parsed.since
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
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

const repository =
  new SQLiteCandleRepository(
    databasePath
  );

try {
  const loader = new BacktestDataLoader(
    repository
  );

  const provider =
    new StaticUniverseProvider(
      LIQUID_ETF_UNIVERSE
    );

  const candidates =
    await provider.getCandidates();

  const warmupDays = lookbackDays + 252;
  const end = signalDateArg
    ? new Date(`${signalDateArg}T23:59:59.999Z`)
    : new Date();

  const dataStart = new Date(end);
  dataStart.setUTCDate(
    dataStart.getUTCDate() - warmupDays
  );

  const candlesBySymbol =
    new Map<string, Candle[]>();

  for (const candidate of candidates) {
    let candles = await loader.load({
      symbol: candidate.symbol,
      timeframe: "1d",
      start: dataStart,
      end
    });

    if (candles.length === 0) {
      const intraday = await loader.load({
        symbol: candidate.symbol,
        timeframe: "5m",
        start: dataStart,
        end
      });

      candles = aggregateToDailyCandles(
        intraday
      );
    }

    candlesBySymbol.set(
      candidate.symbol,
      candles
    );
  }

  candlesBySymbol.set(
    "SPY",
    await loader.load({
      symbol: "SPY",
      timeframe: "1d",
      start: dataStart,
      end
    })
  );

  const latestDay =
    signalDateArg ??
    findLatestTradingDay(
      candlesBySymbol
    );

  if (!latestDay) {
    console.error(
      "No daily candles in SQLite. Run backfill first:\n" +
      "  npm run backfill:once"
    );

    process.exit(1);
  }

  const savedState = loadState(statePath);

  const heldSymbol =
    heldArg ??
    savedState?.symbol ??
    null;

  const heldSinceDay =
    sinceArg ??
    savedState?.since ??
    null;

  const availableCandidates =
    candidates.filter((candidate) =>
      (candlesBySymbol.get(
        candidate.symbol
      )?.length ?? 0) > 0
    );

  const signal = evaluateDualMomentumSignal(
    latestDay,
    availableCandidates,
    candlesBySymbol,
    {
      lookbackDays,
      rotation: rotationPolicy,
      selector: {
        lookbackDays,
        filter: tunedFilter
      },
      heldSymbol,
      heldSinceDay
    }
  );

  if (saveState) {
    if (
      signal.action === "buy" ||
      signal.action === "rotate"
    ) {
      saveStateFile(statePath, {
        symbol: signal.targetSymbol!,
        since: signal.signalDate
      });
    } else if (
      signal.action === "exit" ||
      signal.action === "stay_cash"
    ) {
      saveStateFile(statePath, null);
    }
  }

  console.log(
    "=== Daily Signal (Dual Momentum) ==="
  );
  console.log(
    `Data through:        ${signal.signalDate}`
  );
  console.log(
    `Selection as of:       ${signal.selectionAsOfDate}`
  );
  console.log(
    `Universe:              SPY, QQQ, IWM, DIA`
  );
  console.log(
    `Lookback:              ${lookbackDays} trading days`
  );
  console.log(
    `Rebalance day:         ${signal.isRebalanceDay ? "yes (Monday)" : "no"}`
  );
  console.log("");

  console.log(
    `Action:                ${formatAction(signal.action)}`
  );

  if (signal.targetSymbol) {
    console.log(
      `Target:                ${signal.targetSymbol}`
    );
  } else {
    console.log(
      "Target:                (cash)"
    );
  }

  if (heldSymbol) {
    console.log(
      `Current hold:          ${heldSymbol}${heldSinceDay ? ` since ${heldSinceDay}` : ""}`
    );
  }

  if (signal.rawPick) {
    console.log(
      `Model pick:            ${signal.rawPick}`
    );
  }

  console.log(
    `Absolute momentum:     ${signal.absoluteMomentumPassed ? "pass" : "fail"}`
  );
  console.log("");
  console.log(
    `Reason:                ${signal.reason}`
  );
  console.log("");

  console.log(
    "=== Rankings (trailing return %) ==="
  );

  for (const entry of signal.rankings) {
    console.log(
      `  ${entry.symbol.padEnd(4)}  ${entry.trailingReturn.toFixed(2)}%`
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
} finally {
  repository.close();
}
