import { formatInTimeZone } from "date-fns-tz";
import { AnalyticsServiceError, mapAnalyticsError } from "@/lib/analytics-errors";
import { getSupabaseClient } from "@/lib/supabase/client";
import { formatInWorkspaceTime, workspaceDateTimeToUtc } from "@/lib/timezone";
import type {
  AnalyticsComparison,
  AnalyticsContentType,
  AnalyticsDateRange,
  AnalyticsRecentPublishingResult,
  AnalyticsViewState,
  AnalyticsViewStateInput,
  OperationalAnalytics,
  OperationalAnalyticsFilters,
  OperationalTimeSeriesPoint,
} from "@/types/analytics";
import type { SocialPlatform } from "@/types/common";
import type { MediaItem } from "@/types/media";
import type { PublishingJobStatus } from "@/types/publishing";

type UnknownRecord = Record<string, unknown>;

const PLATFORM_VALUES = new Set<SocialPlatform>([
  "facebook",
  "instagram",
  "tiktok",
  "linkedin",
  "youtube",
  "x",
]);
const CONTENT_TYPE_VALUES = new Set<AnalyticsContentType>([
  "image",
  "video",
  "graphic",
  "document",
  "logo",
  "text",
]);
const RECENT_STATUS_VALUES = new Set<PublishingJobStatus>([
  "succeeded",
  "failed",
  "reconciliation_required",
]);

function asRecord(value: unknown, context: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new AnalyticsServiceError(
      "aggregation_failure",
      `The analytics response was missing ${context}.`,
    );
  }
  return value as UnknownRecord;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asPlatform(value: unknown): SocialPlatform | null {
  return typeof value === "string" && PLATFORM_VALUES.has(value as SocialPlatform)
    ? (value as SocialPlatform)
    : null;
}

/**
 * PostgreSQL serialises `timestamptz` inside jsonb as ISO 8601 with a numeric
 * offset (`2026-07-11T00:00:00+00:00`), while the browser sends the same instant
 * as `Date#toISOString()` (`2026-07-11T00:00:00.000Z`). Those strings are never
 * equal, so every timestamp crossing this boundary is reduced to one canonical
 * spelling before it is stored, compared or formatted.
 */
export function toIsoInstant(value: unknown): string | null;
export function toIsoInstant(value: unknown, fallback: string): string;
export function toIsoInstant(value: unknown, fallback: string | null = null) {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return fallback;
}

function sameInstant(left: string, right: string) {
  const a = Date.parse(left);
  const b = Date.parse(right);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

function safeProviderUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isMetaHost =
      hostname === "facebook.com" ||
      hostname.endsWith(".facebook.com") ||
      hostname === "instagram.com" ||
      hostname.endsWith(".instagram.com");

    return url.protocol === "https:" && isMetaHost ? url.href : null;
  } catch {
    return null;
  }
}

function shiftIsoDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(value.getTime())) {
    throw new AnalyticsServiceError("invalid_date_range", "Invalid calendar date.");
  }
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function zonedDayBoundary(date: string, timezone: string) {
  try {
    return workspaceDateTimeToUtc(date, "00:00", timezone);
  } catch (error) {
    throw new AnalyticsServiceError(
      "invalid_timezone",
      "The workspace timezone could not be applied.",
      { cause: error },
    );
  }
}

export function getCustomAnalyticsRange(
  startDate: string,
  endDate: string,
  timezone: string,
): AnalyticsDateRange {
  if (!startDate || !endDate || startDate > endDate) {
    throw new AnalyticsServiceError(
      "invalid_date_range",
      "The start date must be on or before the end date.",
    );
  }
  const inclusiveDays =
    Math.round(
      (Date.parse(`${endDate}T12:00:00Z`) - Date.parse(`${startDate}T12:00:00Z`)) /
        86_400_000,
    ) + 1;
  if (!Number.isFinite(inclusiveDays) || inclusiveDays < 1) {
    throw new AnalyticsServiceError("invalid_date_range", "Invalid date range.");
  }
  if (inclusiveDays > 366) {
    throw new AnalyticsServiceError(
      "range_too_large",
      "Analytics date ranges cannot exceed one year.",
    );
  }
  return {
    startAt: zonedDayBoundary(startDate, timezone),
    endAt: zonedDayBoundary(shiftIsoDate(endDate, 1), timezone),
    startDate,
    endDate,
    timezone,
  };
}

