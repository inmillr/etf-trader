import type { AutomationSchedule } from "./AutomationTypes.js";
import { formatEtDay } from "./AutomationStore.js";

export type ScheduledAutomationJob =
  | "backfill"
  | "signal"
  | "trade";

function parseTimeEt(
  timeEt: string
): { hour: number; minute: number } {
  const [hourRaw, minuteRaw] =
    timeEt.split(":");

  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new Error(
      `Invalid schedule time: ${timeEt}`
    );
  }

  return { hour, minute };
}

function getScheduleTimeEt(
  schedule: AutomationSchedule,
  job: ScheduledAutomationJob
): string {
  switch (job) {
    case "backfill":
      return schedule.backfillTimeEt;
    case "signal":
      return schedule.signalTimeEt;
    case "trade":
      return schedule.tradeTimeEt;
  }
}

function getEtParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
} {
  const formatter =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short"
    });

  const parts = formatter.formatToParts(date);

  const read = (type: string): number => {
    const value = parts.find(
      (part) => part.type === type
    )?.value;

    return Number(value ?? 0);
  };

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    weekday:
      parts.find((part) => part.type === "weekday")
        ?.value ?? ""
  };
}

function isWeekday(date: Date): boolean {
  const weekday = getEtParts(date).weekday;

  return (
    weekday !== "Sat" &&
    weekday !== "Sun"
  );
}

function buildEtDate(
  base: Date,
  hour: number,
  minute: number
): Date {
  const day = formatEtDay(base);
  const utcGuess = new Date(
    `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-04:00`
  );

  const formatter =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });

  const parts = formatter.formatToParts(utcGuess);
  const actualHour = Number(
    parts.find((part) => part.type === "hour")
      ?.value ?? hour
  );
  const actualMinute = Number(
    parts.find((part) => part.type === "minute")
      ?.value ?? minute
  );

  if (
    actualHour !== hour ||
    actualMinute !== minute
  ) {
    const dstGuess = new Date(
      `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-05:00`
    );

    return dstGuess;
  }

  return utcGuess;
}

export function nextScheduledRun(
  schedule: AutomationSchedule,
  job: ScheduledAutomationJob,
  from = new Date()
): Date | null {
  const { hour, minute } = parseTimeEt(
    getScheduleTimeEt(schedule, job)
  );

  for (let offset = 0; offset < 8; offset += 1) {
    const candidate = new Date(from);
    candidate.setUTCDate(
      candidate.getUTCDate() + offset
    );

    if (!isWeekday(candidate)) {
      continue;
    }

    const scheduled = buildEtDate(
      candidate,
      hour,
      minute
    );

    if (scheduled.getTime() > from.getTime()) {
      return scheduled;
    }
  }

  return null;
}

export function isJobDue(
  schedule: AutomationSchedule,
  job: ScheduledAutomationJob,
  lastRunDay: string | null,
  now = new Date()
): boolean {
  if (!isWeekday(now)) {
    return false;
  }

  const { hour, minute } = parseTimeEt(
    getScheduleTimeEt(schedule, job)
  );

  const et = getEtParts(now);
  const nowMinutes = et.hour * 60 + et.minute;
  const targetMinutes = hour * 60 + minute;
  const today = formatEtDay(now);

  if (lastRunDay === today) {
    return false;
  }

  return nowMinutes >= targetMinutes;
}
