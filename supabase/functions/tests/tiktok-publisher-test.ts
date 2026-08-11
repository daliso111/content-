import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  fetchPublishStatus,
  initializeVideoPost,
  queryCreatorInfo,
} from "../_shared/tiktok-posting-client.ts";
import {
  allowedTikTokPrivacyLevels,
  resolveTikTokDirectPostMode,
} from "../_shared/tiktok-direct-post-capabilities.ts";
import { errorResult, PublishingError } from "../_shared/publishing/errors.ts";
import {
  publishTikTokStep,
  type TikTokSessionActions,
} from "../_shared/publishing/tiktok-publisher.ts";
import type {
  PublishingAccount,
  PublishingJob,
  TikTokPublishSession,
} from "../_shared/publishing/types.ts";

const account: PublishingAccount = {
  id: "tiktok-account-1",
  workspaceId: "workspace-1",
  platform: "tiktok",
  accountType: "tiktok_user",
  platformAccountId: "open-id-1",
  parentPageId: null,
  connectionStatus: "connected",
  tokenExpiresAt: null,
  grantedScopes: ["user.info.basic", "video.publish"],
};

function job(): PublishingJob {
  return {
    id: "job-1",
    workspace_id: "workspace-1",
    post_id: "post-1",
    post_revision: 1,
    social_account_id: account.id,
    platform: "tiktok",
    operation: "tiktok_video",
    status: "processing",
    attempt_count: 1,
    failure_count: 0,
    max_attempts: 5,
    provider_container_id: null,
    provider_post_id: null,
    safe_error_code: null,
    payload_snapshot: {
      version: 1,
      postId: "post-1",
      postRevision: 1,
      workspaceId: "workspace-1",
      platform: "tiktok",
      socialAccountId: account.id,
      caption: "TikTok caption",
      platformSettings: {
        privacyLevel: "SELF_ONLY",
        disableComment: true,
        disableDuet: true,
        disableStitch: true,
        brandContentToggle: false,
        brandOrganicToggle: false,
        publishConsent: true,
        creatorMaxVideoPostDurationSec: 180,
      },
      scheduledFor: new Date().toISOString(),
      media: [{
        mediaAssetId: "media-1",
        storageBucket: "postflow-media",
        storagePath: "workspace-1/video.mp4",
        mimeType: "video/mp4",
        mediaType: "video",
        fileSize: 1024,
        width: 1080,
        height: 1920,
        durationSeconds: 30,
      }],
    },
  };
}

function creatorResponse() {
  return Response.json({
    data: {
      creator_username: "towkn.creator",
      creator_nickname: "Towkn Creator",
      creator_avatar_url: "https://safe.example/avatar.jpg",
      privacy_level_options: ["SELF_ONLY", "PUBLIC_TO_EVERYONE"],
      comment_disabled: false,
      duet_disabled: false,
      stitch_disabled: false,
      max_video_post_duration_sec: 180,
    },
    error: { code: "ok" },
  });
}

function actions(log: string[]): TikTokSessionActions {
  return {
    startSubmission: () => {
      log.push("started");
      return Promise.resolve();
    },
    clearSubmissionStart: () => {
      log.push("cleared");
      return Promise.resolve();
    },
    storePublishId: (id) => {
      log.push(`stored:${id}`);
      return Promise.resolve();
    },
    recordStatus: (status) => {
      log.push(`status:${status}`);
      return Promise.resolve();
    },
  };
}

Deno.test("TikTok Creator Info returns only safe publishing fields", async () => {
  const creator = await queryCreatorInfo(
    "secret-access-token",
    (() => Promise.resolve(creatorResponse())) as typeof fetch,
  );
  assertEquals(creator.privacyLevelOptions, [
    "SELF_ONLY",
    "PUBLIC_TO_EVERYONE",
  ]);
  assertEquals(creator.maxVideoPostDurationSec, 180);
  assertEquals(JSON.stringify(creator).includes("secret-access-token"), false);
});

