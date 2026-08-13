import type { HistoricalDataRequest } from "./MarketData.js";
import { timeframeToMinutes } from "./Timeframe.js";

export function validateHistoricalDataRequest(
  request: HistoricalDataRequest
): void {
  if (request.symbol.trim().length === 0) {
    throw new Error("Symbol cannot be empty.");
  }

  if (!(request.start instanceof Date) ||
      Number.isNaN(request.start.getTime())) {
    throw new Error("Start date is invalid.");
  }

  if (!(request.end instanceof Date) ||
      Number.isNaN(request.end.getTime())) {
    throw new Error("End date is invalid.");
  }

  if (request.start >= request.end) {
    throw new Error(
      "Start date must be before end date."
    );
  }

  const minutes = timeframeToMinutes(
    request.timeframe
  );

  if (minutes <= 0) {
    throw new Error("Timeframe is invalid.");
  }
}