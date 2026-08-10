import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { requireOAuthState } from "../_shared/validation.ts";
import { socialAccountIdentity } from "../../../lib/social-account-presentation.ts";
import { youtubeCallbackErrorMessage } from "../../../lib/social-account-errors.ts";
import {
  ConnectionError,
  youtubeCallbackDiagnosticCode,
} from "../_shared/connection-errors.ts";
import {
  discoverYouTubeChannel,
  exchangeYouTubeAuthorizationCode,
  refreshYouTubeAccessToken,
} from "../_shared/youtube-client.ts";
import {
  buildYouTubeAuthorizationUrl,
  YOUTUBE_SCOPES,
  type YouTubeConfig,
} from "../_shared/youtube-config.ts";

const config: YouTubeConfig = {
  clientId: "youtube-client.apps.googleusercontent.com",
  clientSecret: "youtube-secret",
  redirectUri:
    "https://project.supabase.co/functions/v1/youtube-oauth-callback",
  appUrl: new URL("https://postflow.example"),
};

Deno.test("YouTube authorization URL requests exact scopes and offline consent", () => {
  const state = "a".repeat(64);
  const url = new URL(buildYouTubeAuthorizationUrl(config, state));
  assertEquals(url.origin, "https://accounts.google.com");
  assertEquals(url.pathname, "/o/oauth2/v2/auth");
  assertEquals(url.searchParams.get("client_id"), config.clientId);
  assertEquals(url.searchParams.get("redirect_uri"), config.redirectUri);
  assertEquals(url.searchParams.get("response_type"), "code");
  assertEquals(url.searchParams.get("scope")?.split(" "), [...YOUTUBE_SCOPES]);
  assertEquals(url.searchParams.get("access_type"), "offline");
  assertEquals(url.searchParams.get("prompt"), "consent");
  assertEquals(url.searchParams.get("include_granted_scopes"), "true");
  assertEquals(url.searchParams.get("state"), state);
  assertEquals(url.toString().includes(config.clientSecret), false);
});

Deno.test("OAuth state validation rejects missing, short, and malformed values", () => {
  assertEquals(requireOAuthState("b".repeat(64)), "b".repeat(64));
  assertThrows(() => requireOAuthState(null));
  assertThrows(() => requireOAuthState("short"));
  assertThrows(() => requireOAuthState("z".repeat(64)));
});

Deno.test("YouTube code exchange keeps code and client secret in POST body", async () => {
  let observedUrl = "";
  let observedBody = "";
  const fetcher = ((input: RequestInfo | URL, init?: RequestInit) => {
    observedUrl = String(input);
    observedBody = String(init?.body ?? "");
    return Promise.resolve(Response.json({
      access_token: "access-token",
      refresh_token: "refresh-token",
      expires_in: 3600,
      token_type: "Bearer",
      scope: YOUTUBE_SCOPES.join(" "),
    }));
  }) as typeof fetch;
  const token = await exchangeYouTubeAuthorizationCode(
    config,
    "one-time-code",
    fetcher,
  );
  assertEquals(token.accessToken, "access-token");
  assertEquals(token.refreshToken, "refresh-token");
  assertEquals(token.grantedScopes, [...YOUTUBE_SCOPES]);
  assertEquals(observedUrl, "https://oauth2.googleapis.com/token");
  assertEquals(observedUrl.includes("one-time-code"), false);
  assertEquals(observedUrl.includes(config.clientSecret), false);
  assertEquals(observedBody.includes("one-time-code"), true);
  assertEquals(observedBody.includes(config.clientSecret), true);
});

Deno.test("token exchange retains only safe Google status and error name diagnostics", async () => {
  try {
    await exchangeYouTubeAuthorizationCode(
      config,
      "one-time-code",
      (() =>
        Promise.resolve(Response.json({
          error: "invalid_client",
          error_description: "raw Google description must not escape",
        }, { status: 401 }))) as typeof fetch,
    );
    throw new Error("Expected token exchange to fail");
  } catch (error) {
    if (!(error instanceof ConnectionError)) throw error;
    assertEquals(error.code, "YOUTUBE_TOKEN_EXCHANGE_FAILED");
    assertEquals(error.diagnostics.providerHttpStatus, 401);
    assertEquals(error.diagnostics.providerErrorName, "invalid_client");
    assertEquals(error.message.includes("raw Google description"), false);
  }
});

Deno.test("invalid_grant maps differently for callback exchange and stored-token refresh", async () => {
  const invalidGrant = (() =>
    Promise.resolve(Response.json({
      error: "invalid_grant",
      error_description: "raw description",
    }, { status: 400 }))) as typeof fetch;
  await assertRejects(
    () => exchangeYouTubeAuthorizationCode(config, "code", invalidGrant),
    ConnectionError,
    "YOUTUBE_TOKEN_EXCHANGE_FAILED",
  );
  await assertRejects(
    () => refreshYouTubeAccessToken(config, "refresh", invalidGrant),
    ConnectionError,
    "YOUTUBE_REAUTHORIZATION_REQUIRED",
  );
});