Deno.test("TikTok Content Posting errors map by provider code and retain safe log_id", async () => {
  const cases = [
    ["access_token_invalid", 401, "TIKTOK_ACCOUNT_REAUTH_REQUIRED", false],
    ["scope_not_authorized", 403, "TIKTOK_PUBLISH_PERMISSION_REQUIRED", false],
    [
      "unaudited_client_can_only_post_to_private_accounts",
      403,
      "TIKTOK_PRIVATE_ACCOUNT_REQUIRED",
      false,
    ],
    ["url_ownership_unverified", 403, "TIKTOK_MEDIA_DOMAIN_UNVERIFIED", false],
    ["privacy_level_option_mismatch", 403, "TIKTOK_PRIVACY_INVALID", false],
    ["spam_risk_too_many_posts", 403, "TIKTOK_POST_LIMIT_REACHED", false],
    ["reached_active_user_cap", 403, "TIKTOK_ACTIVE_USER_LIMIT_REACHED", false],
    [
      "spam_risk_user_banned_from_posting",
      403,
      "TIKTOK_POSTING_RESTRICTED",
      false,
    ],
    ["rate_limit_exceeded", 429, "TIKTOK_RATE_LIMITED", true],
    ["invalid_param", 400, "TIKTOK_REQUEST_INVALID", false],
  ] as const;

  for (const [providerCode, status, expectedCode, retryable] of cases) {
    const error = await assertRejects(
      () =>
        initializeVideoPost(
          "secret-access-token",
          {
            title: "Mapping test",
            privacyLevel: "SELF_ONLY",
            disableComment: true,
            disableDuet: true,
            disableStitch: true,
            brandContentToggle: false,
            brandOrganicToggle: false,
            videoUrl: "https://signed.example/secret-video-url",
          },
          (() =>
            Promise.resolve(
              Response.json({
                error: {
                  code: providerCode,
                  message: "raw sensitive provider description",
                  log_id: "provider-log-123",
                },
              }, { status }),
            )) as typeof fetch,
        ),
      PublishingError,
    );
    assertEquals(error.code, expectedCode);
    assertEquals(error.httpStatus, status);
    assertEquals(error.requestId, "provider-log-123");
    assertEquals(error.retryable, retryable);
    assertEquals(
      error.message.includes("raw sensitive provider description"),
      false,
    );
    assertEquals(error.message.includes("secret-video-url"), false);
    if (providerCode === "url_ownership_unverified") {
      assertEquals(
        error.message,
        "TikTok cannot import this video until the media domain or URL prefix is verified.",
      );
    }

    const result = errorResult(error, 1, 5);
    assertEquals(result.requestId, "provider-log-123");
  }
});

Deno.test("unknown TikTok 403 is a generic rejection, not reauthorization", async () => {
  const error = await assertRejects(
    () =>
      initializeVideoPost(
        "secret-access-token",
        {
          title: "Unknown error",
          privacyLevel: "SELF_ONLY",
          disableComment: true,
          disableDuet: true,
          disableStitch: true,
          brandContentToggle: false,
          brandOrganicToggle: false,
          videoUrl: "https://signed.example/video",
        },
        (() =>
          Promise.resolve(
            Response.json({
              error: {
                code: "future_unknown_error",
                message: "do not expose this",
                log_id: "provider-log-unknown",
              },
            }, { status: 403 }),
          )) as typeof fetch,
      ),
    PublishingError,
  );
  assertEquals(error.code, "TIKTOK_PROVIDER_REJECTED");
  assertEquals(error.code === "TIKTOK_ACCOUNT_REAUTH_REQUIRED", false);
  assertEquals(error.requestId, "provider-log-unknown");
});