export function getDefaultAnalyticsRange(
  days = 30,
  timezone = "UTC",
  now = new Date(),
): AnalyticsDateRange {
  const safeDays = Math.min(366, Math.max(1, Math.trunc(days)));
  const endDate = formatInTimeZone(now, timezone, "yyyy-MM-dd");
  return getCustomAnalyticsRange(
    shiftIsoDate(endDate, -(safeDays - 1)),
    endDate,
    timezone,
  );
}

export function calculateComparisonDisplay(
  current: number,
  previous: number,
): AnalyticsComparison {
  return {
    current,
    previous,
    percentage: previous === 0 ? null : ((current - previous) / previous) * 100,
    direction: current === previous ? "flat" : current > previous ? "up" : "down",
  };
}

function normalizeSeries(
  value: unknown,
  key: "successful" | "failed",
  timezone: string,
): OperationalTimeSeriesPoint[] {
  return asArray(value).flatMap((item) => {
    const row = asRecord(item, "time-series data");
    const bucketStart = toIsoInstant(row.bucket_start);
    if (!bucketStart) return [];
    return [{
      bucketStart,
      label: formatInWorkspaceTime(bucketStart, timezone, "MMM d"),
      value: asNumber(row[key]),
    }];
  });
}

function normalizeRecent(value: unknown): AnalyticsRecentPublishingResult[] {
  return asArray(value).flatMap((item) => {
    const row = asRecord(item, "recent publishing data");
    const platform = asPlatform(row.platform);
    const status = asString(row.status) as PublishingJobStatus;
    const completedAt = toIsoInstant(row.completed_at);
    if (!platform || !completedAt || !RECENT_STATUS_VALUES.has(status)) return [];
    return [{
      jobId: asString(row.job_id),
      postId: asString(row.post_id),
      caption: asString(row.caption),
      platform,
      socialAccountId: asString(row.social_account_id),
      accountName: asString(row.account_name, "Connected account"),
      accountUsername: asString(row.account_username),
      status: status as AnalyticsRecentPublishingResult["status"],
      completedAt,
      providerPermalink: safeProviderUrl(row.provider_permalink),
      attemptCount: asNumber(row.attempt_count),
      media: null,
    }];
  });
}

