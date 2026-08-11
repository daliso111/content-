import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  tiktokCallbackErrorMessage,
} from "../../../lib/social-account-errors.ts";
import {
  connectionProviderForPlatform,
  socialAccountIdentity,
  tiktokPublishingCapability,
} from "../../../lib/social-account-presentation.ts";
import { selectableDestinationAccounts } from "../../../lib/youtube-publishing.ts";
import type { SocialAccountView } from "../../../types/index.ts";

const repositoryRoot = new URL("../../../", import.meta.url);

async function source(path: string): Promise<string> {
  return await Deno.readTextFile(new URL(path, repositoryRoot));
}

Deno.test("Social Accounts presents TikTok explicitly without a fabricated username", () => {
  const identity = socialAccountIdentity({
    platform: "tiktok",
    account_name: "Towkn Creator",
    username: null,
    platform_account_id: "open-id-1",
  });
  assertEquals(identity, {
    platformLabel: "TikTok",
    primary: "Towkn Creator",
    secondary: null,
  });
});

Deno.test("reconnect routing sends TikTok to TikTok and preserves existing providers", () => {
  assertEquals(connectionProviderForPlatform("facebook"), "meta");
  assertEquals(connectionProviderForPlatform("instagram"), "meta");
  assertEquals(connectionProviderForPlatform("youtube"), "youtube");
  assertEquals(connectionProviderForPlatform("tiktok"), "tiktok");
});

Deno.test("TikTok callback messages handle success-related errors safely", () => {
  assertEquals(
    tiktokCallbackErrorMessage("PROFILE_DISCOVERY_FAILED"),
    "TikTok could not return the account profile. Please try again.",
  );
  assertEquals(
    tiktokCallbackErrorMessage("raw_provider_description"),
    "The social connection could not be completed.",
  );
});

Deno.test("connected TikTok account is available as a publishing destination", () => {
  const view = {
    account: {
      id: "tiktok-1",
      workspace_id: "workspace-1",
      platform: "tiktok",
      connection_status: "connected",
    },
    connectedByName: null,
  } as SocialAccountView;
  assertEquals(selectableDestinationAccounts([view], "workspace-1"), [view]);
});

Deno.test("TikTok publishing capability derives only from public status and exact scopes", () => {
  const base = {
    platform: "tiktok",
    connection_status: "connected",
    granted_scopes: ["user.info.basic"],
  } as SocialAccountView["account"];
  assertEquals(tiktokPublishingCapability(base), "permission_required");
  assertEquals(
    tiktokPublishingCapability({
      ...base,
      granted_scopes: ["user.info.basic", "video.publish"],
    }),
    "authorized",
  );
  assertEquals(
    tiktokPublishingCapability({
      ...base,
      connection_status: "reconnect_required",
      granted_scopes: ["user.info.basic", "video.publish"],
    }),
    "reconnect_required",
  );
});

Deno.test("Social Accounts page exposes active TikTok connect and callback handling", async () => {
  const page = await source("app/dashboard/accounts/page.tsx");
  assertStringIncludes(page, "startTikTokConnection");
  assertStringIncludes(page, 'params.get("tiktok_error")');
  assertStringIncludes(page, 'callbackSuccess.startsWith("tiktok:")');
  assertStringIncludes(page, 'platform="tiktok"');
  assertStringIncludes(page, "Enable TikTok Publishing");
  assertStringIncludes(page, "Publishing permission required");
  assertStringIncludes(page, "TikTok publishing authorization enabled");
  assertStringIncludes(page, "TikTok publishing enabled");
  assertStringIncludes(
    page,
    'description="Connect TikTok for video Direct Post publishing."',
  );
  assertEquals(
    page.includes(
      'platform="tiktok" title="TikTok" description="Coming soon" disabled',
    ),
    false,
  );
});

Deno.test("browser service accepts only the exact TikTok authorization host and path", async () => {
  const service = await source("lib/services/social-account-service.ts");
  assertStringIncludes(service, '"tiktok-oauth-start"');
  assertStringIncludes(service, 'url.hostname !== "www.tiktok.com"');
  assertStringIncludes(service, 'url.pathname !== "/v2/auth/authorize/"');
  assertStringIncludes(service, "startTikTokPublishingUpgrade");
  assertStringIncludes(service, 'intent: "enable_publishing"');
  assertEquals(service.includes("expectedPlatformAccountId"), false);
});