Deno.test("unaudited TikTok 403 never claims account reauthorization", async () => {
  const error = await assertRejects(
    () =>
      queryCreatorInfo(
        "secret-access-token",
        (() =>
          Promise.resolve(
            Response.json({
              error: {
                code: "unaudited_client_can_only_post_to_private_accounts",
                message: "provider detail",
                log_id: "provider-log-private",
              },
            }, { status: 403 }),
          )) as typeof fetch,
      ),
    PublishingError,
  );
  assertEquals(error.code, "TIKTOK_PRIVATE_ACCOUNT_REQUIRED");
  assertEquals(
    error.message,
    "During TikTok development testing, the connected TikTok account must be private.",
  );
  assertEquals(error.code === "TIKTOK_ACCOUNT_REAUTH_REQUIRED", false);
});

Deno.test("TikTok publish_id accepts documented opaque provider strings", async () => {
  const accepted = [
    "p_pub_url~v2.123456789",
    "v_pub_url~v2.123456789",
    "123456789",
    "abc.DEF-ghi_123~xyz",
    " opaque-id ",
    "a".repeat(64),
  ];
  for (const publishId of accepted) {
    const initialized = await initializeVideoPost(
      "access-token",
      {
        title: "Opaque identifier",
        privacyLevel: "SELF_ONLY",
        disableComment: true,
        disableDuet: true,
        disableStitch: true,
        brandContentToggle: false,
        brandOrganicToggle: false,
        videoUrl: "https://storage.example/video.mp4",
      },
      (() =>
        Promise.resolve(
          Response.json({
            data: { publish_id: publishId },
            error: { code: "ok", log_id: "provider-log-success" },
          }),
        )) as typeof fetch,
    );
    assertEquals(initialized.publishId, publishId);
    assertEquals(initialized.requestId, "provider-log-success");
  }
});

Deno.test("TikTok publish_id rejects empty, oversized, and non-string values", async () => {
  for (const publishId of ["", " \t\r\n ", "a".repeat(65), 123456789]) {
    const error = await assertRejects(
      () =>
        initializeVideoPost(
          "access-token",
          {
            title: "Invalid identifier",
            privacyLevel: "SELF_ONLY",
            disableComment: true,
            disableDuet: true,
            disableStitch: true,
            brandContentToggle: false,
            brandOrganicToggle: false,
            videoUrl: "https://storage.example/video.mp4",
          },
          (() =>
            Promise.resolve(
              Response.json({
                data: { publish_id: publishId },
                error: { code: "ok", log_id: "provider-log-invalid-id" },
              }),
            )) as typeof fetch,
        ),
      PublishingError,
    );
    assertEquals(error.code, "TIKTOK_INIT_RESPONSE_INVALID");
    assertEquals(error.ambiguous, true);
    assertEquals(error.requestId, "provider-log-invalid-id");
  }
});

Deno.test("TikTok initialization requires error.code ok", async () => {
  const providerError = await assertRejects(
    () =>
      initializeVideoPost(
        "access-token",
        {
          title: "Provider rejection",
          privacyLevel: "SELF_ONLY",
          disableComment: true,
          disableDuet: true,
          disableStitch: true,
          brandContentToggle: false,
          brandOrganicToggle: false,
          videoUrl: "https://storage.example/video.mp4",
        },
        (() =>
          Promise.resolve(
            Response.json({
              data: { publish_id: "p_pub_url~v2.123456789" },
              error: { code: "invalid_param", log_id: "provider-log-error" },
            }),
          )) as typeof fetch,
      ),
    PublishingError,
  );
  assertEquals(providerError.code, "TIKTOK_REQUEST_INVALID");
  assertEquals(providerError.requestId, "provider-log-error");

  const missingContract = await assertRejects(
    () =>
      initializeVideoPost(
        "access-token",
        {
          title: "Missing success contract",
          privacyLevel: "SELF_ONLY",
          disableComment: true,
          disableDuet: true,
          disableStitch: true,
          brandContentToggle: false,
          brandOrganicToggle: false,
          videoUrl: "https://storage.example/video.mp4",
        },
        (() =>
          Promise.resolve(
            Response.json({
              data: { publish_id: "p_pub_url~v2.123456789" },
              error: { log_id: "provider-log-missing-code" },
            }),
          )) as typeof fetch,
      ),
    PublishingError,
  );
  assertEquals(missingContract.code, "TIKTOK_INIT_RESPONSE_INVALID");
  assertEquals(missingContract.ambiguous, true);
  assertEquals(missingContract.requestId, "provider-log-missing-code");

  const nonExactOk = await assertRejects(
    () =>
      initializeVideoPost(
        "access-token",
        {
          title: "Non-exact success code",
          privacyLevel: "SELF_ONLY",
          disableComment: true,
          disableDuet: true,
          disableStitch: true,
          brandContentToggle: false,
          brandOrganicToggle: false,
          videoUrl: "https://storage.example/video.mp4",
        },
        (() =>
          Promise.resolve(
            Response.json({
              data: { publish_id: "p_pub_url~v2.123456789" },
              error: { code: " ok ", log_id: "provider-log-non-exact-ok" },
            }),
          )) as typeof fetch,
      ),
    PublishingError,
  );
  assertEquals(nonExactOk.code, "TIKTOK_PROVIDER_REJECTED");
});

