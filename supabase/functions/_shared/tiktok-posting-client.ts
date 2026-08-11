import { PublishingError } from "./publishing/errors.ts";

type Fetcher = typeof fetch;

export interface TikTokCreatorInfo {
  creatorUsername: string | null;
  creatorNickname: string | null;
  creatorAvatarUrl: string | null;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number;
}

export interface TikTokVideoPostInput {
  title: string;
  privacyLevel: string;
  disableComment: boolean;
  disableDuet: boolean;
  disableStitch: boolean;
  brandContentToggle: boolean;
  brandOrganicToggle: boolean;
  videoUrl: string;
}

export interface TikTokPublishStatus {
  status:
    | "PROCESSING_DOWNLOAD"
    | "PROCESSING_UPLOAD"
    | "PUBLISH_COMPLETE"
    | "FAILED";
  failReason: string | null;
  publicPostIds: string[];
  requestId?: string;
}

interface TikTokPostResponse {
  data: Record<string, unknown>;
  errorCode: string | null;
  requestId?: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function providerCode(value: unknown): string | null {
  const valueText = text(value);
  return valueText && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(valueText)
    ? valueText
    : null;
}

function providerRequestId(value: unknown): string | null {
  const valueText = text(value);
  return valueText && /^[A-Za-z0-9._:-]{1,160}$/.test(valueText)
    ? valueText
    : null;
}

export function isValidTikTokPublishId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= 64;
}

const PROVIDER_ERROR_MAPPINGS: Record<
  string,
  { code: string; message: string; retryable?: boolean }
> = {
  access_token_invalid: {
    code: "TIKTOK_ACCOUNT_REAUTH_REQUIRED",
    message: "Reconnect TikTok before publishing.",
  },
  scope_not_authorized: {
    code: "TIKTOK_PUBLISH_PERMISSION_REQUIRED",
    message: "Reconnect TikTok and grant publishing permission.",
  },
  unaudited_client_can_only_post_to_private_accounts: {
    code: "TIKTOK_PRIVATE_ACCOUNT_REQUIRED",
    message:
      "During TikTok development testing, the connected TikTok account must be private.",
  },
  url_ownership_unverified: {
    code: "TIKTOK_MEDIA_DOMAIN_UNVERIFIED",
    message:
      "TikTok cannot import this video until the media domain or URL prefix is verified.",
  },
  privacy_level_option_mismatch: {
    code: "TIKTOK_PRIVACY_INVALID",
    message: "The selected TikTok privacy option is no longer available.",
  },
  spam_risk_too_many_posts: {
    code: "TIKTOK_POST_LIMIT_REACHED",
    message: "TikTok's posting limit has been reached. Try again later.",
  },
  reached_active_user_cap: {
    code: "TIKTOK_ACTIVE_USER_LIMIT_REACHED",
    message: "This TikTok API client has reached its active-user limit.",
  },
  spam_risk_user_banned_from_posting: {
    code: "TIKTOK_POSTING_RESTRICTED",
    message: "TikTok has restricted this account from posting.",
  },
  rate_limit_exceeded: {
    code: "TIKTOK_RATE_LIMITED",
    message:
      "TikTok is rate limiting publishing requests. PostFlow will retry safely.",
    retryable: true,
  },
  invalid_param: {
    code: "TIKTOK_REQUEST_INVALID",
    message: "TikTok rejected the publishing request settings.",
  },
  invalid_publish_id: {
    code: "TIKTOK_PUBLISH_ID_INVALID",
    message: "TikTok no longer recognizes this publishing operation.",
  },
  internal_error: {
    code: "TIKTOK_PROVIDER_UNAVAILABLE",
    message: "TikTok could not process the publishing request yet.",
    retryable: true,
  },
};

function providerError(
  response: Response,
  payload: Record<string, unknown>,
): PublishingError {
  const error = record(payload.error);
  const providerErrorCode = providerCode(error.code);
  const requestId = providerRequestId(error.log_id) ?? undefined;
  const mapped = providerErrorCode
    ? PROVIDER_ERROR_MAPPINGS[providerErrorCode]
    : undefined;
  const retryable = mapped?.retryable === true || response.status === 429 ||
    response.status >= 500;
  const safeCode = mapped?.code ??
    (response.status === 429
      ? "TIKTOK_RATE_LIMITED"
      : response.status >= 500
      ? "TIKTOK_PROVIDER_UNAVAILABLE"
      : "TIKTOK_PROVIDER_REJECTED");
  const message = mapped?.message ??
    (retryable
      ? "TikTok could not process the publishing request yet."
      : "TikTok rejected the publishing request.");
  return new PublishingError(
    safeCode,
    message,
    retryable,
    false,
    response.status,
    requestId,
  );
}

