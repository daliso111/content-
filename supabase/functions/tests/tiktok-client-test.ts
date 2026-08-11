import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ConnectionError } from "../_shared/connection-errors.ts";
import {
  discoverTikTokUser,
  exchangeTikTokAuthorizationCode,
  refreshTikTokAccessToken,
  revokeTikTokAuthorization,
} from "../_shared/tiktok-client.ts";
import {
  buildTikTokAuthorizationUrl,
  TIKTOK_CONNECTION_SCOPES,
  TIKTOK_PUBLISHING_AUTHORIZATION_SCOPES,
  type TikTokConfig,
} from "../_shared/tiktok-config.ts";
import {
  assertTikTokUpgradeOpenId,
  parseTrustedTikTokOAuthState,
} from "../_shared/tiktok-oauth-state.ts";
import { tiktokCallbackDiagnosticCode } from "../_shared/tiktok-errors.ts";

const config: TikTokConfig = {
  clientKey: "sandbox-client-key",
  clientSecret: "sandbox-client-secret",
  redirectUri: "https://project.supabase.co/functions/v1/tiktok-oauth-callback",
  appUrl: new URL("https://towkn.example"),
};

function validToken(overrides: Record<string, unknown> = {}) {
  return {
    access_token: "access-token",
    refresh_token: "refresh-token",
    open_id: "open-id-1",
    expires_in: 86400,
    refresh_expires_in: 31536000,
    scope: TIKTOK_CONNECTION_SCOPES.join(","),
    token_type: "Bearer",
    ...overrides,
  };
}

Deno.test("TikTok authorization URL uses only basic account scope", () => {
  const state = "a".repeat(64);
  const url = new URL(buildTikTokAuthorizationUrl(config, state));
  assertEquals(url.origin, "https://www.tiktok.com");
  assertEquals(url.pathname, "/v2/auth/authorize/");
  assertEquals(url.searchParams.get("client_key"), config.clientKey);
  assertEquals(url.searchParams.get("redirect_uri"), config.redirectUri);
  assertEquals(url.searchParams.get("response_type"), "code");
  assertEquals(url.searchParams.get("scope"), "user.info.basic");
  assertEquals(url.searchParams.get("state"), state);
  assertEquals(url.toString().includes("video"), false);
  assertEquals(url.toString().includes(config.clientSecret), false);
});

Deno.test("TikTok publishing authorization URL requests basic plus video.publish only", () => {
  const url = new URL(
    buildTikTokAuthorizationUrl(
      config,
      "b".repeat(64),
      "enable_publishing",
    ),
  );
  assertEquals(
    url.searchParams.get("scope"),
    TIKTOK_PUBLISHING_AUTHORIZATION_SCOPES.join(","),
  );
  assertEquals(url.searchParams.get("scope")?.includes("video.upload"), false);
});

Deno.test("TikTok code exchange is form POST and keeps code and secret out of URL", async () => {
  let observedUrl = "";
  let observedMethod = "";
  let observedBody = "";
  const result = await exchangeTikTokAuthorizationCode(
    config,
    "one-time-code",
    ((input, init) => {
      observedUrl = String(input);
      observedMethod = init?.method ?? "";
      observedBody = String(init?.body ?? "");
      return Promise.resolve(Response.json(validToken()));
    }) as typeof fetch,
  );
  assertEquals(observedUrl, "https://open.tiktokapis.com/v2/oauth/token/");
  assertEquals(observedMethod, "POST");
  assertEquals(observedUrl.includes("one-time-code"), false);
  assertEquals(observedUrl.includes(config.clientSecret), false);
  assertEquals(observedBody.includes("one-time-code"), true);
  assertEquals(observedBody.includes(config.clientSecret), true);
  assertEquals(result.openId, "open-id-1");
  assertEquals(result.grantedScopes, ["user.info.basic"]);
});

