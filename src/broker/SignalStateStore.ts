import {
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { dirname } from "node:path";

import type { SignalAction } from "../signals/DualMomentumSignal.js";

export interface SignalState {
  symbol: string;
  since: string;
}

export function loadSignalState(
  path: string
): SignalState | null {
  try {
    const parsed = JSON.parse(
      readFileSync(path, "utf8")
    ) as SignalState;

    if (!parsed.symbol || !parsed.since) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function saveSignalState(
  path: string,
  state: SignalState | null
): void {
  mkdirSync(dirname(path), { recursive: true });

  if (!state) {
    writeFileSync(path, "{}\n");
    return;
  }

  writeFileSync(
    path,
    `${JSON.stringify(state, null, 2)}\n`
  );
}

export function signalStateAfterAction(
  action: SignalAction,
  signalDate: string,
  targetSymbol: string | null
): SignalState | null {
  if (
    action === "buy" ||
    action === "rotate"
  ) {
    if (!targetSymbol) {
      return null;
    }

    return {
      symbol: targetSymbol,
      since: signalDate
    };
  }

  if (
    action === "exit" ||
    action === "stay_cash"
  ) {
    return null;
  }

  return null;
}
