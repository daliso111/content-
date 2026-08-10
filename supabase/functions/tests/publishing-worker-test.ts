import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { publishFacebookStep } from "../_shared/publishing/facebook-publisher.ts";
import { publishInstagramStep } from "../_shared/publishing/instagram-publisher.ts";
import {
  errorResult,
  PublishingError,
  redactUrl,
} from "../_shared/publishing/errors.ts";
import { validateClaim } from "../_shared/publishing/job-state.ts";
import { retryDelay } from "../_shared/publishing/retry.ts";
import type {
  ClaimedPublishingMessage,
  PublishingAccount,
  PublishingJob,
} from "../_shared/publishing/types.ts";
import {
  authorizeWorker,
  constantTimeEqual,
  runWorker,
} from "../process-publishing-queue/worker.ts";

Deno.env.set("META_GRAPH_API_VERSION", "v99.0");
const account: PublishingAccount = {
  id: "account-1",
  workspaceId: "workspace-1",
  platform: "facebook",
  accountType: "facebook_page",
  platformAccountId: "page-1",
  parentPageId: null,
  connectionStatus: "connected",
  tokenExpiresAt: null,
  grantedScopes: [
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
  ],
};

function job(
  operation: PublishingJob["operation"],
  overrides: Partial<PublishingJob> = {},
): PublishingJob {
  const platform = operation.startsWith("instagram") ? "instagram" : "facebook";
  return {
    id: "job-1",
    workspace_id: "workspace-1",
    post_id: "post-1",
    post_revision: 1,
    social_account_id: "account-1",
    platform,
    operation,
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
      platform,
      socialAccountId: "account-1",
      caption: "Test post",
      platformSettings: {},
      scheduledFor: new Date().toISOString(),
      media: operation.endsWith("text") ? [] : [{
        mediaAssetId: "media-1",
        storageBucket: "postflow-media",
        storagePath: "workspace-1/media-1.jpg",
        mimeType: operation.endsWith("reel") ? "video/mp4" : "image/jpeg",
        mediaType: operation.endsWith("reel") ? "video" : "image",
        fileSize: 100,
        width: 1080,
        height: 1920,
        durationSeconds: operation.endsWith("reel") ? 15 : null,
      }],
    },
    ...overrides,
  };
}

function responseQueue(
  ...responses: Array<{ body: unknown; status?: number; headers?: HeadersInit }>
): typeof fetch {
  let index = 0;
  return (() => {
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return Promise.resolve(
      Response.json(response.body, {
        status: response.status ?? 200,
        headers: response.headers,
      }),
    );
  }) as typeof fetch;
}

Deno.test("worker secret rejects missing and invalid values", () => {
  assertThrows(() =>
    authorizeWorker(
      new Request("https://worker.test", { method: "POST" }),
      "secret",
    )
  );
  assertThrows(() =>
    authorizeWorker(
      new Request("https://worker.test", {
        method: "POST",
        headers: { "x-postflow-worker-secret": "wrong" },
      }),
      "secret",
    )
  );
  authorizeWorker(
    new Request("https://worker.test", {
      method: "POST",
      headers: { "x-postflow-worker-secret": "secret" },
    }),
    "secret",
  );
  assertEquals(constantTimeEqual("secret", "secret"), true);
  assertEquals(constantTimeEqual("secret", "different"), false);
});

Deno.test("empty queue produces zero safe counts", async () => {
  const client = {
    rpc: () => Promise.resolve({ data: [], error: null }),
  } as unknown as SupabaseClient;
  assertEquals(await runWorker(client, 5), {
    claimed: 0,
    succeeded: 0,
    requeued: 0,
    failed: 0,
    reconciliationRequired: 0,
  });
});

