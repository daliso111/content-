import {
  fetchPublishStatus,
  initializeVideoPost,
  queryCreatorInfo,
  type TikTokCreatorInfo,
} from "../tiktok-posting-client.ts";
import { allowedTikTokPrivacyLevels } from "../tiktok-direct-post-capabilities.ts";
import { PublishingError } from "./errors.ts";
import type {
  PublishingAccount,
  PublishingJob,
  PublishingStepResult,
  SnapshotMedia,
  TikTokPublishSession,
} from "./types.ts";

type Fetcher = typeof fetch;

export interface TikTokSessionActions {
  startSubmission(): Promise<void>;
  clearSubmissionStart(): Promise<void>;
  storePublishId(publishId: string): Promise<void>;
  recordStatus(status: string, failReason: string | null): Promise<void>;
}

interface TikTokSettings {
  privacyLevel: string;
  disableComment: boolean;
  disableDuet: boolean;
  disableStitch: boolean;
  brandContentToggle: boolean;
  brandOrganicToggle: boolean;
  media: SnapshotMedia;
  title: string;
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function settings(job: PublishingJob): TikTokSettings {
  const source = job.payload_snapshot.platformSettings;
  const media = job.payload_snapshot.media[0];
  const privacyLevel = typeof source.privacyLevel === "string"
    ? source.privacyLevel.trim()
    : "";
  const publishConsent = bool(source.publishConsent);
  const disableComment = bool(source.disableComment);
  const disableDuet = bool(source.disableDuet);
  const disableStitch = bool(source.disableStitch);
  const brandContentToggle = bool(source.brandContentToggle);
  const brandOrganicToggle = bool(source.brandOrganicToggle);
  if (job.platform !== "tiktok" || job.operation !== "tiktok_video") {
    throw new PublishingError(
      "UNSUPPORTED_OPERATION",
      "The TikTok publishing operation is invalid.",
    );
  }
  if (
    job.payload_snapshot.media.length !== 1 || !media ||
    media.mediaType !== "video" ||
    !["video/mp4", "video/quicktime", "video/webm"].includes(media.mimeType) ||
    !media.fileSize || media.fileSize <= 0 || media.fileSize > 52_428_800
  ) {
    throw new PublishingError(
      "TIKTOK_VIDEO_REQUIRED",
      "TikTok publishing requires exactly one supported video.",
    );
  }
  if (
    !privacyLevel || publishConsent !== true || disableComment === null ||
    disableDuet === null || disableStitch === null ||
    brandContentToggle === null || brandOrganicToggle === null
  ) {
    throw new PublishingError(
      "TIKTOK_SETTINGS_INVALID",
      "Complete the required TikTok publishing settings.",
    );
  }
  if (brandContentToggle && privacyLevel === "SELF_ONLY") {
    throw new PublishingError(
      "TIKTOK_PRIVACY_INVALID",
      "Branded TikTok content cannot use private visibility.",
    );
  }
  return {
    privacyLevel,
    disableComment,
    disableDuet,
    disableStitch,
    brandContentToggle,
    brandOrganicToggle,
    media,
    title: job.payload_snapshot.caption.slice(0, 2_200),
  };
}

function validateAgainstCreator(
  input: TikTokSettings,
  creator: TikTokCreatorInfo,
): void {
  if (
    !allowedTikTokPrivacyLevels(creator.privacyLevelOptions).includes(
      input.privacyLevel,
    )
  ) {
    throw new PublishingError(
      "TIKTOK_PRIVACY_INVALID",
      "The selected TikTok privacy option is no longer available.",
    );
  }
  if (!input.disableComment && creator.commentDisabled) {
    throw new PublishingError(
      "TIKTOK_INTERACTION_UNAVAILABLE",
      "Comments are not available for this TikTok creator.",
    );
  }
  if (!input.disableDuet && creator.duetDisabled) {
    throw new PublishingError(
      "TIKTOK_INTERACTION_UNAVAILABLE",
      "Duet is not available for this TikTok creator.",
    );
  }
  if (!input.disableStitch && creator.stitchDisabled) {
    throw new PublishingError(
      "TIKTOK_INTERACTION_UNAVAILABLE",
      "Stitch is not available for this TikTok creator.",
    );
  }
  if (
    input.media.durationSeconds &&
    input.media.durationSeconds > creator.maxVideoPostDurationSec
  ) {
    throw new PublishingError(
      "TIKTOK_VIDEO_TOO_LONG",
      `The video exceeds this TikTok creator's duration limit.`,
    );
  }
}

function pollDelay(pollCount: number): number {
  return [30, 60, 120, 300][Math.min(Math.max(pollCount, 0), 3)];
}

function failedStatus(failReason: string | null): PublishingError {
  const auth = failReason === "auth_removed";
  const safeCode = auth
    ? "TIKTOK_ACCOUNT_REAUTH_REQUIRED"
    : failReason === "video_pull_failed"
    ? "TIKTOK_VIDEO_PULL_FAILED"
    : failReason === "spam_risk_too_many_posts"
    ? "TIKTOK_POST_LIMIT_REACHED"
    : failReason === "reached_active_user_cap"
    ? "TIKTOK_ACTIVE_USER_LIMIT_REACHED"
    : failReason === "spam_risk_user_banned_from_posting" ||
        failReason === "spam_risk_too_many_pending_share"
    ? "TIKTOK_POSTING_RESTRICTED"
    : "TIKTOK_PROVIDER_REJECTED";
  return new PublishingError(
    safeCode,
    auth
      ? "Reconnect TikTok before publishing again."
      : failReason === "video_pull_failed"
      ? "TikTok could not download the stored video."
      : failReason === "spam_risk_too_many_posts"
      ? "TikTok's posting limit has been reached. Try again later."
      : failReason === "reached_active_user_cap"
      ? "This TikTok API client has reached its active-user limit."
      : failReason === "spam_risk_user_banned_from_posting" ||
          failReason === "spam_risk_too_many_pending_share"
      ? "TikTok has restricted this account from posting."
      : "TikTok could not publish this video.",
  );
}

export async function publishTikTokStep(
  job: PublishingJob,
  _account: PublishingAccount,
  accessToken: string,
  mediaUrl: string | undefined,
  session: TikTokPublishSession | null,
  actions: TikTokSessionActions,
  fetcher: Fetcher = fetch,
): Promise<PublishingStepResult> {
  const input = settings(job);
  const creator = await queryCreatorInfo(accessToken, fetcher);
  validateAgainstCreator(input, creator);

  if (session?.publishId) {
    const provider = await fetchPublishStatus(
      accessToken,
      session.publishId,
      fetcher,
    );
    await actions.recordStatus(provider.status, provider.failReason);
    if (provider.status === "PUBLISH_COMPLETE") {
      return {
        status: "succeeded",
        phase: "tiktok_publish_complete",
        providerContainerId: session.publishId,
        providerPostId: provider.publicPostIds[0] ?? session.publishId,
        requestId: provider.requestId,
        retryable: false,
      };
    }
    if (provider.status === "FAILED") throw failedStatus(provider.failReason);
    return {
      status: "waiting_provider",
      phase: "tiktok_processing",
      delaySeconds: pollDelay(session.pollCount),
      providerContainerId: session.publishId,
      errorCode: "TIKTOK_PROCESSING",
      safeMessage: "TikTok is processing the video.",
      requestId: provider.requestId,
      retryable: false,
    };
  }

  if (session?.submissionStartedAt) {
    throw new PublishingError(
      "AMBIGUOUS_PROVIDER_OUTCOME",
      "TikTok submission started, but its publishing identifier was not recorded.",
      false,
      true,
    );
  }
  if (!mediaUrl) {
    throw new PublishingError(
      "TIKTOK_VIDEO_REQUIRED",
      "TikTok publishing requires one stored video.",
    );
  }

  await actions.startSubmission();
  let initialized: { publishId: string; requestId?: string };
  try {
    initialized = await initializeVideoPost(accessToken, {
      title: input.title,
      privacyLevel: input.privacyLevel,
      disableComment: input.disableComment,
      disableDuet: input.disableDuet,
      disableStitch: input.disableStitch,
      brandContentToggle: input.brandContentToggle,
      brandOrganicToggle: input.brandOrganicToggle,
      videoUrl: mediaUrl,
    }, fetcher);
  } catch (error) {
    if (
      error instanceof PublishingError && error.retryable && !error.ambiguous
    ) {
      await actions.clearSubmissionStart();
    }
    throw error;
  }
  await actions.storePublishId(initialized.publishId).catch(() => {
    throw new PublishingError(
      "AMBIGUOUS_PROVIDER_OUTCOME",
      "TikTok accepted the video, but PostFlow could not record its publishing identifier.",
      false,
      true,
      undefined,
      initialized.requestId,
    );
  });
  return {
    status: "waiting_provider",
    phase: "tiktok_submission_initialized",
    delaySeconds: 30,
    providerContainerId: initialized.publishId,
    errorCode: "TIKTOK_PROCESSING",
    safeMessage: "TikTok accepted the video and is processing it.",
    requestId: initialized.requestId,
    retryable: false,
  };
}
