import "dotenv/config";

import {
  AutomationService,
  spawnAutomationJob
} from "../services/AutomationService.js";
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

    case "automation-status": {
      const automation =
        new AutomationService();

      const result =
        await automation.getStatusWithMarket();

      console.log(
        JSON.stringify(result)
      );

      return;
    }

    case "automation-control": {
      const action = readFlag("--action");

      if (!action) {
        throw new Error(
          "automation-control requires --action"
        );
      }

      const automation =
        new AutomationService();

      switch (action) {
        case "enable": {
          console.log(
            JSON.stringify(
              automation.setEnabled(true)
            )
          );
          return;
        }

        case "disable": {
          console.log(
            JSON.stringify(
              automation.setEnabled(false)
            )
          );
          return;
        }

        case "start-daemon": {
          console.log(
            JSON.stringify(
              automation.startDaemon()
            )
          );
          return;
        }

        case "stop-daemon": {
          console.log(
            JSON.stringify(
              automation.stopDaemon()
            )
          );
          return;
        }

        case "run-signal": {
          spawnAutomationJob("signal");

          console.log(
            JSON.stringify({
              ...(await automation.getStatusWithMarket()),
              accepted: true,
              message: "Signal job started"
            })
          );
          return;
        }

        case "run-trade-dry": {
          spawnAutomationJob("trade-dry");

          console.log(
            JSON.stringify({
              ...(await automation.getStatusWithMarket()),
              accepted: true,
              message: "Trade preview job started"
            })
          );
          return;
        }

        case "run-trade-execute": {
          spawnAutomationJob("trade-execute");

          console.log(
            JSON.stringify({
              ...(await automation.getStatusWithMarket()),
              accepted: true,
              message: "Trade execute job started"
            })
          );
          return;
        }

        default:
          throw new Error(
            `Unknown automation action: ${action}`
          );
      }
    }

    default:
      throw new Error(
        `Unknown command: ${command ?? "(missing)"}. ` +
        "Use signal, backtest, journal, automation-status, or automation-control."
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
