import assert from "node:assert/strict";
import test from "node:test";
import { AnalyticsServiceError } from "@/lib/analytics-errors";
import {
  getOperationalAnalytics,
  normalizeOperationalAnalytics,
  resolveAnalyticsViewState,
} from "@/lib/services/analytics-service";
import type {
  AnalyticsViewState,
  OperationalAnalytics,
  OperationalAnalyticsFilters,
} from "@/types/analytics";
import {
  emptyPayload,
  FILTERS,
  OTHER_WORKSPACE_ID,
  stubClient,
  verifiedPayload,
} from "./support/analytics-fixtures.ts";

const noMedia = () => Promise.resolve(null);

const BASE = {
  workspaceLoading: false,
  workspaceId: FILTERS.workspaceId,
  loading: false,
  error: null as AnalyticsServiceError | null,
  analytics: null as OperationalAnalytics | null,
  filters: FILTERS as OperationalAnalyticsFilters | null,
};

/**
 * Mirrors the page's state transitions around a single request, so the tests
 * exercise the same sequence the component runs through.
 */
async function runRequestLifecycle(
  dependencies: Parameters<typeof getOperationalAnalytics>[1],
  filters: OperationalAnalyticsFilters = FILTERS,
) {
  const states: AnalyticsViewState[] = [];
  let loading = false;
  let error: AnalyticsServiceError | null = null;
  let analytics: OperationalAnalytics | null = null;

  const snapshot = () =>
    states.push(
      resolveAnalyticsViewState({
        ...BASE,
        workspaceId: filters.workspaceId,
        loading,
        error,
        analytics,
        filters,
      }),
    );

  snapshot();
  analytics = null;
  error = null;
  loading = true;
  snapshot();
  try {
    analytics = await getOperationalAnalytics(filters, dependencies);
  } catch (caught) {
    error = caught as AnalyticsServiceError;
  } finally {
    loading = false;
  }
  snapshot();

  return { states, final: states[states.length - 1] };
}

test("no workspace resolves to an empty state, not a skeleton", () => {
  assert.deepEqual(
    resolveAnalyticsViewState({ ...BASE, workspaceId: null }),
    { kind: "no-workspace" },
  );
  assert.deepEqual(
    resolveAnalyticsViewState({ ...BASE, workspaceId: null, workspaceLoading: true }),
    { kind: "loading" },
  );
});

test("the skeleton only shows while a request is genuinely outstanding", () => {
  assert.equal(resolveAnalyticsViewState({ ...BASE, loading: true }).kind, "loading");
  assert.equal(
    resolveAnalyticsViewState({ ...BASE, workspaceLoading: true }).kind,
    "loading",
  );
});

test("an unresolvable date range never renders a skeleton", () => {
  assert.deepEqual(
    resolveAnalyticsViewState({ ...BASE, filters: null }),
    { kind: "invalid-filters" },
  );
});

test("an error wins over every other state", () => {
  const error = new AnalyticsServiceError("network_failure", "Offline.");
  const analytics = normalizeOperationalAnalytics(verifiedPayload(), FILTERS);

  assert.deepEqual(resolveAnalyticsViewState({ ...BASE, error, loading: true }), {
    kind: "error",
    error,
  });
  assert.deepEqual(resolveAnalyticsViewState({ ...BASE, error, analytics }), {
    kind: "error",
    error,
  });
});

test("loaded data with activity resolves to ready", () => {
  const analytics = normalizeOperationalAnalytics(verifiedPayload(), FILTERS);
  const state = resolveAnalyticsViewState({ ...BASE, analytics });

  assert.equal(state.kind, "ready");
  assert.equal(state.kind === "ready" && state.data.publishing.total, 13);
});

test("a loaded but empty period resolves to empty, not loading", () => {
  const analytics = normalizeOperationalAnalytics(emptyPayload(), FILTERS);
  const state = resolveAnalyticsViewState({ ...BASE, analytics });

  assert.equal(state.kind, "empty");
});

test("data from another workspace is never rendered for the active one", () => {
  const foreign = normalizeOperationalAnalytics(verifiedPayload(), {
    ...FILTERS,
    workspaceId: OTHER_WORKSPACE_ID,
  });

  assert.equal(foreign.scope.workspaceId, OTHER_WORKSPACE_ID);
  assert.equal(resolveAnalyticsViewState({ ...BASE, analytics: foreign }).kind, "loading");
  assert.equal(
    resolveAnalyticsViewState({
      ...BASE,
      workspaceId: OTHER_WORKSPACE_ID,
      filters: { ...FILTERS, workspaceId: OTHER_WORKSPACE_ID },
      analytics: foreign,
    }).kind,
    "ready",
  );
});

test("a result for a different date range is not shown against the new range", () => {
  const analytics = normalizeOperationalAnalytics(verifiedPayload(), FILTERS);
  const widened: OperationalAnalyticsFilters = {
    ...FILTERS,
    startAt: "2026-05-12T00:00:00.000Z",
  };

  assert.equal(resolveAnalyticsViewState({ ...BASE, analytics }).kind, "ready");
  assert.equal(
    resolveAnalyticsViewState({ ...BASE, analytics, filters: widened }).kind,
    "loading",
  );
});

test("a result for a different platform filter is not shown", () => {
  const analytics = normalizeOperationalAnalytics(verifiedPayload(), FILTERS);
  const facebookOnly: OperationalAnalyticsFilters = { ...FILTERS, platform: "facebook" };

  assert.equal(
    resolveAnalyticsViewState({ ...BASE, analytics, filters: facebookOnly }).kind,
    "loading",
  );

  const facebookAnalytics = normalizeOperationalAnalytics(verifiedPayload(), facebookOnly);
  assert.equal(
    resolveAnalyticsViewState({ ...BASE, analytics: facebookAnalytics, filters: facebookOnly })
      .kind,
    "ready",
  );
});

test("the loading state resolves after a successful request", async () => {
  const client = stubClient({ data: verifiedPayload() });
  const { states, final } = await runRequestLifecycle({
    getClient: client.getClient,
    loadRecentMedia: noMedia,
  });

  assert.deepEqual(states.map((state) => state.kind), ["loading", "loading", "ready"]);
  assert.equal(final.kind === "ready" && final.data.publishing.total, 13);
});

test("the loading state resolves after a request that returns nothing", async () => {
  const client = stubClient({ data: emptyPayload() });
  const { final } = await runRequestLifecycle({
    getClient: client.getClient,
    loadRecentMedia: noMedia,
  });

  assert.equal(final.kind, "empty");
});

test("the loading state resolves to an actionable error after a failure", async () => {
  const client = stubClient({
    error: { code: "42501", message: "ANALYTICS_WORKSPACE_DENIED" },
  });
  const { states, final } = await runRequestLifecycle({
    getClient: client.getClient,
    loadRecentMedia: noMedia,
  });

  assert.deepEqual(states.map((state) => state.kind), ["loading", "loading", "error"]);
  assert.equal(final.kind === "error" && final.error.message.length > 0, true);
  assert.equal(
    final.kind === "error" &&
      final.error instanceof AnalyticsServiceError &&
      final.error.code,
    "permission_denied",
  );
});

test("the loading state resolves even when the network is unreachable", async () => {
  const { final } = await runRequestLifecycle({
    getClient: () => ({
      rpc: () => Promise.reject(new TypeError("Failed to fetch")),
    }),
    loadRecentMedia: noMedia,
  });

  assert.equal(final.kind, "error");
  assert.equal(
    final.kind === "error" &&
      final.error instanceof AnalyticsServiceError &&
      final.error.code,
    "network_failure",
  );
});
