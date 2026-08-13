import { NextResponse } from "next/server";

import {
  controlAutomation,
  getAutomationStatus
} from "@/lib/dashboard";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  try {
    const status = await getAutomationStatus();
    return NextResponse.json(status);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load automation status";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
    };

    if (!body.action) {
      return NextResponse.json(
        { error: "Missing action" },
        { status: 400 }
      );
    }

    const result = await controlAutomation(
      body.action
    );

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Automation control failed";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
