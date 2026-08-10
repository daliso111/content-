import { PublishingError } from "./errors.ts";
import type {
  PublishingAccount,
  PublishingJob,
  PublishingStepResult,
  SnapshotMedia,
} from "./types.ts";

type Fetcher = typeof fetch;
type PersistSession = (sessionUrl: string) => Promise<void>;
type PersistCompletion = (providerVideoId: string) => Promise<void>;

const SESSION_HOSTS = new Set([
  "www.googleapis.com",
  "upload.youtube.com",
  "www.youtube.com",
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return record(await response.json().catch(() => ({})));
}

function providerError(response: Response): PublishingError {
  const retryable = response.status === 429 || response.status >= 500;
  const code = response.status === 401 || response.status === 403
    ? "YOUTUBE_ACCOUNT_REAUTH_REQUIRED"
    : response.status === 429
    ? "PROVIDER_RATE_LIMIT"
    : retryable
    ? "YOUTUBE_UPLOAD_FAILED"
    : "YOUTUBE_PROVIDER_REJECTED";
  return new PublishingError(
    code,
    code === "YOUTUBE_ACCOUNT_REAUTH_REQUIRED"
      ? "Reconnect the YouTube channel before publishing."
      : retryable
      ? "YouTube could not accept the upload yet."
      : "YouTube rejected the video publication.",
    retryable,
    false,
    response.status,
  );
}

export function isAllowedYouTubeUploadSession(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && SESSION_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function uploadOffset(response: Response): number {
  const range = response.headers.get("range");
  const match = range?.match(/^bytes=0-(\d+)$/i);
  return match ? Number(match[1]) + 1 : 0;
}

function youtubeSettings(job: PublishingJob): {
  title: string;
  description: string;
  privacyStatus: "private" | "unlisted" | "public";
  media: SnapshotMedia;
} {
  if (job.operation !== "youtube_video" || job.platform !== "youtube") {
    throw new PublishingError(
      "UNSUPPORTED_OPERATION",
      "The YouTube publishing operation is invalid.",
    );
  }
  const title = job.payload_snapshot.platformTitle?.trim() ?? "";
  const privacy = job.payload_snapshot.platformSettings.privacyStatus;
  const media = job.payload_snapshot.media[0];
  if (!title || title.length > 100) {
    throw new PublishingError(
      "YOUTUBE_TITLE_REQUIRED",
      "A valid YouTube title is required.",
    );
  }
  if (
    job.payload_snapshot.media.length !== 1 || !media ||
    media.mediaType !== "video"
  ) {
    throw new PublishingError(
      "YOUTUBE_VIDEO_REQUIRED",
      "YouTube publishing requires exactly one video.",
    );
  }
  if (!['private', 'unlisted', 'public'].includes(String(privacy))) {
    throw new PublishingError(
      "YOUTUBE_PROVIDER_REJECTED",
      "The YouTube privacy status is invalid.",
    );
  }
  return {
    title,
    description: job.payload_snapshot.caption.slice(0, 5000),
    privacyStatus: privacy as "private" | "unlisted" | "public",
    media,
  };
}

async function openMedia(
  mediaUrl: string,
  media: SnapshotMedia,
  offset: number,
  fetcher: Fetcher,
): Promise<{ body: ReadableStream<Uint8Array>; total: number; remaining: number }> {
  let response: Response;
  try {
    response = await fetcher(mediaUrl, {
      headers: offset > 0 ? { Range: `bytes=${offset}-` } : undefined,
    });
  } catch {
    throw new PublishingError(
      "MEDIA_URL_CREATION_FAILED",
      "The stored video could not be read.",
      true,
    );
  }
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    throw new PublishingError(
      "MEDIA_NOT_FOUND",
      "The stored video is no longer available.",
    );
  }
  if (offset > 0 && response.status !== 206) {
    await response.body.cancel().catch(() => undefined);
    throw new PublishingError(
      "YOUTUBE_UPLOAD_FAILED",
      "The stored video could not resume from the confirmed offset.",
      true,
    );
  }
  const contentLength = Number(response.headers.get("content-length"));
  const total = media.fileSize && media.fileSize > 0
    ? media.fileSize
    : Number.isFinite(contentLength) && contentLength > 0
    ? offset + contentLength
    : 0;
  if (!total || offset >= total) {
    await response.body.cancel().catch(() => undefined);
    throw new PublishingError(
      "YOUTUBE_UPLOAD_FAILED",
      "The stored video size is unavailable.",
      true,
    );
  }
  return { body: response.body, total, remaining: total - offset };
}

async function startSession(
  accessToken: string,
  settings: ReturnType<typeof youtubeSettings>,
  total: number,
  fetcher: Fetcher,
): Promise<string> {
  const url = new URL("https://www.googleapis.com/upload/youtube/v3/videos");
  url.search = new URLSearchParams({
    uploadType: "resumable",
    part: "snippet,status",
  }).toString();
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(total),
        "X-Upload-Content-Type": settings.media.mimeType,
      },
      body: JSON.stringify({
        snippet: { title: settings.title, description: settings.description },
        status: { privacyStatus: settings.privacyStatus },
      }),
    });
  } catch {
    throw new PublishingError(
      "YOUTUBE_UPLOAD_FAILED",
      "YouTube could not start the resumable upload.",
      true,
    );
  }
  if (!response.ok) {
    await json(response);
    throw providerError(response);
  }
  const sessionUrl = response.headers.get("location") ?? "";
  if (!isAllowedYouTubeUploadSession(sessionUrl)) {
    throw new PublishingError(
      "YOUTUBE_UPLOAD_FAILED",
      "YouTube returned an invalid upload session.",
      true,
    );
  }
  return sessionUrl;
}

