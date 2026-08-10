import assert from "node:assert/strict";
import test from "node:test";
import { AnalyticsServiceError } from "@/lib/analytics-errors";
import {
  analyticsMatchesFilters,
  getOperationalAnalytics,
  normalizeOperationalAnalytics,
  toIsoInstant,
} from "@/lib/services/analytics-service";
import {
  emptyPayload,
  FILTERS,
  OTHER_WORKSPACE_ID,
  pgTimestamp,
  stubClient,
  verifiedPayload,
  type RecordedCall,
} from "./support/analytics-fixtures.ts";

const noMedia = () => Promise.resolve(null);

test("timestamps from PostgreSQL and the browser reduce to the same instant", () => {
  assert.equal(pgTimestamp("2026-07-11T00:00:00.000Z"), "2026-07-11T00:00:00+00:00");
  assert.equal(
    toIsoInstant("2026-07-11T00:00:00+00:00"),
    toIsoInstant("2026-07-11T00:00:00.000Z"),
  );
  assert.equal(toIsoInstant("not a timestamp"), null);
  assert.equal(toIsoInstant(null), null);
});

test("regression: a PostgreSQL-formatted range still matches the requested filters", () => {
  const analytics = normalizeOperationalAnalytics(verifiedPayload(), FILTERS);

  // The bug: the RPC echoed "2026-07-11T00:00:00+00:00" while the page held
  // "2026-07-11T00:00:00.000Z", so the strict string comparison never matched
  // and the page stayed on its skeleton forever.
  assert.notEqual(pgTimestamp(FILTERS.startAt), FILTERS.startAt);
  assert.equal(analytics.range.startAt, FILTERS.startAt);
  assert.equal(analytics.range.endAt, FILTERS.endAt);
  assert.equal(analyticsMatchesFilters(analytics, FILTERS), true);
});

test("the verified dataset aggregates to 13 total, 11 succeeded, 0 failed, 2 cancelled", () => {
  const { publishing } = normalizeOperationalAnalytics(verifiedPayload(), FILTERS);

  assert.equal(publishing.total, 13);
  assert.equal(publishing.successful, 11);
  assert.equal(publishing.failed, 0);
  assert.equal(publishing.cancelled, 2);
  assert.equal(publishing.reconciliationRequired, 0);
  assert.equal(publishing.successRate, 100);
});

test("cancelled jobs are counted as neither successes nor failures", () => {
  const payload = verifiedPayload({
    publishing: {
      ...(verifiedPayload().publishing as Record<string, unknown>),
      successful: 4,
      failed: 1,
      cancelled: 8,
      success_rate: 80.0,
    },
  });
  const { publishing } = normalizeOperationalAnalytics(payload, FILTERS);

  assert.equal(publishing.total, 13);
  assert.equal(publishing.successful, 4);
  assert.equal(publishing.failed, 1);
  assert.equal(publishing.cancelled, 8);
  // Success rate is succeeded ÷ (succeeded + failed); the 8 cancelled jobs are
  // absent from both sides of the ratio.
  assert.equal(publishing.successRate, 80);
});

test("the platform breakdown reports cancelled jobs and reconciles with the total", () => {
  const analytics = normalizeOperationalAnalytics(verifiedPayload(), FILTERS);
  const facebook = analytics.platforms[0];

  assert.equal(analytics.platforms.length, 1);
  assert.equal(facebook.platform, "facebook");
  assert.equal(facebook.succeeded, 11);
  assert.equal(facebook.cancelled, 2);
  assert.equal(facebook.total, 13);
  assert.equal(facebook.total, analytics.publishing.total);
});

test("a pre-migration payload without platform cancelled counts still normalizes", () => {
  const payload = verifiedPayload({
    platform_results: [
      { platform: "facebook", succeeded: 11, failed: 0, reconciliation_required: 0 },
    ],
  });
  const analytics = normalizeOperationalAnalytics(payload, FILTERS);

  assert.equal(analytics.platforms[0].cancelled, 0);
  assert.equal(analytics.platforms[0].total, 11);
  assert.equal(analytics.publishing.total, 13);
});

test("null aggregation values normalize to null instead of throwing", () => {
  const analytics = normalizeOperationalAnalytics(emptyPayload(), FILTERS);

  assert.equal(analytics.publishing.total, 0);
  assert.equal(analytics.publishing.successRate, null);
  assert.equal(analytics.publishing.averageDelaySeconds, null);
  assert.equal(analytics.publishing.medianDelaySeconds, null);
  assert.equal(analytics.publishing.consistencyRate, null);
  assert.deepEqual(analytics.platforms, []);
  assert.deepEqual(analytics.activitySeries, []);
  assert.deepEqual(analytics.recentResults, []);
});

