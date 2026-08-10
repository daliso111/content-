/** Tiny classnames helper — merges truthy class fragments. */
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}

/** Format a byte count into a human-readable string. */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/** Compact number formatting (e.g. 12_400 -> "12.4K"). */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** Full number with thousands separators. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

const DAY = 86_400_000;

/** e.g. "Aug 12, 2026". */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** e.g. "Aug 12". */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en", {
    month: "short",
    day: "numeric",
  });
}

/** e.g. "9:30 AM". */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** e.g. "Aug 12, 9:30 AM". */
export function formatDateTime(iso: string): string {
  return `${formatShortDate(iso)}, ${formatTime(iso)}`;
}

/** Human relative time, e.g. "3 hours ago", "in 2 days". */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const diff = new Date(iso).getTime() - now.getTime();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const minutes = 60_000;
  const hours = 3_600_000;

  if (abs < minutes) return rtf.format(Math.round(diff / 1000), "second");
  if (abs < hours) return rtf.format(Math.round(diff / minutes), "minute");
  if (abs < DAY) return rtf.format(Math.round(diff / hours), "hour");
  if (abs < DAY * 30) return rtf.format(Math.round(diff / DAY), "day");
  return formatDate(iso);
}

/** Initials from a full name, max two letters. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Truncate text to a maximum length, adding an ellipsis. */
export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/** Stable pseudo-random from a string seed (for deterministic mock visuals). */
export function seededValue(seed: string, max: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % max;
}

/** Build an ISO string offset from today by the given number of days. */
export function isoDaysFromNow(days: number, hour = 9, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** Basic email shape validation for frontend-only forms. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Generate a short unique-ish id for client-created mock records. */
export function makeId(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}