Deno.test("claim validation rejects missing account, credential, expiry, permissions and mismatch", () => {
  const base: ClaimedPublishingMessage = {
    messageId: 1,
    attemptNumber: 1,
    job: job("facebook_text"),
    account,
    credential: {
      encryptedAccessToken: "cipher",
      accessTokenIv: "iv",
      encryptedRefreshToken: null,
      refreshTokenIv: null,
      tokenType: "bearer",
      expiresAt: null,
      grantedScopes: account.grantedScopes,
    },
    youtubeUploadSessionUrl: null,
    youtubeCompletedVideoId: null,
  };
  assertThrows(() => validateClaim({ ...base, account: null }));
  assertThrows(() => validateClaim({ ...base, credential: null }));
  assertThrows(() =>
    validateClaim({
      ...base,
      credential: { ...base.credential!, expiresAt: "2000-01-01T00:00:00Z" },
    })
  );
  assertThrows(() =>
    validateClaim({
      ...base,
      credential: { ...base.credential!, grantedScopes: [] },
    })
  );
  assertThrows(() =>
    validateClaim({
      ...base,
      account: { ...account, workspaceId: "workspace-2" },
    })
  );
});

Deno.test("Facebook text and image publish", async () => {
  const textResult = await publishFacebookStep(
    job("facebook_text"),
    account,
    "token",
    undefined,
    responseQueue({ body: { id: "post-1" } }),
  );
  assertEquals(textResult.status, "succeeded");
  const imageResult = await publishFacebookStep(
    job("facebook_image"),
    account,
    "token",
    "https://media.test/image?signature=secret",
    responseQueue({ body: { post_id: "post-2" } }),
  );
  assertEquals(imageResult.providerPostId, "post-2");
});

Deno.test("Facebook Reel runs start, hosted upload, finish and poll", async () => {
  const start = await publishFacebookStep(
    job("facebook_reel"),
    account,
    "token",
    "https://media.test/video",
    responseQueue({ body: { video_id: "video-1" } }),
  );
  assertEquals(start.errorCode, "FB_REEL_UPLOAD_PENDING");
  const uploaded = await publishFacebookStep(
    job("facebook_reel", {
      provider_container_id: "video-1",
      safe_error_code: "FB_REEL_UPLOAD_PENDING",
    }),
    account,
    "token",
    "https://media.test/video",
    responseQueue({ body: { success: true } }),
  );
  assertEquals(uploaded.errorCode, "FB_REEL_FINISH_PENDING");
  const finished = await publishFacebookStep(
    job("facebook_reel", {
      provider_container_id: "video-1",
      safe_error_code: "FB_REEL_FINISH_PENDING",
    }),
    account,
    "token",
    "https://media.test/video",
    responseQueue({ body: { success: true } }),
  );
  assertEquals(finished.errorCode, "FB_REEL_STATUS_PENDING");
  const polled = await publishFacebookStep(
    job("facebook_reel", {
      provider_container_id: "video-1",
      safe_error_code: "FB_REEL_STATUS_PENDING",
    }),
    account,
    "token",
    "https://media.test/video",
    responseQueue({ body: { status: { video_status: "published" } } }),
  );
  assertEquals(polled.status, "succeeded");
});

Deno.test("Instagram image and Reel use container steps", async () => {
  const instagram = {
    ...account,
    platform: "instagram" as const,
    accountType: "instagram_business" as const,
  };
  const created = await publishInstagramStep(
    job("instagram_image"),
    instagram,
    "token",
    "https://media.test/image",
    responseQueue({ body: { id: "container-1" } }),
  );
  assertEquals(created.errorCode, "IG_CONTAINER_POLL");
  const waiting = await publishInstagramStep(
    job("instagram_reel", {
      provider_container_id: "container-1",
      safe_error_code: "IG_CONTAINER_POLL",
    }),
    instagram,
    "token",
    "https://media.test/video",
    responseQueue({ body: { status_code: "IN_PROGRESS" } }),
  );
  assertEquals(waiting.status, "waiting_provider");
  const ready = await publishInstagramStep(
    job("instagram_reel", {
      provider_container_id: "container-1",
      safe_error_code: "IG_CONTAINER_POLL",
    }),
    instagram,
    "token",
    "https://media.test/video",
    responseQueue({ body: { status_code: "FINISHED" } }),
  );
  assertEquals(ready.errorCode, "IG_CONTAINER_PUBLISH");
  const published = await publishInstagramStep(
    job("instagram_image", {
      provider_container_id: "container-1",
      safe_error_code: "IG_CONTAINER_PUBLISH",
    }),
    instagram,
    "token",
    "https://media.test/image",
    responseQueue({ body: { id: "ig-media-1" } }),
  );
  assertEquals(published.providerPostId, "ig-media-1");
});

