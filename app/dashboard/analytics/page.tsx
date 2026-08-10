"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Award,
  Ban,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Info,
  Percent,
  RefreshCw,
  Send,
  XCircle,
} from "lucide-react";
import { AreaChart, BarChart, GaugeDonut, HorizontalBars } from "@/components/analytics/Charts";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { MediaThumbnail } from "@/components/media/MediaThumbnail";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { Skeleton } from "@/components/ui/Skeleton";
import { useWorkspace } from "@/hooks/useWorkspace";
import { AnalyticsServiceError, mapAnalyticsError } from "@/lib/analytics-errors";
import { MEDIA_TYPE_META, PLATFORMS } from "@/lib/constants";
import {
  getCustomAnalyticsRange,
  getDefaultAnalyticsRange,
  getOperationalAnalytics,
  resolveAnalyticsViewState,
} from "@/lib/services/analytics-service";
import { formatInWorkspaceTime, isValidTimeZone } from "@/lib/timezone";
import { formatNumber } from "@/lib/utils";
import type {
  AnalyticsContentType,
  OperationalAnalytics,
  OperationalAnalyticsFilters,
} from "@/types/analytics";
import type { SocialPlatform } from "@/types/common";

type RangePreset = "7" | "30" | "90" | "custom";

const RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "custom", label: "Custom range" },
];

const BASE_PLATFORM_OPTIONS: SocialPlatform[] = ["facebook", "instagram"];

