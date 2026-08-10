import {
  ConnectionError,
  safeConnectionError,
  youtubeCallbackDiagnosticCode,
  type YouTubeCallbackStage,
} from "../_shared/connection-errors.ts";
import { createTrustedClient, trustedRpc } from "../_shared/database.ts";
import { encryptToken } from "../_shared/token-crypto.ts";
import { requireOAuthState, sha256Hex } from "../_shared/validation.ts";
import {
  discoverYouTubeChannel,
  exchangeYouTubeAuthorizationCode,
} from "../_shared/youtube-client.ts";
import {
  getYouTubeAppUrl,
  getYouTubeConfig,
  YOUTUBE_SCOPES,
  youtubeAppRedirect,
  type YouTubeConfig,
} from "../_shared/youtube-config.ts";

interface StateRecord {
  workspaceId: string;
  initiatedBy: string;
  returnPath: string;
}

interface DiagnosticContext {
  accessTokenPresent: boolean;
  refreshTokenPresent: boolean;
  discoveredChannels: number;
}

function logStage(
  stage: YouTubeCallbackStage,
  context?: Partial<DiagnosticContext>,
): void {
  console.info(JSON.stringify({ stage, ...context }));
}

function logFailure(
  stage: YouTubeCallbackStage,
  error: unknown,
  context: DiagnosticContext,
): void {
  const safe = safeConnectionError(error);
  console.error(JSON.stringify({
    stage,
    errorCode: safe.code,
    providerHttpStatus: safe.diagnostics.providerHttpStatus ?? null,
    providerErrorName: safe.diagnostics.providerErrorName ?? null,
    refreshTokenPresent: context.refreshTokenPresent,
    accessTokenPresent: context.accessTokenPresent,
    discoveredChannels: safe.diagnostics.discoveredChannels ??
      context.discoveredChannels,
  }));
}

Deno.serve(async (request) => {
  let config: YouTubeConfig | undefined;
  let redirectConfig: Pick<YouTubeConfig, "appUrl"> | undefined;
  let stage: YouTubeCallbackStage = "CALLBACK_RECEIVED";
  let failureLogged = false;
  const diagnosticContext: DiagnosticContext = {
    accessTokenPresent: false,
    refreshTokenPresent: false,
    discoveredChannels: 0,
  };
  logStage(stage);
  try {
    redirectConfig = { appUrl: getYouTubeAppUrl() };
    config = getYouTubeConfig();
    if (request.method !== "GET") {
      throw new ConnectionError("METHOD_NOT_ALLOWED", 405);
    }
    const url = new URL(request.url);
    const state = requireOAuthState(url.searchParams.get("state"));
    stage = "STATE_CONSUME_STARTED";
    logStage(stage);
    const stateRecord = await trustedRpc<StateRecord>(
      createTrustedClient(),
      "consume_youtube_oauth_state",
      { p_state_hash: await sha256Hex(state) },
    );
    stage = "STATE_CONSUMED";
    logStage(stage);
    if (url.searchParams.has("error")) {
      throw new ConnectionError("YOUTUBE_AUTHORIZATION_CANCELLED", 400);
    }
    const code = url.searchParams.get("code");
    if (!code) throw new ConnectionError("INVALID_REQUEST", 400);

    stage = "TOKEN_EXCHANGE_STARTED";
    logStage(stage);
    let token;
    try {
      token = await exchangeYouTubeAuthorizationCode(config, code);
      diagnosticContext.accessTokenPresent = Boolean(token.accessToken);
      diagnosticContext.refreshTokenPresent = Boolean(token.refreshToken);
      stage = "TOKEN_EXCHANGE_SUCCEEDED";
      logStage(stage, {
        accessTokenPresent: diagnosticContext.accessTokenPresent,
        refreshTokenPresent: diagnosticContext.refreshTokenPresent,
      });
    } catch (error) {
      stage = "TOKEN_EXCHANGE_FAILED";
      logFailure(stage, error, diagnosticContext);
      failureLogged = true;
      throw error;
    }

    stage = "CHANNEL_DISCOVERY_STARTED";
    logStage(stage, diagnosticContext);
    let channel;
    try {
      channel = await discoverYouTubeChannel(token.accessToken);
      diagnosticContext.discoveredChannels = 1;
      stage = "CHANNEL_DISCOVERY_SUCCEEDED";
      logStage(stage, {
        discoveredChannels: diagnosticContext.discoveredChannels,
      });
    } catch (error) {
      stage = "CHANNEL_DISCOVERY_FAILED";
      logFailure(stage, error, diagnosticContext);
      failureLogged = true;
      throw error;
    }

    stage = "TOKEN_ENCRYPTION_STARTED";
    logStage(stage, diagnosticContext);
    let encryptedAccess;
    let encryptedRefresh;
    try {
      encryptedAccess = await encryptToken(token.accessToken);
      encryptedRefresh = token.refreshToken
        ? await encryptToken(token.refreshToken)
        : null;
      stage = "TOKEN_ENCRYPTION_SUCCEEDED";
      logStage(stage, diagnosticContext);
    } catch (error) {
      logFailure(stage, error, diagnosticContext);
      failureLogged = true;
      throw error;
    }

    stage = "UPSERT_STARTED";
    logStage(stage, diagnosticContext);
    let account;
    try {
      account = await trustedRpc<{ id: string }>(
        createTrustedClient(),
        "upsert_youtube_connection",
        {
          p_workspace_id: stateRecord.workspaceId,
          p_actor_id: stateRecord.initiatedBy,
          p_connection: {
            ...channel,
            tokenType: token.tokenType,
            tokenExpiresAt: token.expiresAt,
            grantedScopes: token.grantedScopes.length > 0
              ? token.grantedScopes
              : [...YOUTUBE_SCOPES],
            encryptedAccessToken: encryptedAccess.ciphertext,
            accessTokenIv: encryptedAccess.iv,
            encryptedRefreshToken: encryptedRefresh?.ciphertext ?? null,
            refreshTokenIv: encryptedRefresh?.iv ?? null,
            metadata: {},
          },
        },
      );
      stage = "UPSERT_SUCCEEDED";
      logStage(stage, diagnosticContext);
    } catch (error) {
      stage = "UPSERT_FAILED";
      logFailure(stage, error, diagnosticContext);
      failureLogged = true;
      throw error;
    }

    stage = "CALLBACK_COMPLETED";
    logStage(stage, diagnosticContext);
    return Response.redirect(
      youtubeAppRedirect(
        config,
        stateRecord.returnPath,
        "connection_success",
        `youtube:${account.id}`,
      ),
      302,
    );
  } catch (error) {
    const safe = safeConnectionError(error);
    if (!failureLogged) logFailure(stage, error, diagnosticContext);
    const diagnosticCode = youtubeCallbackDiagnosticCode(stage, error);
    if (redirectConfig ?? config) {
      return Response.redirect(
        youtubeAppRedirect(
          redirectConfig ?? config!,
          "/dashboard/accounts",
          "youtube_error",
          diagnosticCode,
        ),
        302,
      );
    }
    return Response.json({ error: { code: safe.code } }, {
      status: safe.status,
    });
  }
});