Deno.test("documented TikTok publish_id avoids ambiguity and persists before waiting", async () => {
  const log: string[] = [];
  const publishId = "p_pub_url~v2.123456789";
  let initBody = "";
  const fetcher = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("creator_info/query")) {
      return Promise.resolve(creatorResponse());
    }
    initBody = String(init?.body ?? "");
    return Promise.resolve(
      Response.json({
        data: { publish_id: publishId },
        error: { code: "ok", log_id: "provider-log-initialized" },
      }),
    );
  }) as typeof fetch;
  const result = await publishTikTokStep(
    job(),
    account,
    "access-token",
    "https://storage.example/signed-video",
    null,
    actions(log),
    fetcher,
  );
  assertEquals(result.status, "waiting_provider");
  assertEquals(result.providerContainerId, publishId);
  assertEquals(result.requestId, "provider-log-initialized");
  assertEquals(log, ["started", `stored:${publishId}`]);
  assertStringIncludes(initBody, '"source":"PULL_FROM_URL"');
  assertStringIncludes(
    initBody,
    '"video_url":"https://storage.example/signed-video"',
  );
  assertStringIncludes(initBody, '"privacy_level":"SELF_ONLY"');
  assertStringIncludes(initBody, '"brand_content_toggle":false');
  assertStringIncludes(initBody, '"brand_organic_toggle":false');
});

Deno.test("TikTok persistence failure remains ambiguous and retains success log_id", async () => {
  const error = await assertRejects(
    () =>
      publishTikTokStep(
        job(),
        account,
        "access-token",
        "https://storage.example/video.mp4",
        null,
        {
          ...actions([]),
          storePublishId: () =>
            Promise.reject(new Error("database unavailable")),
        },
        ((input) =>
          String(input).includes("creator_info/query")
            ? Promise.resolve(creatorResponse())
            : Promise.resolve(
              Response.json({
                data: { publish_id: "p_pub_url~v2.123456789" },
                error: { code: "ok", log_id: "provider-log-before-write" },
              }),
            )) as typeof fetch,
      ),
    PublishingError,
  );
  assertEquals(error.code, "AMBIGUOUS_PROVIDER_OUTCOME");
  assertEquals(error.ambiguous, true);
  assertEquals(error.requestId, "provider-log-before-write");
});

