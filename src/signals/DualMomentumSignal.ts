import type { Candle } from "../types/market.js";
import type { EtfCandidate } from "../universe/EtfRank.js";
import {
  selectDualMomentumAtDate,
  type DualMomentumSelectorOptions
} from "../universe/DualMomentumSelector.js";
import {
  isRebalanceDate,
  type RebalanceFrequency
} from "../universe/PointInTimeSelector.js";
import {
  countDaysHeld,
  resolveActiveSymbols,
  type RotationPolicyOptions
} from "../universe/RotationPolicy.js";

export type SignalAction =
  | "buy"
  | "hold"
  | "rotate"
  | "exit"
  | "stay_cash";

export interface DualMomentumSignalOptions {
  lookbackDays?: number;
  rebalanceFrequency?: RebalanceFrequency;
  rotation?: RotationPolicyOptions;
  selector?: DualMomentumSelectorOptions;
  heldSymbol?: string | null;
  heldSinceDay?: string | null;
}

export interface DualMomentumSignalResult {
  signalDate: string;
  selectionAsOfDate: string;
  action: SignalAction;
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
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDay(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

export function findLatestTradingDay(
  candlesBySymbol: Map<string, Candle[]>,
  benchmarkSymbol = "SPY"
): string | null {
  const benchmark =
    candlesBySymbol.get(benchmarkSymbol) ??
    Array.from(candlesBySymbol.values())[0];

  if (!benchmark?.length) {
    return null;
  }

  const latest = benchmark.reduce(
    (newest, candle) =>
      candle.timestamp.getTime() >
      newest.timestamp.getTime()
        ? candle
        : newest
  );

  return dayKey(latest.timestamp);
}

export function evaluateDualMomentumSignal(
  signalDay: string,
  candidates: EtfCandidate[],
  candlesBySymbol: Map<string, Candle[]>,
  options: DualMomentumSignalOptions = {}
): DualMomentumSignalResult {
  const rebalanceFrequency =
    options.rebalanceFrequency ??
    "weekly";

  const rotation =
    options.rotation ?? {};

  const selector =
    options.selector ?? {};

  const lookbackDays =
    options.lookbackDays ??
    selector.lookbackDays ??
    126;

  const heldSymbol =
    options.heldSymbol ?? null;

  const heldSinceDay =
    options.heldSinceDay ?? null;

  const signalDate = parseDay(signalDay);

  const isRebalanceDay =
    isRebalanceDate(
      signalDate,
      rebalanceFrequency
    );

  const priorDate = new Date(signalDate);
  priorDate.setUTCDate(
    priorDate.getUTCDate() - 1
  );

  const selection = selectDualMomentumAtDate(
    priorDate,
    candidates,
    candlesBySymbol,
    {
      ...selector,
      lookbackDays
    }
  );

  const rankings = selection.scores.map(
    (entry) => ({
      symbol: entry.symbol,
      trailingReturn: entry.score
    })
  );

  const rawPick =
    selection.selectedSymbols[0] ?? null;

  const absoluteMomentumPassed =
    rawPick !== null;

  if (!absoluteMomentumPassed) {
    if (heldSymbol) {
      return {
        signalDate: signalDay,
        selectionAsOfDate: dayKey(priorDate),
        action: isRebalanceDay
          ? "exit"
          : "hold",
        targetSymbol: isRebalanceDay
          ? null
          : heldSymbol,
        heldSymbol,
        rawPick: null,
        isRebalanceDay,
        absoluteMomentumPassed: false,
        rotationBlocked: false,
        rankings,
        reason: isRebalanceDay
          ? "Absolute momentum negative — exit to cash on rebalance."
          : "Absolute momentum negative — exit on next rebalance (Monday)."
      };
    }

    return {
      signalDate: signalDay,
      selectionAsOfDate: dayKey(priorDate),
      action: "stay_cash",
      targetSymbol: null,
      heldSymbol: null,
      rawPick: null,
      isRebalanceDay,
      absoluteMomentumPassed: false,
      rotationBlocked: false,
      rankings,
      reason: "Absolute momentum negative — stay in cash."
    };
  }

  if (!isRebalanceDay) {
    if (heldSymbol) {
      const stillValid =
        heldSymbol === rawPick ||
        rankings.some(
          (entry) =>
            entry.symbol === heldSymbol
        );

      return {
        signalDate: signalDay,
        selectionAsOfDate: dayKey(priorDate),
        action: "hold",
        targetSymbol: heldSymbol,
        heldSymbol,
        rawPick,
        isRebalanceDay: false,
        absoluteMomentumPassed: true,
        rotationBlocked: !stillValid,
        rankings,
        reason:
          rawPick !== heldSymbol
            ? `Hold ${heldSymbol} until weekly rebalance (Monday). Model pick: ${rawPick}.`
            : `Hold ${heldSymbol} until next rebalance.`
      };
    }

    return {
      signalDate: signalDay,
      selectionAsOfDate: dayKey(priorDate),
      action: "stay_cash",
      targetSymbol: null,
      heldSymbol: null,
      rawPick,
      isRebalanceDay: false,
      absoluteMomentumPassed: true,
      rotationBlocked: false,
      rankings,
      reason: `Wait for rebalance (Monday) to enter ${rawPick}.`
    };
  }

  const daysHeld =
    heldSymbol && heldSinceDay
      ? countDaysHeld(
          heldSinceDay,
          signalDay
        )
      : 0;

  const activeSymbols = resolveActiveSymbols(
    selection,
    heldSymbol,
    daysHeld,
    rotation
  );

  const targetSymbol =
    activeSymbols[0] ?? null;

  const rotationBlocked =
    rawPick !== null &&
    targetSymbol !== rawPick;

  if (!heldSymbol && targetSymbol) {
    return {
      signalDate: signalDay,
      selectionAsOfDate: dayKey(priorDate),
      action: "buy",
      targetSymbol,
      heldSymbol: null,
      rawPick,
      isRebalanceDay: true,
      absoluteMomentumPassed: true,
      rotationBlocked,
      rankings,
      reason: `Enter ${targetSymbol} on rebalance.`
    };
  }

  if (
    heldSymbol &&
    targetSymbol &&
    targetSymbol !== heldSymbol
  ) {
    return {
      signalDate: signalDay,
      selectionAsOfDate: dayKey(priorDate),
      action: "rotate",
      targetSymbol,
      heldSymbol,
      rawPick,
      isRebalanceDay: true,
      absoluteMomentumPassed: true,
      rotationBlocked,
      rankings,
      reason: `Rotate ${heldSymbol} → ${targetSymbol}.`
    };
  }

  if (heldSymbol && targetSymbol === heldSymbol) {
    return {
      signalDate: signalDay,
      selectionAsOfDate: dayKey(priorDate),
      action: "hold",
      targetSymbol: heldSymbol,
      heldSymbol,
      rawPick,
      isRebalanceDay: true,
      absoluteMomentumPassed: true,
      rotationBlocked,
      rankings,
      reason: rotationBlocked
        ? `Keep ${heldSymbol}; rotation policy blocks switch to ${rawPick}.`
        : `Keep holding ${heldSymbol}.`
    };
  }

  return {
    signalDate: signalDay,
    selectionAsOfDate: dayKey(priorDate),
    action: "stay_cash",
    targetSymbol: null,
    heldSymbol,
    rawPick,
    isRebalanceDay: true,
    absoluteMomentumPassed: true,
    rotationBlocked,
    rankings,
    reason: "No action."
  };
}