Deno.test("TikTok rejects malformed tokens, missing refresh tokens, and missing scope", async () => {
  await assertRejects(
    () =>
      exchangeTikTokAuthorizationCode(
        config,
        "code",
        (() => Promise.resolve(Response.json({}))) as typeof fetch,
      ),
    ConnectionError,
    "TIKTOK_TOKEN_RESPONSE_INVALID",
  );
  await assertRejects(
    () =>
      exchangeTikTokAuthorizationCode(
        config,
        "code",
        (() =>
          Promise.resolve(
            Response.json(validToken({ refresh_token: null })),
          )) as typeof fetch,
      ),
    ConnectionError,
    "TIKTOK_REFRESH_TOKEN_REQUIRED",
  );
  await assertRejects(
    () =>
      exchangeTikTokAuthorizationCode(
        config,
        "code",
        (() =>
          Promise.resolve(
            Response.json(validToken({ scope: "user.info.profile" })),
          )) as typeof fetch,
      ),
    ConnectionError,
    "TIKTOK_REQUIRED_SCOPE_MISSING",
  );
});

Deno.test("TikTok provider failures retain only safe error diagnostics", async () => {
  try {
    await exchangeTikTokAuthorizationCode(
      config,
      "code",
      (() =>
        Promise.resolve(Response.json({
          error: "invalid_client",
          error_description: "sensitive provider detail",
        }, { status: 401 }))) as typeof fetch,
    );
    throw new Error("Expected token exchange failure");
  } catch (error) {
    if (!(error instanceof ConnectionError)) throw error;
    assertEquals(error.code, "TIKTOK_TOKEN_EXCHANGE_FAILED");
    assertEquals(error.diagnostics.providerHttpStatus, 401);
    assertEquals(error.diagnostics.providerErrorName, "invalid_client");
    assertEquals(error.message.includes("sensitive provider detail"), false);
  }
});

Deno.test("TikTok refresh requires and returns rotated refresh credentials", async () => {
  const token = await refreshTikTokAccessToken(
    config,
    "stored-refresh",
    (() =>
      Promise.resolve(
        Response.json(validToken({ refresh_token: "rotated-refresh" })),
      )) as typeof fetch,
  );
  assertEquals(token.refreshToken, "rotated-refresh");
  await assertRejects(
    () =>
      refreshTikTokAccessToken(
        config,
        "stored-refresh",
        (() =>
          Promise.resolve(
            Response.json(validToken({ refresh_token: null })),
          )) as typeof fetch,
      ),
    ConnectionError,
    "TIKTOK_REFRESH_TOKEN_REQUIRED",
  );
});

Deno.test("TikTok persists the exact full or downgraded provider scope set", async () => {
  const full = await exchangeTikTokAuthorizationCode(
    config,
    "code",
    (() =>
      Promise.resolve(Response.json(validToken({
        scope: "video.publish,user.info.basic,video.publish",
      })))) as typeof fetch,
  );
  assertEquals(full.grantedScopes, ["video.publish", "user.info.basic"]);

  const downgraded = await refreshTikTokAccessToken(
    config,
    "stored-refresh",
    (() => Promise.resolve(Response.json(validToken()))) as typeof fetch,
  );
  assertEquals(downgraded.grantedScopes, ["user.info.basic"]);
});

Deno.test("trusted TikTok OAuth state distinguishes connect and publishing upgrade", () => {
  const common = {
    workspaceId: "00000000-0000-4000-8000-00000000e101",
    initiatedBy: "00000000-0000-4000-8000-00000000e001",
    returnPath: "/dashboard/accounts",
    metadata: {},
  };
  assertEquals(
    parseTrustedTikTokOAuthState({
      ...common,
      intent: "connect",
      pendingConnectionId: null,
      expectedPlatformAccountId: null,
      requestedScopes: ["user.info.basic"],
    }).intent,
    "connect",
  );

  const upgrade = parseTrustedTikTokOAuthState({
    ...common,
    intent: "enable_publishing",
    pendingConnectionId: "00000000-0000-4000-8000-00000000e201",
    expectedPlatformAccountId: "open-id-1",
    requestedScopes: ["user.info.basic", "video.publish"],
  });
  assertEquals(
    upgrade.pendingConnectionId,
    "00000000-0000-4000-8000-00000000e201",
  );
  assertTikTokUpgradeOpenId(upgrade, "open-id-1");
  assertThrows(
    () => assertTikTokUpgradeOpenId(upgrade, "different-open-id"),
    ConnectionError,
    "TIKTOK_OPEN_ID_MISMATCH",
  );
});

