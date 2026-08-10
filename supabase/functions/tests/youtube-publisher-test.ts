import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { encryptToken } from "../_shared/token-crypto.ts";
import { PublishingError } from "../_shared/publishing/errors.ts";
import { youtubeAccessToken } from "../_shared/publishing/publisher.ts";
import { publishYouTubeStep } from "../_shared/publishing/youtube-publisher.ts";
import type {
  ClaimedPublishingMessage,
  PublishingAccount,
  PublishingJob,
} from "../_shared/publishing/types.ts";

const youtubeAccount: PublishingAccount = {
  id: "youtube-account-1",
  workspaceId: "workspace-1",
  platform: "youtube",
  accountType: "youtube_channel",
  platformAccountId: "channel-1",
  parentPageId: null,
  connectionStatus: "connected",
  tokenExpiresAt: null,
  grantedScopes: ["https://www.googleapis.com/auth/youtube.upload"],
};

function youtubeJob(): PublishingJob {
  return {
    id: "job-1",
    workspace_id: "workspace-1",
    post_id: "post-1",
    post_revision: 1,
    social_account_id: youtubeAccount.id,
    platform: "youtube",
    operation: "youtube_video",
    status: "processing",
    attempt_count: 1,
    max_attempts: 5,
    provider_container_id: null,
    provider_post_id: null,
    safe_error_code: null,
    payload_snapshot: {
      version: 1,
      postId: "post-1",
      postRevision: 1,
      workspaceId: "workspace-1",
      platform: "youtube",
      socialAccountId: youtubeAccount.id,
      caption: "Description",
      platformTitle: "Video title",
      platformSettings: { privacyStatus: "private" },
      scheduledFor: new Date().toISOString(),
      media: [{
        mediaAssetId: "media-1",
        storageBucket: "postflow-media",
        storagePath: "workspace-1/video.mp4",
        mimeType: "video/mp4",
        mediaType: "video",
        fileSize: 10,
        width: 1920,
        height: 1080,
        durationSeconds: 30,
      }],
    },
  };
}

function videoResponse(): Response {
  return new Response(new Uint8Array(10), {
    status: 200,
    headers: { "content-length": "10", "content-type": "video/mp4" },
  });
}

Deno.test("YouTube resumable upload persists its session before successful creation", async () => {
  let sessionSaved = "";
  const fetcher = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://media.test")) return Promise.resolve(videoResponse());
    if (url.startsWith("https://www.googleapis.com") && !url.includes("upload_id=")) {
      return Promise.resolve(new Response(null, {
        status: 200,
        headers: { location: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=safe" },
      }));
    }
    assertEquals(init?.method, "PUT");
    return Promise.resolve(Response.json({ id: "youtube-video-1" }));
  }) as typeof fetch;
  const result = await publishYouTubeStep(
    youtubeJob(),
    youtubeAccount,
    "access-token",
    "https://media.test/video",
    null,
    null,
    (session) => {
      sessionSaved = session;
      return Promise.resolve();
    },
    () => Promise.resolve(),
    fetcher,
  );
  assertEquals(sessionSaved.includes("upload_id=safe"), true);
  assertEquals(result.status, "succeeded");
  assertEquals(result.providerPostId, "youtube-video-1");
});

Deno.test("existing resumable session prevents duplicate initiation", async () => {
  let initiationCount = 0;
  let requestCount = 0;
  const fetcher = ((input: string | URL | Request) => {
    requestCount += 1;
    const url = String(input);
    if (url.startsWith("https://media.test")) return Promise.resolve(videoResponse());
    if (url.startsWith("https://www.googleapis.com/upload")) {
      return Promise.resolve(Response.json({ id: "already-created" }));
    }
    initiationCount += 1;
    return Promise.resolve(new Response(null, { status: 500 }));
  }) as typeof fetch;
  const result = await publishYouTubeStep(
    youtubeJob(), youtubeAccount, "access-token", "https://media.test/video",
    "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=existing",
    null, () => Promise.resolve(), () => Promise.resolve(), fetcher,
  );
  assertEquals(result.providerPostId, "already-created");
  assertEquals(initiationCount, 0);
  assertEquals(requestCount, 2);
});

Deno.test("recorded YouTube completion prevents a duplicate provider request", async () => {
  let requestCount = 0;
  const result = await publishYouTubeStep(
    youtubeJob(),
    youtubeAccount,
    "access-token",
    "https://media.test/video",
    "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=existing",
    "already-recorded",
    () => Promise.resolve(),
    () => Promise.resolve(),
    (() => {
      requestCount += 1;
      return Promise.reject(new Error("provider should not be called"));
    }) as typeof fetch,
  );
  assertEquals(result.providerPostId, "already-recorded");
  assertEquals(requestCount, 0);
});

Deno.test("YouTube provider rejection is mapped to a safe publishing error", async () => {
  const fetcher = ((input: string | URL | Request) => {
    if (String(input).startsWith("https://media.test")) return Promise.resolve(videoResponse());
    return Promise.resolve(Response.json({
      error: { errors: [{ reason: "uploadLimitExceeded" }] },
    }, { status: 400 }));
  }) as typeof fetch;
  const error = await assertRejects(() => publishYouTubeStep(
    youtubeJob(), youtubeAccount, "access-token", "https://media.test/video",
    null, null, () => Promise.resolve(), () => Promise.resolve(), fetcher,
  ), PublishingError);
  assertEquals(error.code, "YOUTUBE_PROVIDER_REJECTED");
  assertEquals(error.message.includes("uploadLimitExceeded"), false);
});

Deno.test("expired YouTube access token is refreshed and encrypted server-side", async () => {
  Deno.env.set("SOCIAL_TOKEN_ENCRYPTION_KEY", btoa("0123456789abcdef0123456789abcdef"));
  Deno.env.set("YOUTUBE_CLIENT_ID", "client-id");
  Deno.env.set("YOUTUBE_CLIENT_SECRET", "client-secret");
  Deno.env.set("YOUTUBE_OAUTH_REDIRECT_URI", "https://app.test/functions/v1/youtube-oauth-callback");
  Deno.env.set("POSTFLOW_APP_URL", "https://app.test");
  Deno.env.set("ALLOWED_APP_ORIGINS", "https://app.test");
  const access = await encryptToken("expired-access");
  const refresh = await encryptToken("refresh-token");
  let updated = false;
  const client = {
    rpc: (name: string) => {
      assertEquals(name, "update_youtube_publishing_credential");
      updated = true;
      return Promise.resolve({ data: null, error: null });
    },
  } as unknown as SupabaseClient;
  const claim: ClaimedPublishingMessage = {
    messageId: 1,
    attemptNumber: 1,
    job: youtubeJob(),
    account: youtubeAccount,
    credential: {
      encryptedAccessToken: access.ciphertext,
      accessTokenIv: access.iv,
      encryptedRefreshToken: refresh.ciphertext,
      refreshTokenIv: refresh.iv,
      tokenType: "Bearer",
      expiresAt: "2000-01-01T00:00:00Z",
      grantedScopes: youtubeAccount.grantedScopes,
    },
    youtubeUploadSessionUrl: null,
    youtubeCompletedVideoId: null,
  };
  const token = await youtubeAccessToken(client, claim, (() => Promise.resolve(
    Response.json({
      access_token: "fresh-access",
      expires_in: 3600,
      token_type: "Bearer",
    }),
  )) as typeof fetch);
  assertEquals(token, "fresh-access");
  assertEquals(updated, true);
});
