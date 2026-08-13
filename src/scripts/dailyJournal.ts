import "dotenv/config";

import {
  StrategyDashboardService
} from "../services/StrategyDashboardService.js";

const args = process.argv.slice(2).filter(
  (arg) => !arg.startsWith("--")
);

const startString =
  args[0] ?? "2025-01-01";

const endString =
  args[1] ?? "2026-08-08";

const service =
  new StrategyDashboardService();

const journal = await service.getJournal(
  startString,
  endString
);

console.log(
  "=== Daily Journal (Aggressive) ==="
);
console.log(
  `Period:     ${journal.start} → ${journal.end}`
);
console.log(
  `Return:     ${journal.summary.returnPercent.toFixed(2)}%`
);
console.log(
  `Drawdown:   ${journal.summary.maxDrawdown.toFixed(2)}%`
);
console.log(
  `Trades:     ${journal.summary.trades}`
);
console.log("");

console.log(
  "Date         Equity      Day %    Position   Note"
);

for (const entry of journal.entries.slice(-30)) {
  const note = entry.rebalance
    ? "rebalance"
    : "";

  console.log(
    `${entry.date}  $${entry.equity.toFixed(2).padStart(9)}  ${(entry.dayReturnPercent >= 0 ? "+" : "") + entry.dayReturnPercent.toFixed(2).padStart(6)}%  ${entry.position.padEnd(8)}  ${note}`
  );
}
