import { NotificationServiceError } from "@/types";

export function mapNotificationError(error: unknown): NotificationServiceError {
  if (error instanceof NotificationServiceError) return error;
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/jwt|session|auth_required/i.test(message)) {
    return new NotificationServiceError("session_expired", "Your session has expired. Sign in again.");
  }
  if (/fetch|network|failed to fetch/i.test(message)) {
    return new NotificationServiceError("network", "Notifications could not be reached. Check your connection and retry.");
  }
  return new NotificationServiceError("unknown", "Notifications could not be loaded safely.");
}
