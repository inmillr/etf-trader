import type { Timeframe } from "../types/market.js";

export function timeframeToMinutes(
  timeframe: Timeframe
): number {
  switch (timeframe) {
    case "1m":
      return 1;

    case "5m":
      return 5;

    case "15m":
      return 15;

    case "30m":
      return 30;

    case "1h":
      return 60;

    case "1d":
      return 1440;
  }
}