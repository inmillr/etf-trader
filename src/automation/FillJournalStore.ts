import {
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { dirname } from "node:path";

import type { PaperTradeRunResult } from "../broker/PaperTradingRunner.js";
import type { AlpacaOrder } from "../broker/AlpacaTradingTypes.js";
import type {
  AutomationTrigger,
  FillJournalEntry
} from "./AutomationTypes.js";
import { formatEtDay } from "./AutomationStore.js";

const MAX_ENTRIES = 100;

export function resolveFillJournalPath(): string {
  return (
    process.env.FILL_JOURNAL_PATH ??
    "./data/fill-journal.json"
  );
}

export function loadFillJournal(
  path = resolveFillJournalPath()
): FillJournalEntry[] {
  try {
    const parsed = JSON.parse(
      readFileSync(path, "utf8")
    ) as { entries?: FillJournalEntry[] };

    return parsed.entries ?? [];
  } catch {
    return [];
  }
}

export function saveFillJournal(
  entries: FillJournalEntry[],
  path = resolveFillJournalPath()
): void {
  mkdirSync(dirname(path), { recursive: true });

  writeFileSync(
    path,
    `${JSON.stringify({ entries }, null, 2)}\n`
  );
}

export function slippageBps(
  fromPrice: number | null,
  toPrice: number | null
): number | null {
  if (
    fromPrice == null ||
    toPrice == null ||
    fromPrice <= 0
  ) {
    return null;
  }

  return (
    ((toPrice - fromPrice) / fromPrice) *
    10_000
  );
}

export function fillPriceFromOrders(
  symbol: string,
  side: "buy" | "sell",
  orders: AlpacaOrder[] | undefined
): number | null {
  const order = orders?.find(
    (candidate) =>
      candidate.symbol === symbol &&
      candidate.side === side
  );

  if (!order?.filled_avg_price) {
    return null;
  }

  const price = Number(order.filled_avg_price);

  if (!Number.isFinite(price) || price <= 0) {
    return null;
  }

  return price;
}

export function entriesFromTrade(
  result: PaperTradeRunResult,
  trigger: AutomationTrigger,
  priceBySymbol: Record<string, number | null>,
  now = new Date()
): FillJournalEntry[] {
  if (!result.success || !result.plan) {
    return [];
  }

  if (result.plan.noTrade) {
    return [];
  }

  const day = formatEtDay(now);

  return result.plan.steps.map((step, index) => ({
    id: `${now.getTime()}-${step.side}-${step.symbol}-${index}`,
    at: now.toISOString(),
    day,
    trigger,
    mode: result.mode,
    signalAction: result.plan!.signalAction,
    side: step.side,
    symbol: step.symbol,
    qty: step.qty,
    backtestPrice:
      priceBySymbol[step.symbol] ??
      result.referencePrice ??
      null,
    alpacaFillPrice: fillPriceFromOrders(
      step.symbol,
      step.side,
      result.orders
    ),
    nextClose: null,
    nextCloseDate: null
  }));
}

export function recordTradeFills(
  result: PaperTradeRunResult,
  trigger: AutomationTrigger,
  priceBySymbol: Record<string, number | null>,
  path = resolveFillJournalPath()
): FillJournalEntry[] {
  const recorded = entriesFromTrade(
    result,
    trigger,
    priceBySymbol
  );

  if (recorded.length === 0) {
    return loadFillJournal(path);
  }

  const entries = [
    ...recorded,
    ...loadFillJournal(path)
  ].slice(0, MAX_ENTRIES);

  saveFillJournal(entries, path);

  return entries;
}

export async function resolvePendingNextCloses(
  lookup: (
    symbol: string,
    afterDay: string
  ) => Promise<{
    date: string;
    close: number;
  } | null>,
  path = resolveFillJournalPath()
): Promise<FillJournalEntry[]> {
  const entries = loadFillJournal(path);
  let changed = false;

  const nextEntries: FillJournalEntry[] = [];

  for (const entry of entries) {
    if (entry.nextClose != null) {
      nextEntries.push(entry);
      continue;
    }

    const next = await lookup(
      entry.symbol,
      entry.day
    );

    if (!next) {
      nextEntries.push(entry);
      continue;
    }

    changed = true;
    nextEntries.push({
      ...entry,
      nextClose: next.close,
      nextCloseDate: next.date
    });
  }

  if (changed) {
    saveFillJournal(nextEntries, path);
  }

  return nextEntries;
}