Deno.test("exact TikTok publish_id survives persistence and status fetch", async () => {
  const publishId = "abc.DEF-ghi_123~xyz";
  let storedPublishId: string | null = null;
  const firstResult = await publishTikTokStep(
    job(),
    account,
    "access-token",
    "https://storage.example/video.mp4",
    null,
    {
      ...actions([]),
      storePublishId: (value) => {
        storedPublishId = value;
        return Promise.resolve();
      },
    },
    ((input) =>
      String(input).includes("creator_info/query")
        ? Promise.resolve(creatorResponse())
        : Promise.resolve(
          Response.json({
            data: { publish_id: publishId },
            error: { code: "ok" },
          }),
        )) as typeof fetch,
  );
  assertEquals(firstResult.providerContainerId, publishId);
  assertEquals(storedPublishId, publishId);

  let statusRequestPublishId: unknown;
  const statusResult = await fetchPublishStatus(
    "access-token",
    storedPublishId!,
    ((_input, init) => {
      statusRequestPublishId = JSON.parse(String(init?.body)).publish_id;
      return Promise.resolve(
        Response.json({
          data: { status: "PROCESSING_DOWNLOAD" },
          error: { code: "ok", log_id: "provider-log-status" },
        }),
      );
    }) as typeof fetch,
  );
  assertEquals(statusRequestPublishId, publishId);
  assertEquals(statusResult.requestId, "provider-log-status");
});

Deno.test("TikTok Direct Post maps every commercial-content boolean combination", async () => {
  for (
    const [brandContentToggle, brandOrganicToggle] of [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ] as const
  ) {
    let body: Record<string, unknown> = {};
    await initializeVideoPost(
      "access-token",
      {
        title: "Commercial flags",
        privacyLevel: "PUBLIC_TO_EVERYONE",
        disableComment: false,
        disableDuet: true,
        disableStitch: true,
        brandContentToggle,
        brandOrganicToggle,
        videoUrl: "https://storage.example/video.mp4",
      },
      ((_input, init) => {
        body = JSON.parse(String(init?.body));
        return Promise.resolve(
          Response.json({
            data: { publish_id: "publish-flags" },
            error: { code: "ok" },
          }),
        );
      }) as typeof fetch,
    );
    const postInfo = body.post_info as Record<string, unknown>;
    assertEquals(postInfo.brand_content_toggle, brandContentToggle);
    assertEquals(postInfo.brand_organic_toggle, brandOrganicToggle);
  }
});

Deno.test("unaudited Direct Post capability offers only SELF_ONLY", () => {
  assertEquals(resolveTikTokDirectPostMode(""), "unaudited");
  assertEquals(
    allowedTikTokPrivacyLevels(
      ["PUBLIC_TO_EVERYONE", "SELF_ONLY", "FRIENDS"],
      "unaudited",
    ),
    ["SELF_ONLY"],
  );
  assertEquals(
    allowedTikTokPrivacyLevels(["PUBLIC_TO_EVERYONE", "SELF_ONLY"], "audited"),
    ["PUBLIC_TO_EVERYONE", "SELF_ONLY"],
  );
});

Deno.test("worker accepts explicit false settings and rejects malformed null before TikTok init", async () => {
  let providerCalls = 0;
  const malformed = job();
  malformed.payload_snapshot.platformSettings.brandContentToggle = null;
  const malformedError = await assertRejects(
    () =>
      publishTikTokStep(
        malformed,
        account,
        "access-token",
        "https://storage.example/video.mp4",
        null,
        actions([]),
        (() => {
          providerCalls += 1;
          return Promise.resolve(creatorResponse());
        }) as typeof fetch,
      ),
    PublishingError,
  );
  assertEquals(malformedError.code, "TIKTOK_SETTINGS_INVALID");
  assertEquals(providerCalls, 0);

  const valid = job();
  const validFetcher = ((input: string | URL | Request) => {
    providerCalls += 1;
    return String(input).includes("creator_info/query")
      ? Promise.resolve(creatorResponse())
      : Promise.resolve(
        Response.json({
          data: { publish_id: "publish-valid" },
          error: { code: "ok" },
        }),
      );
  }) as typeof fetch;
  const validResult = await publishTikTokStep(
    valid,
    account,
    "access-token",
    "https://storage.example/video.mp4",
    null,
    actions([]),
    validFetcher,
  );
  assertEquals(validResult.status, "waiting_provider");
});

