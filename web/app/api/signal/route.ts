import {
  getDashboardSignal
} from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const signal =
      await getDashboardSignal();

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
