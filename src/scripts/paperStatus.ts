import "dotenv/config";

import { AlpacaTradingClient } from "../broker/AlpacaTradingClient.js";
import { getAlpacaConfig } from "../config/AlpacaConfig.js";
import { getTradingConfig } from "../config/TradingConfig.js";

function formatMoney(value: string): string {
  const amount = Number(value);

  if (Number.isNaN(amount)) {
    return value;
  }

  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleString(
    "en-US",
    { timeZone: "America/New_York" }
  );
}

const alpacaConfig = getAlpacaConfig();
const tradingConfig = getTradingConfig();
const client = new AlpacaTradingClient(alpacaConfig);

console.log("=== Alpaca Paper Status ===");
console.log(
  `Mode:              ${alpacaConfig.paper ? "PAPER" : "LIVE"}`
);
console.log(
  `Trading API:       ${alpacaConfig.tradingBaseUrl}`
);
console.log(
  `Execution enabled: ${tradingConfig.paperTradingEnabled ? "yes" : "no (dry-run only)"}`
);
console.log(
  `Allow live:        ${tradingConfig.allowLiveTrading ? "yes" : "no"}`
);
console.log("");

try {
  const [account, positions, clock] =
    await Promise.all([
      client.getAccount(),
      client.getPositions(),
      client.getClock()
    ]);

  console.log("Account");
  console.log(
    `  Status:         ${account.status}`
  );
  console.log(
    `  Equity:         ${formatMoney(account.equity)}`
  );
  console.log(
    `  Cash:           ${formatMoney(account.cash)}`
  );
  console.log(
    `  Buying power:   ${formatMoney(account.buying_power)}`
  );
  console.log(
    `  Portfolio:      ${formatMoney(account.portfolio_value)}`
  );

  if (
    account.trading_blocked ||
    account.account_blocked
  ) {
    console.log(
      "  Warning:        account or trading is blocked"
    );
  }

  console.log("");
  console.log("Market clock (ET)");
  console.log(
    `  Open now:       ${clock.is_open ? "yes" : "no"}`
  );
  console.log(
    `  Server time:    ${formatClock(clock.timestamp)}`
  );
  console.log(
    `  Next open:      ${formatClock(clock.next_open)}`
  );
  console.log(
    `  Next close:     ${formatClock(clock.next_close)}`
  );

  console.log("");
  console.log("Positions");

  if (positions.length === 0) {
    console.log("  (flat)");
  } else {
    for (const position of positions) {
      console.log(
        `  ${position.symbol}: ${position.qty} @ ${formatMoney(position.avg_entry_price)} (mkt ${formatMoney(position.current_price)})`
      );
    }
  }

  if (!tradingConfig.paperTradingEnabled) {
    console.log("");
    console.log(
      "To enable order execution after your paper account is ready:"
    );
    console.log(
      "  1. Enable paper trading in the Alpaca dashboard"
    );
    console.log(
      "  2. Set PAPER_TRADING_ENABLED=true in .env"
    );
    console.log(
      "  3. Run: npm run paper:trade -- --execute"
    );
  }
} catch (error) {
  console.error("");
  console.error(
    "Could not reach Alpaca paper trading API."
  );

  if (error instanceof Error) {
    console.error(error.message);
  }

  console.error("");
  console.error("Checklist:");
  console.error(
    "  • Paper trading enabled in Alpaca dashboard"
  );
  console.error(
    "  • ALPACA_API_KEY and ALPACA_API_SECRET in .env"
  );
  console.error(
    "  • ALPACA_PAPER=true (default)"
  );

  process.exit(1);
}