Deno.test("unaudited worker rejects PUBLIC_TO_EVERYONE before TikTok initialization", async () => {
  const publicJob = job();
  publicJob.payload_snapshot.platformSettings.privacyLevel =
    "PUBLIC_TO_EVERYONE";
  let initCalls = 0;
  const error = await assertRejects(
    () =>
      publishTikTokStep(
        publicJob,
        account,
        "access-token",
        "https://storage.example/video.mp4",
        null,
        actions([]),
        ((input) => {
          if (String(input).includes("video/init")) initCalls += 1;
          return Promise.resolve(creatorResponse());
        }) as typeof fetch,
      ),
    PublishingError,
  );
  assertEquals(error.code, "TIKTOK_PRIVACY_INVALID");
  assertEquals(initCalls, 0);
});

function session(status = "INITIALIZED"): TikTokPublishSession {
  return {
    submissionStartedAt: new Date().toISOString(),
    publishId: "publish-123",
    providerStatus: status,
    statusCheckedAt: null,
    nextStatusCheckAt: null,
    pollCount: 0,
  };
}

Deno.test("existing TikTok publish_id polls without duplicate initialization", async () => {
  let initCalls = 0;
  const log: string[] = [];
  const fetcher = ((input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("creator_info/query")) {
      return Promise.resolve(creatorResponse());
    }
    if (url.includes("video/init")) initCalls += 1;
    return Promise.resolve(
      Response.json({
        data: { status: "PROCESSING_DOWNLOAD" },
        error: { code: "ok" },
      }),
    );
  }) as typeof fetch;
  const result = await publishTikTokStep(
    job(),
    account,
    "access-token",
    undefined,
    session(),
    actions(log),
    fetcher,
  );
  assertEquals(result.status, "waiting_provider");
  assertEquals(result.phase, "tiktok_processing");
  assertEquals(initCalls, 0);
  assertEquals(log, ["status:PROCESSING_DOWNLOAD"]);
});

Deno.test("TikTok succeeds only after PUBLISH_COMPLETE", async () => {
  const fetcher =
    ((input: string | URL | Request) =>
      String(input).includes("creator_info/query")
        ? Promise.resolve(creatorResponse())
        : Promise.resolve(
          Response.json({
            data: {
              status: "PUBLISH_COMPLETE",
              publicaly_available_post_id: ["video-1"],
            },
            error: { code: "ok" },
          }),
        )) as typeof fetch;
  const result = await publishTikTokStep(
    job(),
    account,
    "access-token",
    undefined,
    session(),
    actions([]),
    fetcher,
  );
  assertEquals(result.status, "succeeded");
  assertEquals(result.providerPostId, "video-1");
});

Deno.test("TikTok FAILED is terminal and an ambiguous marker is never reinitialized", async () => {
  const failedFetcher =
    ((input: string | URL | Request) =>
      String(input).includes("creator_info/query")
        ? Promise.resolve(creatorResponse())
        : Promise.resolve(
          Response.json({
            data: { status: "FAILED", fail_reason: "video_pull_failed" },
            error: { code: "ok" },
          }),
        )) as typeof fetch;
  const failed = await assertRejects(
    () =>
      publishTikTokStep(
        job(),
        account,
        "access-token",
        undefined,
        session(),
        actions([]),
        failedFetcher,
      ),
    PublishingError,
  );
  assertEquals(failed.code, "TIKTOK_VIDEO_PULL_FAILED");

  const ambiguous = { ...session(), publishId: null };
  let providerCalls = 0;
  const ambiguousError = await assertRejects(
    () =>
      publishTikTokStep(
        job(),
        account,
        "access-token",
        undefined,
        ambiguous,
        actions([]),
        ((input) => {
          providerCalls += 1;
          return String(input).includes("creator_info/query")
            ? Promise.resolve(creatorResponse())
            : Promise.reject(new Error("must not initialize"));
        }) as typeof fetch,
      ),
    PublishingError,
  );
  assertEquals(ambiguousError.ambiguous, true);
  assertEquals(providerCalls, 1);
});