export function normalizeOperationalAnalytics(
  value: unknown,
  filters: OperationalAnalyticsFilters,
): OperationalAnalytics {
  const root = asRecord(value, "analytics data");
  const posts = asRecord(root.posts, "post totals");
  const publishing = asRecord(root.publishing, "publishing totals");
  asRecord(root.current_range, "current date range");
  const comparison = asRecord(root.comparison_range, "comparison date range");
  const freshness = asRecord(root.data_freshness, "freshness data");
  const bucketKind = root.bucket_kind === "week" ? "week" : "day";
  const currentPosts = asNumber(posts.current);
  const previousPosts = asNumber(posts.previous);
  const startAt = toIsoInstant(filters.startAt, filters.startAt);
  const endAt = toIsoInstant(filters.endAt, filters.endAt);
  const duration = Date.parse(endAt) - Date.parse(startAt);
  const comparisonStartAt = toIsoInstant(
    comparison.start_at,
    new Date(Date.parse(startAt) - duration).toISOString(),
  );
  const comparisonEndAt = toIsoInstant(comparison.end_at, startAt);

  const platforms = asArray(root.platform_results).flatMap((item) => {
    const row = asRecord(item, "platform results");
    const platform = asPlatform(row.platform);
    if (!platform) return [];
    const succeeded = asNumber(row.succeeded);
    const failed = asNumber(row.failed);
    const reconciliationRequired = asNumber(row.reconciliation_required);
    // `cancelled` was added to platform_results after Stage 4A shipped; older
    // deployments omit the key and report zero rather than failing.
    const cancelled = asNumber(row.cancelled);
    return [{
      platform,
      succeeded,
      failed,
      reconciliationRequired,
      cancelled,
      total: succeeded + failed + reconciliationRequired + cancelled,
    }];
  });

  const contentTypes = asArray(root.content_types).flatMap((item) => {
    const row = asRecord(item, "content-type results");
    const type = asString(row.type) as AnalyticsContentType;
    return CONTENT_TYPE_VALUES.has(type) ? [{ type, posts: asNumber(row.posts) }] : [];
  });

  const successful = asNumber(publishing.successful);
  const failed = asNumber(publishing.failed);
  const reconciliationRequired = asNumber(publishing.reconciliation_required);
  const cancelled = asNumber(publishing.cancelled);

  return {
    scope: { workspaceId: filters.workspaceId, platform: filters.platform },
    range: {
      // The RPC echoes the requested window back; the canonical client values are
      // authoritative so a completed response always matches the filters that
      // produced it, regardless of how PostgreSQL spelt the timestamps.
      startAt,
      endAt,
      startDate: formatInTimeZone(startAt, filters.timezone, "yyyy-MM-dd"),
      endDate: formatInTimeZone(new Date(Date.parse(endAt) - 1), filters.timezone, "yyyy-MM-dd"),
      timezone: filters.timezone,
    },
    comparisonRange: {
      startAt: comparisonStartAt,
      endAt: comparisonEndAt,
      startDate: formatInTimeZone(comparisonStartAt, filters.timezone, "yyyy-MM-dd"),
      endDate: formatInTimeZone(new Date(Date.parse(comparisonEndAt) - 1), filters.timezone, "yyyy-MM-dd"),
      timezone: filters.timezone,
    },
    bucketKind,
    totalPosts: {
      value: currentPosts,
      comparison: calculateComparisonDisplay(currentPosts, previousPosts),
    },
    publishing: {
      // Completed destination jobs in this window. Cancelled jobs are counted
      // here but never folded into successes or failures.
      total: successful + failed + reconciliationRequired + cancelled,
      successful,
      failed,
      reconciliationRequired,
      active: asNumber(publishing.active),
      cancelled,
      successRate: asNullableNumber(publishing.success_rate),
      retryCount: asNumber(publishing.retry_count),
      failureAttemptCount: asNumber(publishing.failure_attempt_count),
      averageDelaySeconds: asNullableNumber(publishing.average_delay_seconds),
      medianDelaySeconds: asNullableNumber(publishing.median_delay_seconds),
      onTimeCount: asNumber(publishing.on_time_count),
      scheduledSucceededCount: asNumber(publishing.scheduled_succeeded_count),
      consistencyRate: asNullableNumber(publishing.consistency_rate),
    },
    platforms,
    contentTypes,
    activitySeries: normalizeSeries(root.time_series, "successful", filters.timezone),
    failureSeries: normalizeSeries(root.time_series, "failed", filters.timezone),
    weekdayActivity: asArray(root.weekday_activity).map((item) => {
      const row = asRecord(item, "weekday activity");
      return { dayIndex: asNumber(row.day_index), label: asString(row.label), jobs: asNumber(row.jobs) };
    }),
    recentResults: normalizeRecent(root.recent_results),
    freshness: {
      generatedAt: toIsoInstant(freshness.generated_at, new Date().toISOString()),
      latestCompletedAt: toIsoInstant(freshness.latest_completed_at),
    },
  };
}

/**
 * True when a loaded result was produced by exactly these filters. Timestamps are
 * compared as instants, never as strings, so a differently formatted-but-equal
 * boundary can never strand the page in its loading state.
 */
export function analyticsMatchesFilters(
  analytics: OperationalAnalytics | null,
  filters: OperationalAnalyticsFilters | null,
): boolean {
  if (!analytics || !filters) return false;
  return (
    analytics.scope.workspaceId === filters.workspaceId &&
    analytics.scope.platform === filters.platform &&
    sameInstant(analytics.range.startAt, filters.startAt) &&
    sameInstant(analytics.range.endAt, filters.endAt)
  );
}

/**
 * Single source of truth for what the analytics page renders. Every terminal
 * outcome — success, empty, failure — leaves the loading state, so a skeleton is
 * only ever shown while a request is genuinely outstanding.
 */