export default function AnalyticsPage() {
  const { activeWorkspace, loading: workspaceLoading } = useWorkspace();
  const workspaceTimezone = activeWorkspace?.timezone || "UTC";
  const timezoneValid = isValidTimeZone(workspaceTimezone);
  const timezone = timezoneValid ? workspaceTimezone : "UTC";
  const initialRange = useMemo(() => getDefaultAnalyticsRange(30, timezone), [timezone]);
  const [range, setRange] = useState<RangePreset>("30");
  const [platform, setPlatform] = useState<SocialPlatform | "all">("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [analytics, setAnalytics] = useState<OperationalAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AnalyticsServiceError | null>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    setCustomStart((current) => current || initialRange.startDate);
    setCustomEnd((current) => current || initialRange.endDate);
  }, [initialRange.endDate, initialRange.startDate]);

  const rangeSelection = useMemo(() => {
    try {
      return {
        value: range === "custom"
          ? getCustomAnalyticsRange(customStart, customEnd, timezone)
          : getDefaultAnalyticsRange(Number(range), timezone),
        error: null,
      };
    } catch (rangeError) {
      return {
        value: null,
        error: mapAnalyticsError(rangeError),
      };
    }
  }, [customEnd, customStart, range, timezone]);

  const filters = useMemo<OperationalAnalyticsFilters | null>(() => {
    if (!activeWorkspace || !timezoneValid || !rangeSelection.value) return null;
    return {
      workspaceId: activeWorkspace.id,
      startAt: rangeSelection.value.startAt,
      endAt: rangeSelection.value.endAt,
      platform: platform === "all" ? null : platform,
      timezone,
    };
  }, [activeWorkspace, platform, rangeSelection, timezone, timezoneValid]);

  const loadAnalytics = useCallback(async () => {
    if (!activeWorkspace) {
      setAnalytics(null);
      setError(null);
      setLoading(false);
      return;
    }

    const requestId = ++requestSequence.current;
    setAnalytics(null);
    setError(null);
    setLoading(true);
    try {
      if (!timezoneValid) {
        throw new AnalyticsServiceError(
          "invalid_timezone",
          "The active workspace has an invalid timezone. Update it in workspace settings.",
        );
      }
      if (!filters) throw rangeSelection.error ?? new AnalyticsServiceError(
        "invalid_date_range",
        "Choose a valid start and end date.",
      );
      const result = await getOperationalAnalytics(filters);
      if (requestSequence.current === requestId) setAnalytics(result);
    } catch (loadError) {
      if (requestSequence.current === requestId) {
        setError(mapAnalyticsError(loadError));
      }
    } finally {
      // Always leaves the loading state, so a failure surfaces the error banner
      // instead of an indefinite skeleton.
      if (requestSequence.current === requestId) setLoading(false);
    }
  }, [activeWorkspace, filters, rangeSelection.error, timezoneValid]);

  useEffect(() => {
    void loadAnalytics();
    return () => {
      // Invalidate the in-flight request so a late response cannot revive a
      // superseded filter combination.
      requestSequence.current += 1;
    };
  }, [loadAnalytics]);

  const viewState = resolveAnalyticsViewState({
    workspaceLoading,
    workspaceId: activeWorkspace?.id ?? null,
    loading,
    error,
    analytics,
    filters,
  });
  const loadedAnalytics = viewState.kind === "ready" || viewState.kind === "empty"
    ? viewState.data
    : null;

  const platformOptions = useMemo(() => {
    const values = new Set<SocialPlatform>(BASE_PLATFORM_OPTIONS);
    if (platform !== "all") values.add(platform);
    loadedAnalytics?.platforms.forEach((item) => values.add(item.platform));
    return [
      { value: "all", label: "All" },
      ...Array.from(values).map((value) => ({ value, label: PLATFORMS[value].label })),
    ];
  }, [platform, loadedAnalytics]);

  if (viewState.kind === "no-workspace") {
    return (
      <EmptyState
        icon={FileText}
        title="No active workspace"
        description="Join or create a workspace to view its operational analytics."
      />
    );
  }

  const customRangeInvalid = range === "custom" && !rangeSelection.value;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Operational publishing performance from PostFlow records."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect
              value={range}
              onChange={(value) => setRange(value as RangePreset)}
              options={RANGE_OPTIONS}
              label="Range"
            />
            <FilterSelect
              label="Platform"
              value={platform}
              onChange={(value) => setPlatform(value as SocialPlatform | "all")}
              options={platformOptions}
            />
            <FilterSelect
              label="Campaign"
              value="coming-soon"
              onChange={() => undefined}
              options={[{ value: "coming-soon", label: "Coming soon" }]}
              disabled
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadAnalytics()}
              loading={loading}
              disabled={customRangeInvalid}
              aria-label="Refresh analytics"
            >
              {!loading && <RefreshCw className="h-4 w-4" aria-hidden />}
              Refresh
            </Button>
          </div>
        }
      />

      {range === "custom" && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface-muted/40 p-4">
          <DateField label="Start date" value={customStart} onChange={setCustomStart} max={customEnd || undefined} />
          <DateField label="End date" value={customEnd} onChange={setCustomEnd} min={customStart || undefined} />
          <p className="pb-2 text-xs text-ink-muted">Calendar boundaries use {timezone}. Maximum range: one year.</p>
          {customRangeInvalid && <p className="w-full text-sm text-danger">{rangeSelection.error?.message ?? "Choose a valid start and end date."}</p>}
        </div>
      )}

      <div className="flex items-start gap-3 rounded-xl border border-info/20 bg-info-soft px-4 py-3 text-sm text-info">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          Connect platform insights to unlock reach, engagement and audience analytics. Operational publishing analytics below are based on PostFlow records.
        </p>
      </div>

      {viewState.kind === "error" && (
        <div className="flex flex-col gap-3 rounded-xl border border-danger/25 bg-danger-soft p-4 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
            <div>
              <p className="font-semibold text-danger">Analytics could not be loaded</p>
              <p className="mt-0.5 text-sm text-ink-muted">{viewState.error.message}</p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadAnalytics()}>
            Try again
          </Button>
        </div>
      )}

      {viewState.kind === "loading" && <AnalyticsSkeleton />}
      {loadedAnalytics && (
        <AnalyticsContent
          data={loadedAnalytics}
          timezone={timezone}
          isEmpty={viewState.kind === "empty"}
        />
      )}
    </div>
  );
}

