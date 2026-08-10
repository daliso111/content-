import { PublishingError } from "./errors.ts";
import { formBody, metaRequest, responseId } from "./meta-publisher.ts";
import type {
  PublishingAccount,
  PublishingJob,
  PublishingStepResult,
} from "./types.ts";

export async function publishInstagramStep(
  job: PublishingJob,
  account: PublishingAccount,
  token: string,
  mediaUrl?: string,
  fetcher: typeof fetch = fetch,
): Promise<PublishingStepResult> {
  if (!mediaUrl) {
    throw new PublishingError(
      "MEDIA_NOT_FOUND",
      "Instagram requires one supported media file.",
    );
  }
  if (!account.accountType.startsWith("instagram_")) {
    throw new PublishingError(
      "ACCOUNT_TYPE_UNSUPPORTED",
      "An Instagram Professional destination is required.",
    );
  }
  if (!job.provider_container_id) {
    const isReel = job.operation === "instagram_reel";
    const result = await metaRequest(
      `${account.platformAccountId}/media`,
      token,
      {
        method: "POST",
        body: formBody(
          isReel
            ? {
              media_type: "REELS",
              video_url: mediaUrl,
              caption: job.payload_snapshot.caption,
            }
            : { image_url: mediaUrl, caption: job.payload_snapshot.caption },
        ),
      },
      fetcher,
    );
    return {
      status: "waiting_provider",
      phase: "instagram_container_create",
      delaySeconds: isReel ? 30 : 5,
      providerContainerId: responseId(result.body),
      errorCode: "IG_CONTAINER_POLL",
      requestId: result.requestId,
    };
  }
  if (job.safe_error_code === "IG_CONTAINER_PUBLISH") {
    const result = await metaRequest(
      `${account.platformAccountId}/media_publish`,
      token,
      {
        method: "POST",
        body: formBody({ creation_id: job.provider_container_id }),
        finalSubmission: true,
      },
      fetcher,
    );
    return {
      status: "succeeded",
      phase: "instagram_publish",
      providerContainerId: job.provider_container_id,
      providerPostId: responseId(result.body),
      requestId: result.requestId,
    };
  }
  const result = await metaRequest(
    `${job.provider_container_id}?fields=status_code,status`,
    token,
    {},
    fetcher,
  );
  const status = typeof result.body.status_code === "string"
    ? result.body.status_code.toUpperCase()
    : "IN_PROGRESS";
  if (status === "ERROR" || status === "EXPIRED") {
    throw new PublishingError(
      "PROVIDER_PERMANENT_REJECTION",
      "Instagram could not process the media container.",
    );
  }
  if (status !== "FINISHED") {
    return {
      status: "waiting_provider",
      phase: "instagram_container_poll",
      delaySeconds: 30,
      providerContainerId: job.provider_container_id,
      errorCode: "IG_CONTAINER_POLL",
    };
  }
  return {
    status: "waiting_provider",
    phase: "instagram_container_ready",
    delaySeconds: 1,
    providerContainerId: job.provider_container_id,
    errorCode: "IG_CONTAINER_PUBLISH",
  };
}
