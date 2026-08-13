import "dotenv/config";

import type {
  AutomationJob,
  AutomationTrigger
} from "../automation/AutomationTypes.js";
import {
  AutomationService
} from "../services/AutomationService.js";

const job = process.argv[2] as AutomationJob;
const triggerArg = readFlag("--trigger");
const trigger =
  (triggerArg as AutomationTrigger | undefined) ??
  "manual";

async function main() {
  if (
    job !== "signal" &&
    job !== "backfill" &&
    job !== "trade-dry" &&
    job !== "trade-execute"
  ) {
    throw new Error(
      "Usage: automationJob.ts <backfill|signal|trade-dry|trade-execute> [--trigger scheduled|manual]"
    );
  }

  const service = new AutomationService();
  const result = await service.runJob(
    job,
    trigger
  );

  console.log(JSON.stringify(result));
}

function readFlag(
  name: string
): string | undefined {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Automation job failed"
    })
  );

  process.exit(1);
});
