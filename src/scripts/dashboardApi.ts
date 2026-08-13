import "dotenv/config";

import {
  StrategyDashboardService
} from "../services/StrategyDashboardService.js";

const command = process.argv[2];

async function main() {
  const service =
    new StrategyDashboardService();

  switch (command) {
    case "signal": {
      const date = readFlag("--date");
      const lookback = Number(
        readFlag("--lookback") ?? 126
      );

      const result =
        await service.getSignal({
          ...(date ? { date } : {}),
          lookbackDays: lookback
        });

      console.log(
        JSON.stringify(result)
      );

      return;
    }

    case "backtest": {
      const start =
        readFlag("--start") ??
        "2025-01-01";

      const end =
        readFlag("--end") ??
        "2026-08-08";

      const lookback = Number(
        readFlag("--lookback") ?? 126
      );

      const result =
        await service.getBacktest(
          start,
          end,
          lookback
        );

      console.log(
        JSON.stringify(result)
      );

      return;
    }

    case "journal": {
      const start =
        readFlag("--start") ??
        "2025-01-01";

      const end =
        readFlag("--end") ??
        "2026-08-08";

      const lookback = Number(
        readFlag("--lookback") ?? 126
      );

      const result =
        await service.getJournal(
          start,
          end,
          lookback
        );

      console.log(
        JSON.stringify(result)
      );

      return;
    }

    default:
      throw new Error(
        `Unknown command: ${command ?? "(missing)"}. ` +
        "Use signal, backtest, or journal."
      );
  }
}

function readFlag(
  name: string
): string | undefined {
  const index =
    process.argv.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      error:
        error instanceof Error
          ? error.message
          : "Dashboard API failed"
    })
  );

  process.exit(1);
});
