import type { SocialPlatform } from "./common";
import type { MediaItem, MediaType } from "./media";
import type { PublishingJobStatus } from "./publishing";

export type AnalyticsComparisonDirection = "up" | "down" | "flat";

export interface AnalyticsDateRange {
  startAt: string;
  endAt: string;
  startDate: string;
  endDate: string;
  timezone: string;
}

export interface AnalyticsComparison {
  current: number;
  previous: number;
  percentage: number | null;
  direction: AnalyticsComparisonDirection;
}

export interface AnalyticsMetric {
  value: number;
  comparison: AnalyticsComparison;
}

export interface OperationalTimeSeriesPoint {
  bucketStart: string;
  label: string;
  value: number;
}

export interface AnalyticsPlatformResult {
  platform: SocialPlatform;
  succeeded: number;
  failed: number;
  reconciliationRequired: number;
  cancelled: number;
  total: number;
}

export type AnalyticsContentType = MediaType | "text";

export interface AnalyticsContentTypeResult {
  type: AnalyticsContentType;
  posts: number;
}

export interface AnalyticsWeekdayResult {
  dayIndex: number;
  label: string;
  jobs: number;
}

export interface PublishingHealthSummary {
  /** Completed destination jobs: successful + failed + reconciliationRequired + cancelled. */
  total: number;
  successful: number;
  failed: number;
  reconciliationRequired: number;
  active: number;
  cancelled: number;
  successRate: number | null;
  retryCount: number;
  failureAttemptCount: number;
  averageDelaySeconds: number | null;
  medianDelaySeconds: number | null;
  onTimeCount: number;
  scheduledSucceededCount: number;
  consistencyRate: number | null;
}

export interface AnalyticsRecentPublishingResult {
  jobId: string;
  postId: string;
  caption: string;
  platform: SocialPlatform;
  socialAccountId: string;
  accountName: string;
  accountUsername: string;
  status: Extract<
    PublishingJobStatus,
    "succeeded" | "failed" | "reconciliation_required"
  >;
  completedAt: string;
  providerPermalink: string | null;
  attemptCount: number;
  media: MediaItem | null;
}

export interface AnalyticsDataFreshness {
  generatedAt: string;
  latestCompletedAt: string | null;
}

export interface OperationalAnalytics {
  scope: {
    workspaceId: string;
    platform: SocialPlatform | null;
  };
  range: AnalyticsDateRange;
  comparisonRange: AnalyticsDateRange;
  bucketKind: "day" | "week";
  totalPosts: AnalyticsMetric;
  publishing: PublishingHealthSummary;
  platforms: AnalyticsPlatformResult[];
  contentTypes: AnalyticsContentTypeResult[];
  activitySeries: OperationalTimeSeriesPoint[];
  failureSeries: OperationalTimeSeriesPoint[];
  weekdayActivity: AnalyticsWeekdayResult[];
  recentResults: AnalyticsRecentPublishingResult[];
  freshness: AnalyticsDataFreshness;
}

export interface OperationalAnalyticsFilters {
  workspaceId: string;
  startAt: string;
  endAt: string;
  platform: SocialPlatform | null;
  timezone: string;
}

export type AnalyticsFilters = OperationalAnalyticsFilters;
export type AnalyticsTimeSeriesPoint = OperationalTimeSeriesPoint;

/**
 * Mutually exclusive render states for the analytics page. Every request outcome
 * maps to exactly one of these, so a finished request can never leave a skeleton
 * on screen.
 */
export type AnalyticsViewState =
  | { kind: "no-workspace" }
  | { kind: "invalid-filters" }
  | { kind: "loading" }
  | { kind: "error"; error: AnalyticsViewError }
  | { kind: "empty"; data: OperationalAnalytics }
  | { kind: "ready"; data: OperationalAnalytics };

export interface AnalyticsViewError {
  message: string;
}

export interface AnalyticsViewStateInput {
  workspaceLoading: boolean;
  workspaceId: string | null;
  loading: boolean;
  error: AnalyticsViewError | null;
  analytics: OperationalAnalytics | null;
  filters: OperationalAnalyticsFilters | null;
}

export interface MetricSummary {
  totalPosts: number;
  totalReach: number;
  totalEngagement: number;
  linkClicks: number;
  followersGained: number;
  bestPlatform: SocialPlatform;
  publishingConsistency: number; // 0-100 %
}

export interface TimeSeriesPoint {
  label: string; // e.g. "Mon" or "Aug 1"
  reach: number;
  engagement: number;
}

export interface PlatformBreakdown {
  platform: SocialPlatform;
  posts: number;
  reach: number;
  engagement: number;
}

export interface ContentTypeBreakdown {
  type: MediaType;
  posts: number;
}

export interface DayEngagement {
  day: string; // "Mon" ... "Sun"
  engagement: number;
}

export interface AnalyticsData {
  summary: MetricSummary;
  timeSeries: TimeSeriesPoint[];
  byPlatform: PlatformBreakdown[];
  byContentType: ContentTypeBreakdown[];
  byDay: DayEngagement[];
  publishing: {
    successful: number;
    failed: number;
  };
  bestPostId: string;
}

export type MockNotification = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  read: boolean;
  type: "approval" | "publish" | "failed" | "team" | "system";
};

export type ActivityLog = {
  id: string;
  actor: string;
  action: string;
  target: string;
  createdAt: string;
  type: "create" | "approve" | "publish" | "schedule" | "comment" | "connect";
};

export interface Workspace {
  id: string;
  name: string;
  industry: string;
  plan: "Starter" | "Growth" | "Agency";
  colorToken: string;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarColor: string;
}
