import type { Enums, Tables } from "./database.generated";
import type { SocialAccount } from "./account";

export type PostDestination = Tables<"post_destinations">;
export type PublishingJob = Tables<"publishing_jobs">;
export type PublishingAttempt = Tables<"publishing_attempts">;
export type PublishingJobStatus = Enums<"publishing_job_status">;

export const ACTIVE_PUBLISHING_JOB_STATUSES = [
  "queued",
  "processing",
  "waiting_provider",
  "retry_wait",
] as const satisfies readonly PublishingJobStatus[];

export function isActivePublishingJobStatus(status: PublishingJobStatus): boolean {
  return ACTIVE_PUBLISHING_JOB_STATUSES.some((activeStatus) => activeStatus === status);
}

export function isCurrentRevisionPublishingJob(
  job: Pick<PublishingJob, "post_revision">,
  currentRevision: number | null,
): boolean {
  return currentRevision !== null && job.post_revision === currentRevision;
}

export interface PublishingJobView {
  job: PublishingJob;
  account: SocialAccount | null;
}

export interface PublishingSummary {
  postId: string;
  destinationCount: number;
  jobs: PublishingJobView[];
  reconciliationRequired: boolean;
  activeCount: number;
  succeededCount: number;
  failedCount: number;
}

export interface PublishingCounts {
  publishing: number;
  failed: number;
  reconciliationRequired: number;
}
