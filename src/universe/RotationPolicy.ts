import type { SelectionSnapshot } from "./PointInTimeSelector.js";

export interface RotationPolicyOptions {
  minHoldDays?: number;
  minScoreImprovement?: number;
}

export function resolveActiveSymbols(
  selection: SelectionSnapshot,
  currentSymbol: string | null,
  daysHeld: number,
  options: RotationPolicyOptions = {}
): string[] {
  const minHoldDays =
    options.minHoldDays ?? 0;

  const minScoreImprovement =
    options.minScoreImprovement ?? 0;

  const target =
    selection.selectedSymbols[0];

  if (!target) {
    return [];
  }

  if (
    !currentSymbol ||
    currentSymbol === target
  ) {
    return selection.selectedSymbols;
  }

  const currentScore =
    selection.scores.find(
      (entry) =>
        entry.symbol === currentSymbol
    )?.score ?? 0;

  const targetScore =
    selection.scores.find(
      (entry) =>
        entry.symbol === target
    )?.score ?? 0;

  const scoreImprovement =
    targetScore - currentScore;

  if (
    daysHeld < minHoldDays ||
    scoreImprovement < minScoreImprovement
  ) {
    return [currentSymbol];
  }

  return selection.selectedSymbols;
}

export function countDaysHeld(
  entryDay: string,
  currentDay: string
): number {
  const entry = new Date(`${entryDay}T00:00:00.000Z`);
  const current = new Date(`${currentDay}T00:00:00.000Z`);

  const milliseconds =
    current.getTime() - entry.getTime();

  return Math.max(
    0,
    Math.floor(
      milliseconds /
      (24 * 60 * 60 * 1000)
    )
  );
}