Deno.test("callback diagnostics expose only stable stage-specific codes", () => {
  assertEquals(
    youtubeCallbackDiagnosticCode(
      "TOKEN_EXCHANGE_FAILED",
      new ConnectionError("YOUTUBE_TOKEN_EXCHANGE_FAILED", 502),
    ),
    "TOKEN_EXCHANGE_FAILED",
  );
  assertEquals(
    youtubeCallbackDiagnosticCode(
      "CHANNEL_DISCOVERY_FAILED",
      new ConnectionError("YOUTUBE_NO_CHANNEL", 422),
    ),
    "NO_CHANNEL",
  );
  assertEquals(
    youtubeCallbackDiagnosticCode(
      "TOKEN_ENCRYPTION_STARTED",
      new ConnectionError("TOKEN_ENCRYPTION_FAILED", 500),
    ),
    "ENCRYPTION_FAILED",
  );
  assertEquals(
    youtubeCallbackDiagnosticCode(
      "UPSERT_FAILED",
      new ConnectionError("YOUTUBE_REFRESH_TOKEN_REQUIRED", 409),
    ),
    "REFRESH_TOKEN_MISSING",
  );
  assertEquals(
    youtubeCallbackDiagnosticCode(
      "UPSERT_FAILED",
      new Error("raw database detail"),
    ),
    "UPSERT_FAILED",
  );
});

Deno.test("browser callback messages accept only known safe YouTube diagnostics", () => {
  assertEquals(
    youtubeCallbackErrorMessage("TOKEN_EXCHANGE_FAILED"),
    "Google could not complete YouTube authorization. Please try again.",
  );
  assertEquals(
    youtubeCallbackErrorMessage("REFRESH_TOKEN_MISSING"),
    "Google did not provide offline access. Reconnect YouTube and approve access again.",
  );
  assertEquals(
    youtubeCallbackErrorMessage("raw_google_description"),
    "The social connection could not be completed.",
  );
});

Deno.test("YouTube refresh accepts rotation without requiring a new refresh token", async () => {
  const token = await refreshYouTubeAccessToken(
    config,
    "stored-refresh",
    (() =>
      Promise.resolve(Response.json({
        access_token: "rotated-access",
        expires_in: 3600,
        token_type: "Bearer",
      }))) as typeof fetch,
  );
  assertEquals(token.accessToken, "rotated-access");
  assertEquals(token.refreshToken, null);
});

Deno.test("YouTube channel discovery maps title, handle, and best avatar safely", async () => {
  let authorization = "";
  const channel = await discoverYouTubeChannel(
    "access-token",
    ((_input, init) => {
      authorization = new Headers(init?.headers).get("Authorization") ?? "";
      return Promise.resolve(Response.json({
        items: [{
          id: "channel-1",
          snippet: {
            title: "PostFlow Channel",
            customUrl: "@postflow",
            thumbnails: {
              default: { url: "https://example.test/default.jpg" },
              high: { url: "https://example.test/high.jpg" },
            },
          },
        }],
      }));
    }) as typeof fetch,
  );
  assertEquals(channel, {
    platform: "youtube",
    accountType: "youtube_channel",
    platformAccountId: "channel-1",
    accountName: "PostFlow Channel",
    username: "postflow",
    profileImageUrl: "https://example.test/high.jpg",
  });
  assertEquals(authorization, "Bearer access-token");
});

Deno.test("YouTube channel discovery rejects an account with no channel", async () => {
  await assertRejects(() =>
    discoverYouTubeChannel(
      "access-token",
      (() => Promise.resolve(Response.json({ items: [] }))) as typeof fetch,
    )
  );
});

Deno.test("YouTube provider errors never include raw Google payload details", async () => {
  await assertRejects(
    () =>
      discoverYouTubeChannel(
        "access-token",
        (() =>
          Promise.resolve(Response.json({
            error: { message: "sensitive raw provider detail" },
          }, { status: 503 }))) as typeof fetch,
      ),
    Error,
    "YOUTUBE_PROVIDER_UNAVAILABLE",
  );
});

Deno.test("Social Accounts presents YouTube as its own channel identity", () => {
  const identity = socialAccountIdentity({
    platform: "youtube",
    account_name: "PostFlow Channel",
    username: "postflow",
    platform_account_id: "channel-1",
  });
  assertEquals(identity.platformLabel, "YouTube");
  assertEquals(identity.primary, "PostFlow Channel");
  assertEquals(identity.secondary, "@postflow");
});
