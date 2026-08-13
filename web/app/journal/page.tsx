import { getDashboardJournal } from "@/lib/dashboard";
import { JournalView } from "@/components/JournalView";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const journal =
    await getDashboardJournal(
      "2026-07-01",
      "2026-08-08"
    );

  return (
    <JournalView initialData={journal} />
  );
}