async function completedResult(
  response: Response,
  persistCompletion: PersistCompletion,
): Promise<PublishingStepResult> {
  const id = text((await json(response)).id);
  if (!id) {
    throw new PublishingError(
      "YOUTUBE_UPLOAD_FAILED",
      "YouTube returned an invalid publication result.",
      true,
    );
  }
  await persistCompletion(id);
  return {
    status: "succeeded",
    phase: "youtube_upload_completed",
    providerPostId: id,
    providerPermalink: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
    httpStatus: response.status,
    retryable: false,
  };
}

async function probeSession(
  sessionUrl: string,
  accessToken: string,
  total: number,
  fetcher: Fetcher,
  persistCompletion: PersistCompletion,
): Promise<{ offset: number } | { complete: PublishingStepResult } | { expired: true }> {
  let response: Response;
  try {
    response = await fetcher(sessionUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Length": "0",
        "Content-Range": `bytes */${total}`,
      },
    });
  } catch {
    throw new PublishingError(
      "YOUTUBE_UPLOAD_FAILED",
      "The YouTube upload status could not be checked.",
      true,
    );
  }
  if (response.status === 200 || response.status === 201) {
    return { complete: await completedResult(response, persistCompletion) };
  }
  if (response.status === 308) return { offset: uploadOffset(response) };
  if (response.status === 404 || response.status === 410) return { expired: true };
  await json(response);
  throw providerError(response);
}

export async function publishYouTubeStep(
  job: PublishingJob,
  _account: PublishingAccount,
  accessToken: string,
  mediaUrl: string | undefined,
  existingSessionUrl: string | null,
  completedVideoId: string | null,
  persistSession: PersistSession,
  persistCompletion: PersistCompletion,
  fetcher: Fetcher = fetch,
): Promise<PublishingStepResult> {
  const settings = youtubeSettings(job);
  if (completedVideoId && /^[A-Za-z0-9_-]{1,128}$/.test(completedVideoId)) {
    return {
      status: "succeeded",
      phase: "youtube_upload_completed",
      providerPostId: completedVideoId,
      providerPermalink: `https://www.youtube.com/watch?v=${encodeURIComponent(completedVideoId)}`,
      retryable: false,
    };
  }
  if (!mediaUrl) {
    throw new PublishingError(
      "YOUTUBE_VIDEO_REQUIRED",
      "YouTube publishing requires one stored video.",
    );
  }

  let offset = 0;
  let sessionUrl = existingSessionUrl && isAllowedYouTubeUploadSession(existingSessionUrl)
    ? existingSessionUrl
    : null;
  let mediaResponse = await openMedia(mediaUrl, settings.media, 0, fetcher);
  const total = mediaResponse.total;

  if (sessionUrl) {
    await mediaResponse.body.cancel().catch(() => undefined);
    const probe = await probeSession(
      sessionUrl,
      accessToken,
      total,
      fetcher,
      persistCompletion,
    );
    if ("complete" in probe) return probe.complete;
    if ("expired" in probe) sessionUrl = null;
    else offset = probe.offset;
    mediaResponse = await openMedia(mediaUrl, settings.media, offset, fetcher);
  }
  if (!sessionUrl) {
    sessionUrl = await startSession(accessToken, settings, total, fetcher);
    await persistSession(sessionUrl);
  }

  let response: Response;
  try {
    response = await fetcher(sessionUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": settings.media.mimeType,
        "Content-Length": String(mediaResponse.remaining),
        "Content-Range": `bytes ${offset}-${total - 1}/${total}`,
      },
      body: mediaResponse.body,
    });
  } catch {
    throw new PublishingError(
      "YOUTUBE_UPLOAD_FAILED",
      "The resumable YouTube upload was interrupted and will be checked again.",
      true,
    );
  }
  if (response.status === 200 || response.status === 201) {
    return completedResult(response, persistCompletion);
  }
  if (response.status === 308) {
    return {
      status: "waiting_provider",
      phase: "youtube_upload_incomplete",
      delaySeconds: 5,
      httpStatus: response.status,
      errorCode: "YOUTUBE_UPLOAD_PENDING",
      safeMessage: "YouTube is still receiving the video.",
      retryable: true,
    };
  }
  await json(response);
  throw providerError(response);
}
