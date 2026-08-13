import "dotenv/config";

import {
  StrategyDashboardService
} from "@core/services/StrategyDashboardService";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request
) {
  try {
    const { searchParams } = new URL(
      request.url
    );

    const start =
      searchParams.get("start") ??
      "2025-01-01";

    const end =
      searchParams.get("end") ??
      "2026-08-08";

    const lookbackDays = Number(
      searchParams.get("lookback") ?? 126
    );

    const service =
      new StrategyDashboardService();

    const backtest =
      await service.getBacktest(
        start,
        end,
        lookbackDays
      );

    return Response.json(backtest);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to run backtest";

    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
