import "dotenv/config";

import { JournalView } from "@/components/JournalView";
import {
  StrategyDashboardService
} from "@core/services/StrategyDashboardService";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const service =
    new StrategyDashboardService();

  const journal =
    await service.getJournal(
      "2026-07-01",
      "2026-08-08"
    );

  return (
    <JournalView initialData={journal} />
  );
}
