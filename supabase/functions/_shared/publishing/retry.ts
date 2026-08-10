const DELAYS = [30, 120, 300, 900, 1800] as const;

export function retryDelay(
  attempt: number,
  retryAfterSeconds?: number | null,
  random = Math.random,
): number {
  const base = DELAYS[Math.min(Math.max(attempt - 1, 0), DELAYS.length - 1)];
  const jittered = Math.round(base * (0.85 + random() * 0.3));
  return Math.min(1800, Math.max(jittered, retryAfterSeconds ?? 0));
}