test("unparseable timestamps are dropped rather than crashing the page", () => {
  const analytics = normalizeOperationalAnalytics(
    verifiedPayload({
      time_series: [
        { bucket_start: null, successful: 3, failed: 0 },
        { bucket_start: pgTimestamp("2026-08-09T00:00:00Z"), successful: 7, failed: 0 },
      ],
      recent_results: [
        {
          job_id: "job-broken",
          post_id: "post-broken",
          platform: "facebook",
          status: "succeeded",
          completed_at: "",
          attempt_count: 1,
        },
      ],
      data_freshness: { generated_at: "nonsense", latest_completed_at: null },
    }),
    FILTERS,
  );

  assert.equal(analytics.activitySeries.length, 1);
  assert.equal(analytics.recentResults.length, 0);
  assert.equal(analytics.freshness.latestCompletedAt, null);
  assert.ok(Number.isFinite(Date.parse(analytics.freshness.generatedAt)));
});

test("a malformed response fails loudly as an aggregation error", () => {
  assert.throws(
    () => normalizeOperationalAnalytics(null, FILTERS),
    (error: unknown) =>
      error instanceof AnalyticsServiceError && error.code === "aggregation_failure",
  );
});

test("getOperationalAnalytics forwards the workspace, range and platform filters", async () => {
  const calls: RecordedCall[] = [];
  const client = stubClient({ data: verifiedPayload() }, calls);
  const filters = { ...FILTERS, platform: "facebook" as const };

  const analytics = await getOperationalAnalytics(filters, {
    getClient: client.getClient,
    loadRecentMedia: noMedia,
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    name: "get_operational_analytics",
    args: {
      p_workspace_id: FILTERS.workspaceId,
      p_start_at: FILTERS.startAt,
      p_end_at: FILTERS.endAt,
      p_platform: "facebook",
      p_timezone: "UTC",
    },
  });
  assert.equal(analytics.scope.platform, "facebook");
  assert.equal(analytics.scope.workspaceId, FILTERS.workspaceId);
});

test("a result never matches a different workspace, range or platform", () => {
  const analytics = normalizeOperationalAnalytics(verifiedPayload(), FILTERS);

  assert.equal(analyticsMatchesFilters(analytics, FILTERS), true);
  assert.equal(
    analyticsMatchesFilters(analytics, { ...FILTERS, workspaceId: OTHER_WORKSPACE_ID }),
    false,
  );
  assert.equal(
    analyticsMatchesFilters(analytics, { ...FILTERS, startAt: "2026-08-03T00:00:00.000Z" }),
    false,
  );
  assert.equal(
    analyticsMatchesFilters(analytics, { ...FILTERS, platform: "facebook" }),
    false,
  );
  assert.equal(analyticsMatchesFilters(analytics, null), false);
  assert.equal(analyticsMatchesFilters(null, FILTERS), false);
});

test("a Supabase query failure rejects with a mapped analytics error", async () => {
  const client = stubClient({
    error: { code: "42P01", message: 'relation "publishing_jobs" does not exist' },
  });

  await assert.rejects(
    getOperationalAnalytics(FILTERS, { getClient: client.getClient, loadRecentMedia: noMedia }),
    (error: unknown) =>
      error instanceof AnalyticsServiceError && error.code === "aggregation_failure",
  );
});

test("a missing RPC is reported as a deployment problem, not a generic failure", async () => {
  const client = stubClient({
    error: {
      code: "PGRST202",
      message: "Could not find the function public.get_operational_analytics",
    },
  });

  await assert.rejects(
    getOperationalAnalytics(FILTERS, { getClient: client.getClient, loadRecentMedia: noMedia }),
    (error: unknown) =>
      error instanceof AnalyticsServiceError && error.code === "analytics_unavailable",
  );
});

test("an unconfigured Supabase client is reported instead of hanging", async () => {
  await assert.rejects(
    getOperationalAnalytics(FILTERS, { getClient: () => null, loadRecentMedia: noMedia }),
    (error: unknown) =>
      error instanceof AnalyticsServiceError && error.code === "workspace_unavailable",
  );
});

test("invalid filters are rejected before any request is made", async () => {
  const calls: RecordedCall[] = [];
  const client = stubClient({ data: verifiedPayload() }, calls);

  await assert.rejects(
    getOperationalAnalytics(
      { ...FILTERS, endAt: FILTERS.startAt },
      { getClient: client.getClient, loadRecentMedia: noMedia },
    ),
    (error: unknown) =>
      error instanceof AnalyticsServiceError && error.code === "invalid_date_range",
  );
  await assert.rejects(
    getOperationalAnalytics(
      { ...FILTERS, workspaceId: "" },
      { getClient: client.getClient, loadRecentMedia: noMedia },
    ),
    (error: unknown) =>
      error instanceof AnalyticsServiceError && error.code === "workspace_unavailable",
  );
  await assert.rejects(
    getOperationalAnalytics(
      { ...FILTERS, endAt: "2028-01-01T00:00:00.000Z" },
      { getClient: client.getClient, loadRecentMedia: noMedia },
    ),
    (error: unknown) =>
      error instanceof AnalyticsServiceError && error.code === "range_too_large",
  );
  assert.equal(calls.length, 0);
});

test("a failing media preview never fails the operational result", async () => {
  const client = stubClient({ data: verifiedPayload() });

  const analytics = await getOperationalAnalytics(FILTERS, {
    getClient: client.getClient,
    loadRecentMedia: () => Promise.reject(new Error("signed url unavailable")),
  });

  assert.equal(analytics.publishing.total, 13);
  assert.equal(analytics.recentResults[0].media, null);
});
