import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { errorResult, PublishingError } from "../_shared/publishing/errors.ts";
import { retryDelay } from "../_shared/publishing/retry.ts";
import { processClaim } from "../_shared/publishing/publisher.ts";
import type {
  ClaimedPublishingMessage,
  PublishingStepResult,
} from "../_shared/publishing/types.ts";

export function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (a[index % Math.max(a.length, 1)] ?? 0) ^
      (b[index % Math.max(b.length, 1)] ?? 0);
  }
  return mismatch === 0;
}

export function authorizeWorker(
  request: Request,
  configuredSecret: string | undefined,
): void {
  const provided = request.headers.get("x-postflow-worker-secret") ?? "";
  if (!configuredSecret || !constantTimeEqual(provided, configuredSecret)) {
    throw new PublishingError(
      "WORKER_UNAUTHORIZED",
      "Worker authorization failed.",
    );
  }
}

export async function runWorker(
  client: SupabaseClient,
  batchSize: number,
): Promise<
  {
    claimed: number;
    succeeded: number;
    requeued: number;
    failed: number;
    reconciliationRequired: number;
  }
> {
  const { data, error } = await client.rpc("claim_publishing_queue_batch", {
    p_batch_size: batchSize,
    p_visibility_seconds: 600,
  });
  if (error) throw error;
  const claims = Array.isArray(data) ? data as ClaimedPublishingMessage[] : [];
  const counts = {
    claimed: claims.length,
    succeeded: 0,
    requeued: 0,
    failed: 0,
    reconciliationRequired: 0,
  };
  for (const claim of claims) {
    let result: PublishingStepResult;
    try {
      result = await processClaim(client, claim);
    } catch (claimError) {
      result = errorResult(
        claimError,
        claim.attemptNumber,
        claim.job.max_attempts,
      );
      if (result.status === "retry_wait") {
        result.delaySeconds = retryDelay(claim.attemptNumber);
      }
      if (
        claimError instanceof PublishingError &&
        [
          "TOKEN_EXPIRED",
          "ACCOUNT_DISCONNECTED",
          "MISSING_PERMISSION",
          "YOUTUBE_ACCOUNT_REAUTH_REQUIRED",
        ]
          .includes(claimError.code)
      ) {
        await client.rpc("mark_publishing_account_unusable", {
          p_social_account_id: claim.job.social_account_id,
          p_status: claimError.code === "TOKEN_EXPIRED"
            ? "expired"
            : "reconnect_required",
          p_error_code: claimError.code,
        });
      }
    }
    const { error: finishError } = await client.rpc("finish_publishing_step", {
      p_publishing_job_id: claim.job.id,
      p_message_id: claim.messageId,
      p_attempt_number: claim.attemptNumber,
      p_result: result,
    });
    if (finishError) throw finishError;
    if (result.status === "succeeded") counts.succeeded += 1;
    else if (
      result.status === "retry_wait" || result.status === "waiting_provider"
    ) counts.requeued += 1;
    else if (result.status === "reconciliation_required") {
      counts.reconciliationRequired += 1;
    } else counts.failed += 1;
  }
  return counts;
}
