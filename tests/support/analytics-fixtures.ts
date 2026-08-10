import type { OperationalAnalyticsFilters } from "@/types/analytics";

/**
 * PostgreSQL serialises `timestamptz` inside jsonb as ISO 8601 with a numeric
 * offset and no fractional seconds — `2026-07-11T00:00:00+00:00`. The browser
 * sends the same instant as `2026-07-11T00:00:00.000Z`. Reproducing the server
 * spelling here is what makes the regression tests meaningful.
 */
export function pgTimestamp(iso: string): string {
  const value = new Date(iso);
  return `${value.toISOString().slice(0, 19)}+00:00`;
}

export const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";

/** A UTC 30-day window, matching the page's default range preset. */
export const FILTERS: OperationalAnalyticsFilters = {
  workspaceId: WORKSPACE_ID,
  startAt: "2026-07-11T00:00:00.000Z",
  endAt: "2026-08-10T00:00:00.000Z",
  platform: null,
  timezone: "UTC",
};

export const COMPARISON_START_AT = "2026-06-11T00:00:00.000Z";

export type RpcPayload = Record<string, unknown>;

/**
 * The verified live dataset: 11 succeeded and 2 cancelled Facebook jobs in the
 * last 30 days, with no failures.
 */
export function verifiedPayload(overrides: RpcPayload = {}): RpcPayload {
  return {
    current_range: {
      start_at: pgTimestamp(FILTERS.startAt),
      end_at: pgTimestamp(FILTERS.endAt),
    },
    comparison_range: {
      start_at: pgTimestamp(COMPARISON_START_AT),
      end_at: pgTimestamp(FILTERS.startAt),
    },
    bucket_kind: "day",
    posts: { current: 9, previous: 6 },
    publishing: {
      successful: 11,
      failed: 0,
      reconciliation_required: 0,
      active: 0,
      cancelled: 2,
      success_rate: 100.0,
      retry_count: 0,
      failure_attempt_count: 0,
      average_delay_seconds: 42,
      median_delay_seconds: 30,
      on_time_count: 0,
      scheduled_succeeded_count: 0,
      consistency_rate: null,
    },
    platform_results: [
      {
        platform: "facebook",
        succeeded: 11,
        failed: 0,
        reconciliation_required: 0,
        cancelled: 2,
      },
    ],
    content_types: [{ type: "image", posts: 7 }, { type: "text", posts: 2 }],
    time_series: [
      { bucket_start: pgTimestamp("2026-08-08T00:00:00Z"), successful: 4, failed: 0 },
      { bucket_start: pgTimestamp("2026-08-09T00:00:00Z"), successful: 7, failed: 0 },
    ],
    weekday_activity: [
      { day_index: 6, label: "Sat", jobs: 4 },
      { day_index: 7, label: "Sun", jobs: 7 },
    ],
    recent_results: [
      {
        job_id: "job-1",
        post_id: "post-1",
        caption: "Site progress update",
        platform: "facebook",
        social_account_id: "account-1",
        account_name: "Dalisoto Blessings",
        account_username: "@dalisoto",
        status: "succeeded",
        completed_at: pgTimestamp("2026-08-09T09:30:00Z"),
        provider_permalink: "https://www.facebook.com/permalink/1",
        attempt_count: 1,
      },
    ],
    data_freshness: {
      generated_at: pgTimestamp("2026-08-09T10:00:00Z"),
      latest_completed_at: pgTimestamp("2026-08-09T09:30:00Z"),
    },
    ...overrides,
  };
}

/** A period in which nothing was created and nothing was published. */
export function emptyPayload(): RpcPayload {
  return verifiedPayload({
    posts: { current: 0, previous: 0 },
    publishing: {
      successful: 0,
      failed: 0,
      reconciliation_required: 0,
      active: 0,
      cancelled: 0,
      success_rate: null,
      retry_count: 0,
      failure_attempt_count: 0,
      average_delay_seconds: null,
      median_delay_seconds: null,
      on_time_count: 0,
      scheduled_succeeded_count: 0,
      consistency_rate: null,
    },
    platform_results: [],
    content_types: [],
    time_series: [],
    weekday_activity: [],
    recent_results: [],
  });
}

export interface RecordedCall {
  name: string;
  args: Record<string, unknown>;
}

/** A Supabase stand-in that records its calls and returns a canned result. */
export function stubClient(
  result: { data?: unknown; error?: unknown },
  calls: RecordedCall[] = [],
) {
  return {
    calls,
    getClient: () => ({
      rpc: (name: "get_operational_analytics", args: Record<string, unknown>) => {
        calls.push({ name, args });
        return Promise.resolve({
          data: result.data ?? null,
          error: result.error ?? null,
        });
      },
    }),
  };
}