export function resolveAnalyticsViewState(
  input: AnalyticsViewStateInput,
): AnalyticsViewState {
  if (input.error) return { kind: "error", error: input.error };
  if (!input.workspaceId) {
    return input.workspaceLoading ? { kind: "loading" } : { kind: "no-workspace" };
  }
  if (!input.filters) return { kind: "invalid-filters" };
  if (input.loading || input.workspaceLoading) return { kind: "loading" };
  if (analyticsMatchesFilters(input.analytics, input.filters)) {
    const data = input.analytics as OperationalAnalytics;
    return isEmptyAnalytics(data) ? { kind: "empty", data } : { kind: "ready", data };
  }
  return { kind: "loading" };
}

/** A period with no posts and no destination jobs of any status. */
export function isEmptyAnalytics(data: OperationalAnalytics): boolean {
  return (
    data.totalPosts.value === 0 &&
    data.publishing.total === 0 &&
    data.publishing.active === 0
  );
}

export interface OperationalAnalyticsRpcArgs extends Record<string, unknown> {
  p_workspace_id: string;
  p_start_at: string;
  p_end_at: string;
  p_platform: SocialPlatform | null;
  p_timezone: string;
}

export interface AnalyticsRpcClient {
  rpc(
    name: "get_operational_analytics",
    args: OperationalAnalyticsRpcArgs,
  ): Promise<{ data: unknown; error: unknown }>;
}

export interface OperationalAnalyticsDependencies {
  getClient?: () => AnalyticsRpcClient | null;
  loadRecentMedia?: (postId: string, workspaceId: string) => Promise<MediaItem | null>;
}

function defaultAnalyticsClient(): AnalyticsRpcClient | null {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  return {
    rpc: async (name, args) => {
      const rpcArgs = {
        p_workspace_id: args.p_workspace_id,
        p_start_at: args.p_start_at,
        p_end_at: args.p_end_at,
        p_timezone: args.p_timezone,
        ...(args.p_platform === null ? {} : { p_platform: args.p_platform }),
      };
      const { data, error } = await supabase.rpc(name, rpcArgs);
      return { data, error };
    },
  };
}

async function defaultRecentMedia(postId: string, workspaceId: string) {
  // Imported lazily so the analytics bundle does not pull in the post and
  // storage services just to render operational counts.
  const { getPostById, toSocialPost } = await import("@/lib/services/post-service");
  const post = await getPostById(postId);
  if (!post || post.post.workspace_id !== workspaceId) return null;
  return toSocialPost(post).media[0] ?? null;
}

export async function getOperationalAnalytics(
  filters: OperationalAnalyticsFilters,
  dependencies: OperationalAnalyticsDependencies = {},
): Promise<OperationalAnalytics> {
  const duration = Date.parse(filters.endAt) - Date.parse(filters.startAt);
  if (!filters.workspaceId) {
    throw new AnalyticsServiceError("workspace_unavailable", "Select a workspace to view analytics.");
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new AnalyticsServiceError("invalid_date_range", "Invalid analytics date range.");
  }
  if (duration > 366 * 86_400_000) {
    throw new AnalyticsServiceError("range_too_large", "Analytics date ranges cannot exceed one year.");
  }

  try {
    const client = (dependencies.getClient ?? defaultAnalyticsClient)();
    if (!client) {
      throw new AnalyticsServiceError(
        "workspace_unavailable",
        "Supabase is not configured for operational analytics.",
      );
    }
    const { data, error } = await client.rpc("get_operational_analytics", {
      p_workspace_id: filters.workspaceId,
      p_start_at: filters.startAt,
      p_end_at: filters.endAt,
      p_platform: filters.platform,
      p_timezone: filters.timezone,
    });
    if (error) throw error;

    const normalized = normalizeOperationalAnalytics(data, filters);
    const mostRecent = normalized.recentResults[0];
    if (mostRecent?.postId) {
      try {
        mostRecent.media = await (dependencies.loadRecentMedia ?? defaultRecentMedia)(
          mostRecent.postId,
          filters.workspaceId,
        );
      } catch {
        // Keep the operational result usable if a signed preview cannot be issued.
      }
    }
    return normalized;
  } catch (error) {
    throw mapAnalyticsError(error);
  }
}