async function post(
  endpoint: "creator_info/query" | "video/init" | "status/fetch",
  accessToken: string,
  body: Record<string, unknown>,
  fetcher: Fetcher,
): Promise<TikTokPostResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let response: Response;
  try {
    response = await fetcher(
      `https://open.tiktokapis.com/v2/post/publish/${endpoint}/`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
  } catch {
    throw new PublishingError(
      "TIKTOK_NETWORK_TIMEOUT",
      "TikTok did not confirm the publishing request.",
      true,
      endpoint === "video/init",
    );
  } finally {
    clearTimeout(timeout);
  }
  const payload = record(await response.json().catch(() => ({})));
  const providerErrorPayload = record(payload.error);
  const errorCode = typeof providerErrorPayload.code === "string"
    ? providerErrorPayload.code
    : null;
  if (!response.ok || (errorCode && errorCode !== "ok")) {
    throw providerError(response, payload);
  }
  return {
    data: record(payload.data),
    errorCode,
    requestId: providerRequestId(providerErrorPayload.log_id) ?? undefined,
  };
}

export async function queryCreatorInfo(
  accessToken: string,
  fetcher: Fetcher = fetch,
): Promise<TikTokCreatorInfo> {
  const { data } = await post("creator_info/query", accessToken, {}, fetcher);
  const privacy = Array.isArray(data.privacy_level_options)
    ? data.privacy_level_options.filter((value): value is string =>
      typeof value === "string" && value.length > 0
    )
    : [];
  const maxDuration = Number(data.max_video_post_duration_sec);
  if (!privacy.length || !Number.isFinite(maxDuration) || maxDuration <= 0) {
    throw new PublishingError(
      "TIKTOK_CREATOR_INFO_INVALID",
      "TikTok returned incomplete creator publishing settings.",
      true,
    );
  }
  return {
    creatorUsername: text(data.creator_username),
    creatorNickname: text(data.creator_nickname),
    creatorAvatarUrl: text(data.creator_avatar_url),
    privacyLevelOptions: [...new Set(privacy)],
    commentDisabled: data.comment_disabled === true,
    duetDisabled: data.duet_disabled === true,
    stitchDisabled: data.stitch_disabled === true,
    maxVideoPostDurationSec: maxDuration,
  };
}

export async function initializeVideoPost(
  accessToken: string,
  input: TikTokVideoPostInput,
  fetcher: Fetcher = fetch,
): Promise<{ publishId: string; requestId?: string }> {
  const response = await post("video/init", accessToken, {
    post_info: {
      title: input.title,
      privacy_level: input.privacyLevel,
      disable_comment: input.disableComment,
      disable_duet: input.disableDuet,
      disable_stitch: input.disableStitch,
      brand_content_toggle: input.brandContentToggle,
      brand_organic_toggle: input.brandOrganicToggle,
    },
    source_info: { source: "PULL_FROM_URL", video_url: input.videoUrl },
  }, fetcher);
  if (response.errorCode !== "ok") {
    throw new PublishingError(
      "TIKTOK_INIT_RESPONSE_INVALID",
      "TikTok returned an invalid publishing response.",
      false,
      true,
      undefined,
      response.requestId,
    );
  }
  const publishId = response.data.publish_id;
  if (!isValidTikTokPublishId(publishId)) {
    throw new PublishingError(
      "TIKTOK_INIT_RESPONSE_INVALID",
      "TikTok returned an invalid publishing identifier.",
      false,
      true,
      undefined,
      response.requestId,
    );
  }
  return { publishId, requestId: response.requestId };
}

export async function fetchPublishStatus(
  accessToken: string,
  publishId: string,
  fetcher: Fetcher = fetch,
): Promise<TikTokPublishStatus> {
  if (!isValidTikTokPublishId(publishId)) {
    throw new PublishingError(
      "TIKTOK_PUBLISH_ID_INVALID",
      "TikTok publishing state contains an invalid identifier.",
    );
  }
  const response = await post("status/fetch", accessToken, {
    publish_id: publishId,
  }, fetcher);
  const { data } = response;
  const status = text(data.status);
  if (
    !status ||
    !["PROCESSING_DOWNLOAD", "PROCESSING_UPLOAD", "PUBLISH_COMPLETE", "FAILED"]
      .includes(status)
  ) {
    throw new PublishingError(
      "TIKTOK_STATUS_INVALID",
      "TikTok returned an unknown publishing status.",
      true,
    );
  }
  const rawPostIds = Array.isArray(data.publicaly_available_post_id)
    ? data.publicaly_available_post_id
    : [];
  return {
    status: status as TikTokPublishStatus["status"],
    failReason: providerCode(data.fail_reason),
    publicPostIds: rawPostIds.filter((value): value is string =>
      typeof value === "string" && value.length > 0
    ),
    requestId: response.requestId,
  };
}
