import { PublishingError } from "./errors.ts";
import {
  formBody,
  graphVersion,
  metaRequest,
  responseId,
} from "./meta-publisher.ts";
import type {
  PublishingAccount,
  PublishingJob,
  PublishingStepResult,
} from "./types.ts";

export async function publishFacebookStep(
  job: PublishingJob,
  account: PublishingAccount,
  token: string,
  mediaUrl?: string,
  fetcher: typeof fetch = fetch,
): Promise<PublishingStepResult> {
  const snapshot = job.payload_snapshot;
  if (account.accountType !== "facebook_page") {
    throw new PublishingError(
      "ACCOUNT_TYPE_UNSUPPORTED",
      "A Facebook Page destination is required.",
    );
  }
  if (job.operation === "facebook_text") {
    const result = await metaRequest(
      `${account.platformAccountId}/feed`,
      token,
      {
        method: "POST",
        body: formBody({ message: snapshot.caption }),
        finalSubmission: true,
      },
      fetcher,
    );
    return {
      status: "succeeded",
      phase: "facebook_publish",
      providerPostId: responseId(result.body),
      requestId: result.requestId,
    };
  }
  if (job.operation === "facebook_image") {
    if (!mediaUrl) {
      throw new PublishingError(
        "MEDIA_NOT_FOUND",
        "The Facebook image is unavailable.",
      );
    }
    const result = await metaRequest(
      `${account.platformAccountId}/photos`,
      token,
      {
        method: "POST",
        body: formBody({ url: mediaUrl, caption: snapshot.caption }),
        finalSubmission: true,
      },
      fetcher,
    );
    return {
      status: "succeeded",
      phase: "facebook_publish",
      providerPostId: responseId(result.body, "post_id"),
      requestId: result.requestId,
    };
  }
  if (job.operation !== "facebook_reel" || !mediaUrl) {
    throw new PublishingError(
      "UNSUPPORTED_MEDIA_COMBINATION",
      "This Facebook media combination is not supported.",
    );
  }

  if (!job.provider_container_id) {
    const result = await metaRequest(
      `${account.platformAccountId}/video_reels`,
      token,
      {
        method: "POST",
        body: formBody({ upload_phase: "start" }),
      },
      fetcher,
    );
    return {
      status: "waiting_provider",
      phase: "facebook_reel_start",
      delaySeconds: 1,
      providerContainerId: responseId(result.body, "video_id"),
      errorCode: "FB_REEL_UPLOAD_PENDING",
    };
  }
  if (job.safe_error_code === "FB_REEL_UPLOAD_PENDING") {
    await metaRequest(
      `https://rupload.facebook.com/video-upload/${graphVersion()}/${job.provider_container_id}`,
      token,
      {
        method: "POST",
        headers: { file_url: mediaUrl },
      },
      fetcher,
    );
    return {
      status: "waiting_provider",
      phase: "facebook_reel_upload",
      delaySeconds: 1,
      providerContainerId: job.provider_container_id,
      errorCode: "FB_REEL_FINISH_PENDING",
    };
  }
  if (job.safe_error_code === "FB_REEL_FINISH_PENDING") {
    const result = await metaRequest(
      `${account.platformAccountId}/video_reels`,
      token,
      {
        method: "POST",
        body: formBody({
          upload_phase: "finish",
          video_id: job.provider_container_id,
          video_state: "PUBLISHED",
          description: snapshot.caption,
        }),
        finalSubmission: true,
      },
      fetcher,
    );
    return {
      status: "waiting_provider",
      phase: "facebook_reel_finish",
      delaySeconds: 30,
      providerContainerId: job.provider_container_id,
      errorCode: "FB_REEL_STATUS_PENDING",
      requestId: result.requestId,
    };
  }
  const result = await metaRequest(
    `${job.provider_container_id}?fields=status`,
    token,
    {},
    fetcher,
  );
  const status = result.body.status as Record<string, unknown> | undefined;
  const videoStatus = typeof status?.video_status === "string"
    ? status.video_status.toLowerCase()
    : "processing";
  if (["error", "failed"].includes(videoStatus)) {
    throw new PublishingError(
      "PROVIDER_PERMANENT_REJECTION",
      "Facebook could not process the Reel.",
    );
  }
  if (!["ready", "published", "complete"].includes(videoStatus)) {
    return {
      status: "waiting_provider",
      phase: "facebook_reel_poll",
      delaySeconds: 30,
      providerContainerId: job.provider_container_id,
      errorCode: "FB_REEL_STATUS_PENDING",
    };
  }
  return {
    status: "succeeded",
    phase: "facebook_reel_complete",
    providerContainerId: job.provider_container_id,
    providerPostId: job.provider_container_id,
  };
}
