import {
  getDashboardJournal
} from "@/lib/dashboard";

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

    const lookback = Number(
      searchParams.get("lookback") ?? 126
    );

    const journal =
      await getDashboardJournal(
        start,
        end,
        lookback
      );

    return Response.json(journal);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load journal";

    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}
