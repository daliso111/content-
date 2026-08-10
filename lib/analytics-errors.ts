export type AnalyticsErrorCode =
  | "session_expired"
  | "permission_denied"
  | "workspace_unavailable"
  | "invalid_date_range"
  | "range_too_large"
  | "invalid_timezone"
  | "network_failure"
  | "analytics_unavailable"
  | "aggregation_failure";

export class AnalyticsServiceError extends Error {
  readonly code: AnalyticsErrorCode;

  constructor(code: AnalyticsErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AnalyticsServiceError";
    this.code = code;
  }
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    return [record.code, record.message, record.details, record.hint]
      .filter((value): value is string => typeof value === "string")
      .join(" ");
  }
  return String(error ?? "");
}

export function mapAnalyticsError(error: unknown): AnalyticsServiceError {
  if (error instanceof AnalyticsServiceError) return error;

  const text = errorText(error).toLowerCase();
  if (
    text.includes("analytics_auth_required") ||
    text.includes("jwt expired") ||
    text.includes("not authenticated")
  ) {
    return new AnalyticsServiceError(
      "session_expired",
      "Your session has expired. Sign in again to view analytics.",
      { cause: error },
    );
  }
  if (
    text.includes("analytics_workspace_denied") ||
    text.includes("permission denied") ||
    text.includes("42501")
  ) {
    return new AnalyticsServiceError(
      "permission_denied",
      "You do not have access to analytics for this workspace.",
      { cause: error },
    );
  }
  if (text.includes("analytics_range_too_large")) {
    return new AnalyticsServiceError(
      "range_too_large",
      "Choose a date range of one year or less.",
      { cause: error },
    );
  }
  if (text.includes("analytics_date_range_invalid")) {
    return new AnalyticsServiceError(
      "invalid_date_range",
      "Choose a valid start and end date.",
      { cause: error },
    );
  }
  if (text.includes("analytics_timezone_invalid")) {
    return new AnalyticsServiceError(
      "invalid_timezone",
      "The workspace timezone is not valid.",
      { cause: error },
    );
  }
  if (
    text.includes("pgrst202") ||
    text.includes("get_operational_analytics") && text.includes("could not find")
  ) {
    return new AnalyticsServiceError(
      "analytics_unavailable",
      "Operational analytics are not available until the Stage 4A database migration is applied.",
      { cause: error },
    );
  }
  if (
    text.includes("failed to fetch") ||
    text.includes("networkerror") ||
    text.includes("network request") ||
    text.includes("request timed out")
  ) {
    return new AnalyticsServiceError(
      "network_failure",
      "PostFlow could not reach analytics. Check your connection and try again.",
      { cause: error },
    );
  }
  if (
    text.includes("supabase is not configured") ||
    text.includes("workspace unavailable")
  ) {
    return new AnalyticsServiceError(
      "workspace_unavailable",
      "Analytics are unavailable until this workspace is connected.",
      { cause: error },
    );
  }

  return new AnalyticsServiceError(
    "aggregation_failure",
    "PostFlow could not load operational analytics. Please try again.",
    { cause: error },
  );
}
