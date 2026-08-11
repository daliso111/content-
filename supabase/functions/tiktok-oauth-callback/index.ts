import {
  ConnectionError,
  safeConnectionError,
} from "../_shared/connection-errors.ts";
import { createTrustedClient, trustedRpc } from "../_shared/database.ts";
import { encryptToken } from "../_shared/token-crypto.ts";
import { requireOAuthState, sha256Hex } from "../_shared/validation.ts";
import {
  discoverTikTokUser,
  exchangeTikTokAuthorizationCode,
} from "../_shared/tiktok-client.ts";
import {
  getTikTokAppUrl,
  getTikTokConfig,
  tiktokAppRedirect,
  type TikTokConfig,
} from "../_shared/tiktok-config.ts";
import {
  assertTikTokUpgradeOpenId,
  parseTrustedTikTokOAuthState,
  type TrustedTikTokOAuthState,
} from "../_shared/tiktok-oauth-state.ts";
import {
  tiktokCallbackDiagnosticCode,
  type TikTokCallbackStage,
  tiktokFailureStage,
} from "../_shared/tiktok-errors.ts";

interface DiagnosticContext {
  accessTokenPresent: boolean;
  refreshTokenPresent: boolean;
  discoveredProfiles: number;
}

async function assertUpgradeTargetIsStillValid(
  trusted: ReturnType<typeof createTrustedClient>,
  state: TrustedTikTokOAuthState,
): Promise<void> {
  if (state.intent !== "enable_publishing") return;
  const { data: account, error } = await trusted
    .from("social_accounts")
    .select(
      "id, workspace_id, platform, account_type, platform_account_id, connection_status",
    )
    .eq("id", state.pendingConnectionId!)
    .maybeSingle();
  if (
    error || !account || account.workspace_id !== state.workspaceId ||
    account.platform !== "tiktok" || account.account_type !== "tiktok_user" ||
    account.connection_status !== "connected" ||
    account.platform_account_id !== state.expectedPlatformAccountId
  ) {
    throw new ConnectionError("TIKTOK_CONNECTION_NO_LONGER_VALID", 409);
  }
}

function logStage(
  stage: TikTokCallbackStage,
  context?: Partial<DiagnosticContext>,
): void {
  console.info(JSON.stringify({ provider: "tiktok", stage, ...context }));
}

function logFailure(
  stage: TikTokCallbackStage,
  error: unknown,
  context: DiagnosticContext,
): void {
  const safe = safeConnectionError(error);
  console.error(JSON.stringify({
    provider: "tiktok",
    stage,
    errorCode: safe.code,
    providerHttpStatus: safe.diagnostics.providerHttpStatus ?? null,
    providerErrorName: safe.diagnostics.providerErrorName ?? null,
    accessTokenPresent: context.accessTokenPresent,
    refreshTokenPresent: context.refreshTokenPresent,
    discoveredProfiles: context.discoveredProfiles,
  }));
}