function AnalyticsContent({
  data,
  timezone,
  isEmpty,
}: {
  data: OperationalAnalytics;
  timezone: string;
  isEmpty: boolean;
}) {
  const publishing = data.publishing;
  const delta = data.totalPosts.comparison.percentage;
  // Cancelled jobs are deliberately excluded from both sides of the ratio.
  const terminalTotal = publishing.successful + publishing.failed;
  const mostUsedPlatform = data.platforms[0]?.platform ?? null;
  const recent = data.recentResults[0] ?? null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
        <span>{data.range.startDate} to {data.range.endDate} · {timezone}</span>
        <span title={data.freshness.latestCompletedAt ? `Latest completed job: ${formatInWorkspaceTime(data.freshness.latestCompletedAt, timezone)}` : "No completed jobs in this period"}>
          Refreshed {formatInWorkspaceTime(data.freshness.generatedAt, timezone, "MMM d, h:mm a zzz")}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total publishing jobs"
          value={formatNumber(publishing.total)}
          icon={Send}
          tone="brand"
          hint={`${publishing.active} still active`}
        />
        <MetricCard label="Successful publications" value={formatNumber(publishing.successful)} icon={CheckCircle2} tone="success" hint="Confirmed by the provider" />
        <MetricCard label="Failed publications" value={formatNumber(publishing.failed)} icon={XCircle} tone="danger" hint={`${publishing.failureAttemptCount} failed attempts`} />
        <MetricCard label="Cancelled publications" value={formatNumber(publishing.cancelled)} icon={Ban} tone="neutral" hint="Not counted as success or failure" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Success rate"
          value={publishing.successRate === null ? "—" : `${publishing.successRate}%`}
          icon={Percent}
          tone="success"
          hint={terminalTotal === 0 ? "No succeeded or failed jobs yet" : `${publishing.successful} of ${terminalTotal} succeeded or failed`}
        />
        <MetricCard
          label="Total posts"
          value={formatNumber(data.totalPosts.value)}
          icon={FileText}
          tone="brand"
          delta={delta === null ? undefined : Math.round(delta * 10) / 10}
          hint={delta === null ? "No prior-period baseline" : "Compared with the preceding equal period"}
        />
        <MetricCard label="Needs reconciliation" value={formatNumber(publishing.reconciliationRequired)} icon={AlertTriangle} tone="warning" hint="Provider outcome unconfirmed" />
      </div>

      {isEmpty ? (
        <EmptyState
          icon={FileText}
          title="No operational activity in this period"
          description="Try a wider date range or select all platforms. Zero-result periods never substitute demo data."
        />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Publishing activity over time" description="Successful destination jobs by local period" />
              <CardBody>
                <AreaChart ariaLabel="Successful publishing jobs over time" data={data.activitySeries} color="rgb(22 163 74)" />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Publishing failures over time" description="Failed destination jobs by local period" />
              <CardBody>
                <AreaChart ariaLabel="Failed publishing jobs over time" data={data.failureSeries} color="rgb(220 38 38)" />
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Publishing results by platform" description="Completed destination outcomes in this period" />
              <CardBody>
                <HorizontalBars
                  ariaLabel="Completed publishing outcomes by platform"
                  data={data.platforms.map((item) => ({
                    label: PLATFORMS[item.platform].label,
                    value: item.total,
                    color: PLATFORMS[item.platform].color,
                    icon: <PlatformIcon platform={item.platform} size="sm" />,
                  }))}
                />
                {data.platforms.length > 0 && (
                  <div className="mt-5 grid gap-2 border-t border-border pt-4 sm:grid-cols-3">
                    {data.platforms.map((item) => (
                      <p key={item.platform} className="text-xs text-ink-muted">
                        <span className="font-semibold text-ink">{PLATFORMS[item.platform].label}:</span>{" "}
                        {item.succeeded} succeeded · {item.failed} failed · {item.cancelled} cancelled · {item.reconciliationRequired} review
                      </p>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Publishing success" description="Succeeded ÷ (succeeded + failed) · cancelled jobs excluded" />
              <CardBody className="flex flex-col items-center">
                <GaugeDonut value={publishing.successful} total={terminalTotal} label="Success rate" />
                <div className="mt-4 grid w-full grid-cols-2 gap-2 text-center sm:grid-cols-4">
                  <ResultCount label="Succeeded" value={publishing.successful} className="text-success" />
                  <ResultCount label="Failed" value={publishing.failed} className="text-danger" />
                  <ResultCount label="Cancelled" value={publishing.cancelled} className="text-ink-muted" />
                  <ResultCount label="Review" value={publishing.reconciliationRequired} className="text-warning" />
                </div>
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Posts by content type" description="A post may appear in more than one media type" />
              <CardBody>
                <HorizontalBars
                  ariaLabel="Posts by content type"
                  data={data.contentTypes.map((item) => ({
                    label: contentTypeLabel(item.type),
                    value: item.posts,
                  }))}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Publishing activity by day" description={`Successful completion weekday in ${timezone}`} />
              <CardBody>
                <BarChart ariaLabel="Successful jobs by weekday" data={data.weekdayActivity.map((item) => ({ label: item.label, value: item.jobs }))} color="rgb(37 99 235)" />
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <HighlightCard icon={Award} tone="brand" label="Most-used publishing platform">
              {mostUsedPlatform ? (
                <span className="flex items-center gap-2"><PlatformIcon platform={mostUsedPlatform} size="sm" />{PLATFORMS[mostUsedPlatform].label}</span>
              ) : "—"}
            </HighlightCard>
            <HighlightCard icon={Clock3} tone="warning" label="Average publishing delay">
              <span title={`Median: ${formatDelay(publishing.medianDelaySeconds)}. Retries: ${publishing.retryCount}.`}>
                {formatDelay(publishing.averageDelaySeconds)}
              </span>
              <p className="mt-1 text-xs font-normal text-ink-muted">Median {formatDelay(publishing.medianDelaySeconds)} · {publishing.retryCount} retries</p>
            </HighlightCard>
            <HighlightCard icon={CheckCircle2} tone="success" label="Publishing consistency">
              <span title="Succeeded scheduled jobs completed no more than five minutes after scheduled_for. Publish-now jobs are excluded.">
                {publishing.consistencyRate === null ? "—" : `${publishing.consistencyRate}%`}
              </span>
              <p className="mt-1 text-xs font-normal text-ink-muted">{publishing.onTimeCount} of {publishing.scheduledSucceededCount} scheduled successes within 5 min</p>
            </HighlightCard>
          </div>

          {recent && (
            <Card>
              <CardHeader title="Most recent publishing result" description="Latest real destination outcome in this period" />
              <CardBody>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  {recent.media ? (
                    <MediaThumbnail item={recent.media} className="h-24 w-24 shrink-0" />
                  ) : (
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-ink-subtle">
                      <FileText className="h-7 w-7" aria-hidden />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <PlatformIcon platform={recent.platform} size="sm" />
                      <span className="text-sm font-semibold text-ink">{recent.accountName}</span>
                      {recent.accountUsername && <span className="text-sm text-ink-muted">@{recent.accountUsername.replace(/^@/, "")}</span>}
                      <PublishingResultBadge status={recent.status} />
                    </div>
                    <p className="line-clamp-2 text-sm text-ink">{recent.caption || "Media-only post"}</p>
                    <p className="mt-2 text-xs text-ink-muted">
                      Completed {formatInWorkspaceTime(recent.completedAt, timezone)} · {recent.attemptCount} {recent.attemptCount === 1 ? "attempt" : "attempts"}
                    </p>
                  </div>
                  {recent.providerPermalink && (
                    <a href={recent.providerPermalink} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-brand-text hover:underline">
                      Open provider post <ExternalLink className="h-4 w-4" aria-hidden />
                    </a>
                  )}
                </div>
              </CardBody>
            </Card>
          )}
        </>
      )}
    </>
  );
}

function DateField({ label, value, onChange, min, max }: { label: string; value: string; onChange: (value: string) => void; min?: string; max?: string }) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-ink-muted">
      {label}
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-lg border border-border bg-surface px-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/25"
      />
    </label>
  );
}

function ResultCount({ label, value, className }: { label: string; value: number; className: string }) {
  return <div><p className={`text-lg font-bold ${className}`}>{value}</p><p className="text-xs text-ink-muted">{label}</p></div>;
}

function HighlightCard({ icon: Icon, tone, label, children }: { icon: typeof Award; tone: "brand" | "warning" | "success"; label: string; children: React.ReactNode }) {
  const toneClass = tone === "success" ? "bg-success-soft text-success" : tone === "warning" ? "bg-warning-soft text-warning" : "bg-brand-soft text-brand-text";
  return (
    <Card className="p-5">
      <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${toneClass}`}><Icon className="h-5 w-5" aria-hidden /></span>
      <p className="mt-3 text-sm text-ink-muted">{label}</p>
      <div className="mt-1 text-lg font-bold text-ink">{children}</div>
    </Card>
  );
}

function PublishingResultBadge({ status }: { status: "succeeded" | "failed" | "reconciliation_required" }) {
  if (status === "succeeded") return <Badge tone="success" dot>Succeeded</Badge>;
  if (status === "failed") return <Badge tone="danger" dot>Failed</Badge>;
  return <Badge tone="warning" dot>Needs reconciliation</Badge>;
}

function contentTypeLabel(type: AnalyticsContentType) {
  return type === "text" ? "Text only" : MEDIA_TYPE_META[type].label;
}

function formatDelay(seconds: number | null) {
  if (seconds === null) return "—";
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded < 60) return `${rounded}s`;
  if (rounded < 3600) return `${Math.round(rounded / 60)}m`;
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.round((rounded % 3600) / 60);
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading operational analytics">
      <span className="sr-only">Loading operational analytics</span>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-36 rounded-2xl" />)}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-2xl" /><Skeleton className="h-80 rounded-2xl" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-2xl lg:col-span-2" /><Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}
