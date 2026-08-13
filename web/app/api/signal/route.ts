import "dotenv/config";

import {
  StrategyDashboardService
} from "@core/services/StrategyDashboardService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const service =
      new StrategyDashboardService();

    const signal =
      await service.getSignal();

    return Response.json(signal);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load signal";

    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