Deno.test("Instagram container failure is permanent", async () => {
  const instagram = {
    ...account,
    platform: "instagram" as const,
    accountType: "instagram_creator" as const,
  };
  await assertRejects(
    () =>
      publishInstagramStep(
        job("instagram_reel", {
          provider_container_id: "container-1",
          safe_error_code: "IG_CONTAINER_POLL",
        }),
        instagram,
        "token",
        "https://media.test/video",
        responseQueue({ body: { status_code: "ERROR" } }),
      ),
    PublishingError,
  );
});

Deno.test("rate limit, provider 500 and network failures retry safely", () => {
  assertEquals(
    errorResult(
      new PublishingError(
        "PROVIDER_RATE_LIMIT",
        "Rate limited",
        true,
        false,
        429,
      ),
      1,
      5,
    ).status,
    "retry_wait",
  );
  assertEquals(
    errorResult(
      new PublishingError(
        "PROVIDER_TEMPORARY_ERROR",
        "Unavailable",
        true,
        false,
        500,
      ),
      2,
      5,
    ).status,
    "retry_wait",
  );
  assertEquals(
    errorResult(
      new PublishingError("PROVIDER_NETWORK_FAILURE", "Network", true),
      1,
      5,
    ).status,
    "retry_wait",
  );
});

Deno.test("provider HTTP 429 is retryable and unsupported Facebook media is rejected", async () => {
  await assertRejects(
    () =>
      publishFacebookStep(
        job("facebook_text"),
        account,
        "token",
        undefined,
        responseQueue({
          body: { error: { code: 4, message: "raw" } },
          status: 429,
        }),
      ),
    PublishingError,
  );
  await assertRejects(
    () => publishFacebookStep(job("facebook_image"), account, "token"),
    PublishingError,
  );
});

Deno.test("network failure before submission retries but final submission is ambiguous", async () => {
  const failingFetch =
    (() => Promise.reject(new Error("timeout"))) as typeof fetch;
  const before = await assertRejects(
    () =>
      publishFacebookStep(
        job("facebook_reel"),
        account,
        "token",
        "https://media.test/video",
        failingFetch,
      ),
    PublishingError,
  );
  const final = await assertRejects(
    () =>
      publishFacebookStep(
        job("facebook_text"),
        account,
        "token",
        undefined,
        failingFetch,
      ),
    PublishingError,
  );
  assertEquals(before.retryable, true);
  assertEquals(before.ambiguous, false);
  assertEquals(final.retryable, false);
  assertEquals(final.ambiguous, true);
});

Deno.test("ambiguous final timeout reconciles and exhausted retry fails", () => {
  assertEquals(
    errorResult(
      new PublishingError("AMBIGUOUS_PROVIDER_OUTCOME", "Unknown", false, true),
      1,
      5,
    ).status,
    "reconciliation_required",
  );
  const exhausted = errorResult(
    new PublishingError("PROVIDER_NETWORK_FAILURE", "Network", true),
    5,
    5,
  );
  assertEquals(exhausted.status, "failed");
  assertEquals(exhausted.errorCode, "RETRY_EXHAUSTED");
});

Deno.test("retry delay is bounded and URL query strings are redacted", () => {
  assertEquals(retryDelay(1, null, () => 0.5), 30);
  assertEquals(retryDelay(5, 2400, () => 0.5), 1800);
  assertEquals(
    redactUrl("failed https://media.test/file.jpg?token=secret"),
    "failed https://media.test/file.jpg",
  );
});
