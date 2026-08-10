import { getSupabaseClient } from "@/lib/supabase/client";
import { mapPublishingError } from "@/lib/publishing-errors";
import {
  ACTIVE_PUBLISHING_JOB_STATUSES,
  isActivePublishingJobStatus,
  isCurrentRevisionPublishingJob,
} from "@/types";
import type {
  PublishingAttempt,
  PublishingCounts,
  PublishingJob,
  PublishingJobView,
  PublishingSummary,
  SocialAccount,
} from "@/types";

function client() {
  const value = getSupabaseClient();
  if (!value) throw mapPublishingError(new Error("AUTH_REQUIRED"));
  return value;
}

async function rpc<T>(name: "request_publish_now" | "cancel_post_publication" | "retry_publishing_job", args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(name, args as never);
  if (error || data === null) throw mapPublishingError(error);
  return data as T;
}

export function requestPublishNow(postId: string, expectedRevision: number) {
  return rpc<{ postId: string; status: "queued"; jobIds: string[] }>("request_publish_now", { p_post_id: postId, p_expected_revision: expectedRevision });
}

export function cancelPublication(postId: string) {
  return rpc<{ postId: string; cancelledJobs: number; reconciliationRequired: number }>("cancel_post_publication", { p_post_id: postId });
}

export function retryPublishingJob(jobId: string) {
  return rpc<{ publishingJobId: string; status: "queued" }>("retry_publishing_job", { p_publishing_job_id: jobId });
}

export async function getPostPublishingJobs(postId: string): Promise<PublishingJobView[]> {
  const { data, error } = await client().from("publishing_jobs").select("*").eq("post_id", postId).order("created_at", { ascending: false });
  if (error) throw mapPublishingError(error);
  const jobs = data ?? [];
  const accountIds = [...new Set(jobs.map((job) => job.social_account_id))];
  const accountResult = accountIds.length
    ? await client().from("social_accounts").select("*").in("id", accountIds)
    : { data: [] as SocialAccount[], error: null };
  if (accountResult.error) throw mapPublishingError(accountResult.error);
  const accounts = new Map((accountResult.data ?? []).map((account) => [account.id, account]));
  return jobs.map((job) => ({ job, account: accounts.get(job.social_account_id) ?? null }));
}

export async function getPublishingAttempts(jobId: string): Promise<PublishingAttempt[]> {
  const { data, error } = await client().from("publishing_attempts").select("*").eq("publishing_job_id", jobId).order("attempt_number");
  if (error) throw mapPublishingError(error);
  return data ?? [];
}

export async function getPostCurrentRevision(postId: string): Promise<number | null> {
  const { data, error } = await client().from("posts").select("revision").eq("id", postId).maybeSingle();
  if (error) throw mapPublishingError(error);
  return data?.revision ?? null;
}

async function getCurrentPostRevisions(postIds: string[]): Promise<Map<string, number>> {
  if (postIds.length === 0) return new Map();
  const { data, error } = await client().from("posts").select("id,revision").in("id", postIds);
  if (error) throw mapPublishingError(error);
  return new Map((data ?? []).map((post) => [post.id, post.revision]));
}

export async function hasActivePublishingOperation(postId: string): Promise<boolean> {
  const currentRevision = await getPostCurrentRevision(postId);
  if (currentRevision === null) return false;
  const { count, error } = await client()
    .from("publishing_jobs")
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId)
    .eq("post_revision", currentRevision)
    .in("status", [...ACTIVE_PUBLISHING_JOB_STATUSES]);
  if (error) throw mapPublishingError(error);
  return (count ?? 0) > 0;
}

export async function getPublishingSummary(postId: string): Promise<PublishingSummary> {
  const [jobs, currentRevision] = await Promise.all([
    getPostPublishingJobs(postId),
    getPostCurrentRevision(postId),
  ]);
  const currentJobs = jobs.filter(({ job }) => isCurrentRevisionPublishingJob(job, currentRevision));
  return {
    postId,
    destinationCount: new Set(currentJobs.map(({ job }) => job.social_account_id)).size,
    jobs,
    reconciliationRequired: currentJobs.some(({ job }) => job.status === "reconciliation_required"),
    activeCount: currentJobs.filter(({ job }) => isActivePublishingJobStatus(job.status)).length,
    succeededCount: currentJobs.filter(({ job }) => job.status === "succeeded").length,
    failedCount: currentJobs.filter(({ job }) => job.status === "failed").length,
  };
}

export async function listRecentPublishingResults(workspaceId: string, limit = 10): Promise<PublishingJob[]> {
  const { data, error } = await client().from("publishing_jobs").select("*").eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(Math.min(50, Math.max(1, limit)));
  if (error) throw mapPublishingError(error);
  return data ?? [];
}

export async function getPublishingCounts(workspaceId: string): Promise<PublishingCounts> {
  const { data, error } = await client().from("publishing_jobs").select("post_id,post_revision,status").eq("workspace_id", workspaceId);
  if (error) throw mapPublishingError(error);
  const rows = data ?? [];
  const revisions = await getCurrentPostRevisions([...new Set(rows.map((row) => row.post_id))]);
  const currentRows = rows.filter((row) => row.post_revision === revisions.get(row.post_id));
  return {
    publishing: currentRows.filter((row) => isActivePublishingJobStatus(row.status)).length,
    failed: currentRows.filter((row) => row.status === "failed").length,
    reconciliationRequired: currentRows.filter((row) => row.status === "reconciliation_required").length,
  };
}