Deno.serve(async (request) => {
  let config: TikTokConfig | undefined;
  let redirectConfig: Pick<TikTokConfig, "appUrl"> | undefined;
  let stage: TikTokCallbackStage = "CALLBACK_RECEIVED";
  const context: DiagnosticContext = {
    accessTokenPresent: false,
    refreshTokenPresent: false,
    discoveredProfiles: 0,
  };
  logStage(stage);
  try {
    redirectConfig = { appUrl: getTikTokAppUrl() };
    config = getTikTokConfig();
    if (request.method !== "GET") {
      throw new ConnectionError("METHOD_NOT_ALLOWED", 405);
    }
    const url = new URL(request.url);
    const state = requireOAuthState(url.searchParams.get("state"));
    stage = "STATE_CONSUME_STARTED";
    logStage(stage);
    const trusted = createTrustedClient();
    const consumedState = await trustedRpc<unknown>(
      trusted,
      "consume_tiktok_oauth_state",
      { p_state_hash: await sha256Hex(state) },
    );
    const stateRecord = parseTrustedTikTokOAuthState(consumedState);
    stage = "STATE_CONSUMED";
    logStage(stage);
    if (url.searchParams.has("error")) {
      throw new ConnectionError("TIKTOK_AUTHORIZATION_CANCELLED", 400);
    }
    const code = url.searchParams.get("code");
    if (!code) throw new ConnectionError("INVALID_REQUEST", 400);

    stage = "TOKEN_EXCHANGE_STARTED";
    logStage(stage);
    const token = await exchangeTikTokAuthorizationCode(config, code);
    context.accessTokenPresent = Boolean(token.accessToken);
    context.refreshTokenPresent = Boolean(token.refreshToken);
    stage = "TOKEN_EXCHANGE_SUCCEEDED";
    logStage(stage, context);

    assertTikTokUpgradeOpenId(stateRecord, token.openId);
    await assertUpgradeTargetIsStillValid(trusted, stateRecord);

    stage = "PROFILE_DISCOVERY_STARTED";
    logStage(stage, context);
    const profile = await discoverTikTokUser(
      token.accessToken,
      stateRecord.expectedPlatformAccountId ?? token.openId,
    );
    context.discoveredProfiles = 1;
    stage = "PROFILE_DISCOVERY_SUCCEEDED";
    logStage(stage, context);

    stage = "TOKEN_ENCRYPTION_STARTED";
    logStage(stage, context);
    const encryptedAccess = await encryptToken(token.accessToken);
    const encryptedRefresh = await encryptToken(token.refreshToken);
    stage = "TOKEN_ENCRYPTION_SUCCEEDED";
    logStage(stage, context);

    stage = "UPSERT_STARTED";
    logStage(stage, context);
    let account: { id: string };
    if (stateRecord.intent === "enable_publishing") {
      await assertUpgradeTargetIsStillValid(trusted, stateRecord);
      account = await trustedRpc<{ id: string }>(
        trusted,
        "update_tiktok_connection_tokens",
        {
          p_social_account_id: stateRecord.pendingConnectionId,
          p_actor_id: stateRecord.initiatedBy,
          p_encrypted_access_token: encryptedAccess.ciphertext,
          p_access_token_iv: encryptedAccess.iv,
          p_encrypted_refresh_token: encryptedRefresh.ciphertext,
          p_refresh_token_iv: encryptedRefresh.iv,
          p_token_type: token.tokenType,
          p_token_expires_at: token.expiresAt,
          p_refresh_token_expires_at: token.refreshExpiresAt,
          p_granted_scopes: token.grantedScopes,
        },
      );
    } else {
      account = await trustedRpc<{ id: string }>(
        trusted,
        "upsert_tiktok_connection",
        {
          p_workspace_id: stateRecord.workspaceId,
          p_actor_id: stateRecord.initiatedBy,
          p_connection: {
            ...profile,
            tokenType: token.tokenType,
            tokenExpiresAt: token.expiresAt,
            refreshTokenExpiresAt: token.refreshExpiresAt,
            grantedScopes: token.grantedScopes,
            encryptedAccessToken: encryptedAccess.ciphertext,
            accessTokenIv: encryptedAccess.iv,
            encryptedRefreshToken: encryptedRefresh.ciphertext,
            refreshTokenIv: encryptedRefresh.iv,
            metadata: {},
          },
        },
      );
    }
    stage = "UPSERT_SUCCEEDED";
    logStage(stage, context);
    stage = "CALLBACK_COMPLETED";
    logStage(stage, context);
    return Response.redirect(
      tiktokAppRedirect(
        config,
        stateRecord.returnPath,
        "connection_success",
        stateRecord.intent === "enable_publishing"
          ? token.grantedScopes.includes("video.publish")
            ? `tiktok-publishing-authorized:${account.id}`
            : `tiktok-publishing-required:${account.id}`
          : `tiktok:${account.id}`,
      ),
      302,
    );
  } catch (error) {
    stage = tiktokFailureStage(stage);
    logFailure(stage, error, context);
    const safe = safeConnectionError(error);
    const diagnostic = tiktokCallbackDiagnosticCode(stage, error);
    if (redirectConfig ?? config) {
      return Response.redirect(
        tiktokAppRedirect(
          redirectConfig ?? config!,
          "/dashboard/accounts",
          "tiktok_error",
          diagnostic,
        ),
        302,
      );
    }
    return Response.json({ error: { code: safe.code } }, {
      status: safe.status,
    });
  }
});