Deno.test("TikTok OAuth state is random, hashed for storage, and consumed before callback handling", async () => {
  const start = await source("supabase/functions/tiktok-oauth-start/index.ts");
  const callback = await source(
    "supabase/functions/tiktok-oauth-callback/index.ts",
  );
  assertStringIncludes(start, "new Uint8Array(32)");
  assertStringIncludes(start, "p_state_hash: await sha256Hex(state)");
  assertEquals(start.includes("p_state_hash: state"), false);
  const consume = callback.indexOf('"consume_tiktok_oauth_state"');
  const cancellation = callback.indexOf('url.searchParams.has("error")');
  const exchange = callback.indexOf(
    "await exchangeTikTokAuthorizationCode",
    consume,
  );
  assert(consume >= 0 && cancellation > consume && exchange > cancellation);
  assertEquals(callback.includes("error_description"), false);
  assertStringIncludes(start, "p_intent = intent");
  assertStringIncludes(start, "p_pending_connection_id = pendingConnectionId");
  assertEquals(start.includes("body.expectedPlatformAccountId"), false);
  assertStringIncludes(callback, "parseTrustedTikTokOAuthState(consumedState)");
});

Deno.test("TikTok callback encrypts access and refresh credentials separately", async () => {
  const callback = await source(
    "supabase/functions/tiktok-oauth-callback/index.ts",
  );
  assertStringIncludes(callback, "encryptToken(token.accessToken)");
  assertStringIncludes(callback, "encryptToken(token.refreshToken)");
  assertStringIncludes(
    callback,
    "encryptedAccessToken: encryptedAccess.ciphertext",
  );
  assertStringIncludes(
    callback,
    "encryptedRefreshToken: encryptedRefresh.ciphertext",
  );
});

Deno.test("TikTok upgrade validates identity before replacing the intended credential", async () => {
  const callback = await source(
    "supabase/functions/tiktok-oauth-callback/index.ts",
  );
  const identity = callback.indexOf(
    "assertTikTokUpgradeOpenId(stateRecord, token.openId)",
  );
  const encryption = callback.indexOf("encryptToken(token.accessToken)");
  const update = callback.indexOf('"update_tiktok_connection_tokens"');
  assert(identity >= 0 && encryption > identity && update > encryption);
  assertStringIncludes(callback, "stateRecord.pendingConnectionId");
  assertStringIncludes(
    callback,
    'token.grantedScopes.includes("video.publish")',
  );
});

Deno.test("TikTok refresh persists rotated credentials before profile discovery", async () => {
  const refresh = await source(
    "supabase/functions/social-account-refresh/index.ts",
  );
  const branch = refresh.indexOf('credential.platform === "tiktok"');
  const persist = refresh.indexOf('"update_tiktok_connection_tokens"', branch);
  const profile = refresh.indexOf("discoverTikTokUser(", branch);
  assert(branch >= 0 && persist > branch && profile > persist);
  assertStringIncludes(refresh, "p_granted_scopes: refreshed.grantedScopes");
  const reconnectList = refresh.slice(refresh.indexOf('"TOKEN_EXPIRED"'));
  assertStringIncludes(reconnectList, '"TIKTOK_REAUTHORIZATION_REQUIRED"');
  assertEquals(
    reconnectList.includes('"TIKTOK_PROFILE_DISCOVERY_FAILED"'),
    false,
  );
});

Deno.test("TikTok disconnect attempts revoke before local cleanup and preserves cleanup on failure", async () => {
  const disconnect = await source(
    "supabase/functions/social-account-disconnect/index.ts",
  );
  const revoke = disconnect.indexOf("revokeTikTokAuthorization");
  const cleanup = disconnect.indexOf('"disconnect_social_account"');
  assert(revoke >= 0 && cleanup > revoke);
  assertStringIncludes(disconnect, 'warning = "TIKTOK_REVOCATION_FAILED"');
  assertStringIncludes(
    disconnect,
    "Local deletion is intentionally attempted regardless",
  );
});

Deno.test("TikTok OAuth-state migration preserves compatibility and service-role-only grants", async () => {
  const migration = await source(
    "supabase/migrations/20260811100000_stage_2e_b_tiktok_publishing_oauth_state.sql",
  );
  assertStringIncludes(
    migration,
    "public.begin_tiktok_oauth(uuid, uuid, text, text, text, uuid)",
  );
  assertStringIncludes(
    migration,
    "public.begin_tiktok_oauth(uuid, uuid, text, text)",
  );
  assertStringIncludes(migration, "'pendingConnectionId'");
  assertStringIncludes(migration, "'expectedPlatformAccountId'");
  assertStringIncludes(migration, "'requestedScopes'");
  assertStringIncludes(migration, "from public, anon, authenticated");
  assertStringIncludes(migration, "to postgres, service_role");
  assertEquals(
    migration.includes(
      "grant execute on function public.begin_tiktok_oauth(uuid, uuid, text, text, text, uuid)\n  to authenticated",
    ),
    false,
  );
});
