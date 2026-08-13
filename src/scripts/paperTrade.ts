import "dotenv/config";

import {
  PaperTradingRunner
} from "../broker/PaperTradingRunner.js";

const args = process.argv.slice(2);

function readFlag(name: string): string | undefined {
  const index = args.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

const execute = args.includes("--execute");
const offline = args.includes("--offline");
const force = args.includes("--force");
const signalDateArg = readFlag("--date");

const runner = new PaperTradingRunner();

console.log("=== Paper Trade (Aggressive) ===");
console.log(
  `Mode:       ${offline ? "OFFLINE PREVIEW" : execute ? "PAPER EXECUTE" : "DRY RUN"}`
);
console.log("");

const result = await runner.runPaperTrade({
  execute,
  offline,
  force,
  ...(signalDateArg ? { date: signalDateArg } : {})
});

if (result.signal) {
  console.log(
    `Signal (${result.signal.signalDate}): ${result.signal.action.toUpperCase()}`
  );
  console.log(`Reason: ${result.signal.reason}`);
  console.log("");
}

if (result.planText) {
  console.log(result.planText);
  console.log("");
}

if (result.referencePrice != null) {
  console.log(
    `Reference price: $${result.referencePrice.toFixed(2)}`
  );
  console.log("");
}

if (!result.success) {
  console.error(result.message);
  process.exit(1);
}

console.log(result.message);

if (
  result.mode === "dry-run" ||
  result.mode === "offline"
) {
  process.exit(0);
}

if (result.orders?.length) {
  for (const order of result.orders) {
    console.log(
      `  ${order.side.toUpperCase()} ${order.symbol} qty=${order.qty} status=${order.status}`
    );
  }
}