Deno.test("unknown or incomplete TikTok OAuth upgrade state fails closed", () => {
  const common = {
    workspaceId: "00000000-0000-4000-8000-00000000e101",
    initiatedBy: "00000000-0000-4000-8000-00000000e001",
    returnPath: "/dashboard/accounts",
    pendingConnectionId: "00000000-0000-4000-8000-00000000e201",
    expectedPlatformAccountId: "open-id-1",
    requestedScopes: ["user.info.basic", "video.publish"],
    metadata: {},
  };
  assertThrows(
    () =>
      parseTrustedTikTokOAuthState({ ...common, intent: "replace_account" }),
    ConnectionError,
    "INVALID_OAUTH_STATE",
  );
  assertThrows(
    () =>
      parseTrustedTikTokOAuthState({
        ...common,
        intent: "enable_publishing",
        pendingConnectionId: null,
      }),
    ConnectionError,
    "INVALID_OAUTH_STATE",
  );
  assertThrows(
    () =>
      parseTrustedTikTokOAuthState({
        ...common,
        intent: "enable_publishing",
        expectedPlatformAccountId: null,
      }),
    ConnectionError,
    "INVALID_OAUTH_STATE",
  );
});

Deno.test("TikTok profile discovery maps basic identity without fabricating username", async () => {
  let observedUrl = "";
  let authorization = "";
  const user = await discoverTikTokUser(
    "access-token",
    "open-id-1",
    ((input, init) => {
      observedUrl = String(input);
      authorization = new Headers(init?.headers).get("Authorization") ?? "";
      return Promise.resolve(Response.json({
        data: {
          user: {
            open_id: "open-id-1",
            display_name: "Towkn Creator",
            avatar_url: "https://example.test/avatar.jpg",
          },
        },
        error: { code: "ok" },
      }));
    }) as typeof fetch,
  );
  assertEquals(
    new URL(observedUrl).searchParams.get("fields"),
    "open_id,avatar_url,display_name",
  );
  assertEquals(authorization, "Bearer access-token");
  assertEquals(user, {
    platform: "tiktok",
    accountType: "tiktok_user",
    platformAccountId: "open-id-1",
    accountName: "Towkn Creator",
    username: null,
    profileImageUrl: "https://example.test/avatar.jpg",
  });
});

Deno.test("TikTok profile discovery rejects open_id mismatch", async () => {
  await assertRejects(
    () =>
      discoverTikTokUser(
        "access-token",
        "expected-id",
        (() =>
          Promise.resolve(
            Response.json({
              data: { user: { open_id: "other-id" } },
              error: { code: "ok" },
            }),
          )) as typeof fetch,
      ),
    ConnectionError,
    "TIKTOK_OPEN_ID_MISMATCH",
  );
});

Deno.test("TikTok revoke uses form POST and stable failure errors", async () => {
  let observedUrl = "";
  let observedBody = "";
  await revokeTikTokAuthorization(
    config,
    "access-token",
    ((input, init) => {
      observedUrl = String(input);
      observedBody = String(init?.body ?? "");
      return Promise.resolve(
        Response.json({ data: {}, error: { code: "ok" } }),
      );
    }) as typeof fetch,
  );
  assertEquals(observedUrl, "https://open.tiktokapis.com/v2/oauth/revoke/");
  assertEquals(observedUrl.includes(config.clientSecret), false);
  assertEquals(observedBody.includes(config.clientSecret), true);
  assertEquals(observedBody.includes("access-token"), true);
});

Deno.test("TikTok callback diagnostics map to stable browser-safe codes", () => {
  assertEquals(
    tiktokCallbackDiagnosticCode(
      "TOKEN_EXCHANGE_STARTED",
      new ConnectionError("TIKTOK_REQUIRED_SCOPE_MISSING", 403),
    ),
    "REQUIRED_SCOPE_MISSING",
  );
  assertEquals(
    tiktokCallbackDiagnosticCode(
      "PROFILE_DISCOVERY_STARTED",
      new ConnectionError("TIKTOK_OPEN_ID_MISMATCH", 409),
    ),
    "OPEN_ID_MISMATCH",
  );
  assertEquals(
    tiktokCallbackDiagnosticCode(
      "UPSERT_STARTED",
      new Error("raw database detail"),
    ),
    "UPSERT_FAILED",
  );
});
