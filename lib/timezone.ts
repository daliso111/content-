import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function workspaceDateTimeToUtc(
  date: string,
  time: string,
  timeZone: string,
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new Error("Enter a valid date and time.");
  }
  if (!isValidTimeZone(timeZone)) throw new Error("The workspace time zone is invalid.");

  const localValue = `${date}T${time}`;
  const utcDate = fromZonedTime(`${localValue}:00`, timeZone);
  if (
    Number.isNaN(utcDate.getTime()) ||
    formatInTimeZone(utcDate, timeZone, "yyyy-MM-dd'T'HH:mm") !== localValue
  ) {
    throw new Error("This local time does not exist in the selected time zone.");
  }
  return utcDate.toISOString();
}

export function utcToWorkspaceFields(
  iso: string,
  timeZone: string,
): { date: string; time: string } {
  if (!isValidTimeZone(timeZone)) throw new Error("The workspace time zone is invalid.");
  return {
    date: formatInTimeZone(iso, timeZone, "yyyy-MM-dd"),
    time: formatInTimeZone(iso, timeZone, "HH:mm"),
  };
}

export function formatInWorkspaceTime(
  iso: string,
  timeZone: string,
  pattern = "MMM d, yyyy, h:mm a zzz",
): string {
  return formatInTimeZone(iso, timeZone, pattern);
}