Deno.test("Stage 2E-C migration fits TikTok into the generalized queue securely", async () => {
  const migration = await Deno.readTextFile(
    new URL(
      "../../migrations/20260811120000_stage_2e_c_tiktok_video_publishing.sql",
      import.meta.url,
    ),
  );
  assertStringIncludes(migration, "add value if not exists 'tiktok_video'");
  assertStringIncludes(migration, "private.tiktok_publish_sessions");
  assertStringIncludes(migration, "failure_count");
  assertStringIncludes(
    migration,
    "account.platform in ('facebook', 'instagram', 'youtube', 'tiktok')",
  );
  assertStringIncludes(migration, "TIKTOK_DESTINATION_LIMIT_EXCEEDED");
  assertStringIncludes(migration, "array['video.publish']::text[]");
  assertStringIncludes(migration, "start_tiktok_publish_submission");
  assertStringIncludes(migration, "store_tiktok_publish_id");
  assertStringIncludes(migration, "record_tiktok_publish_status");
  assertStringIncludes(migration, "to service_role");
  const sessionTable = migration.slice(
    migration.indexOf("create table private.tiktok_publish_sessions"),
    migration.indexOf("create trigger tiktok_publish_sessions_set_updated_at"),
  );
  assertEquals(sessionTable.includes("token"), false);
  assertEquals(sessionTable.includes("media_url"), false);
});

Deno.test("TikTok publish_id migration preserves the opaque provider contract", async () => {
  const migration = await Deno.readTextFile(
    new URL(
      "../../migrations/20260811150000_fix_tiktok_publish_id_contract.sql",
      import.meta.url,
    ),
  );
  assertStringIncludes(migration, "char_length(publish_id) <= 64");
  assertStringIncludes(migration, "publish_id ~ '[^[:space:]]'");
  assertStringIncludes(migration, "char_length(p_publish_id) > 64");
  assertStringIncludes(migration, "p_publish_id !~ '[^[:space:]]'");
  assertStringIncludes(migration, "set publish_id = p_publish_id");
  assertEquals(migration.includes("[A-Za-z0-9._:-]"), false);
});

Deno.test("TikTok settings fix guarantees boolean commercial flags in immutable snapshots", async () => {
  const migration = await Deno.readTextFile(
    new URL(
      "../../migrations/20260811130000_fix_tiktok_direct_post_settings.sql",
      import.meta.url,
    ),
  );
  assertStringIncludes(
    migration,
    "'brandContentToggle', coalesce((destination.platform_settings ->> 'brandContentToggle')::boolean, false)",
  );
  assertStringIncludes(
    migration,
    "'brandOrganicToggle', coalesce((destination.platform_settings ->> 'brandOrganicToggle')::boolean, false)",
  );
  assertStringIncludes(
    migration,
    "jsonb_typeof(settings -> 'brandContentToggle') is distinct from 'boolean'",
  );
  assertStringIncludes(
    migration,
    "jsonb_typeof(settings -> 'brandOrganicToggle') is distinct from 'boolean'",
  );
  assertStringIncludes(
    migration,
    "perform private.validate_publishing_post(target_post.id)",
  );
});

Deno.test("Creator Info Edge Function binds workspace/account membership and returns no credential", async () => {
  const source = await Deno.readTextFile(
    new URL("../tiktok-creator-info/index.ts", import.meta.url),
  );
  assertStringIncludes(source, "requireUser(request)");
  assertStringIncludes(source, "p_workspace_id: workspaceId");
  assertStringIncludes(source, "p_social_account_id: accountId");
  assertStringIncludes(source, '"get_tiktok_creator_credential"');
  assertStringIncludes(
    source,
    "privacyLevelOptions: allowedTikTokPrivacyLevels(",
  );
  assertStringIncludes(source, "creator.privacyLevelOptions,");
  const responseStatement = source.slice(
    source.indexOf("return jsonResponse(request"),
  );
  assertEquals(responseStatement.includes("encryptedAccessToken"), false);
  assertEquals(responseStatement.includes("refreshToken"), false);
});
