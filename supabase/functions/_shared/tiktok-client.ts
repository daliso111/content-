import { ConnectionError } from "./connection-errors.ts";
import {
  TIKTOK_CONNECTION_SCOPES,
  type TikTokConfig,
} from "./tiktok-config.ts";

type Fetcher = typeof fetch;

export interface TikTokTokenResult {
  accessToken: string;
  refreshToken: string;
  tokenType: string | null;
  openId: string;
  expiresAt: string;
  refreshExpiresAt: string;
  grantedScopes: string[];
}

export interface TikTokUser {
  platform: "tiktok";
  accountType: "tiktok_user";
  platformAccountId: string;
  accountName: string;
  username: null;
  profileImageUrl: string | null;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function providerErrorName(value: unknown): string | null {
  const candidate = text(value);
  return candidate && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(candidate)
    ? candidate
    : null;
}

function scopes(value: unknown): string[] {
  return [...new Set((text(value) ?? "").split(/[\s,]+/).filter(Boolean))];
}

function positiveSeconds(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

async function tokenRequest(
  config: TikTokConfig,
  params: Record<string, string>,
  fetcher: Fetcher,
  refreshing: boolean,
): Promise<TikTokTokenResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(
      "https://open.tiktokapis.com/v2/oauth/token/",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          ...params,
          client_key: config.clientKey,
          client_secret: config.clientSecret,
        }),
        signal: controller.signal,
      },
    );
    const payload: unknown = await response.json().catch(() => ({}));
    const body = object(payload);
    const providerCode = providerErrorName(body.error);
    if (!response.ok || providerCode) {
      const code = refreshing && providerCode === "invalid_grant"
        ? "TIKTOK_REAUTHORIZATION_REQUIRED"
        : refreshing
        ? "TIKTOK_PROVIDER_UNAVAILABLE"
        : "TIKTOK_TOKEN_EXCHANGE_FAILED";
      throw new ConnectionError(
        code,
        code === "TIKTOK_REAUTHORIZATION_REQUIRED" ? 401 : 502,
        code,
        {
          providerHttpStatus: response.status,
          providerErrorName: providerCode,
        },
      );
    }
    return validateTokenResponse(body);
  } catch (error) {
    if (error instanceof ConnectionError) throw error;
    throw new ConnectionError(
      refreshing
        ? "TIKTOK_PROVIDER_UNAVAILABLE"
        : "TIKTOK_TOKEN_EXCHANGE_FAILED",
      503,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function validateTokenResponse(
  body: Record<string, unknown>,
): TikTokTokenResult {
  const accessToken = text(body.access_token);
  const refreshToken = text(body.refresh_token);
  const openId = text(body.open_id);
  const expiresIn = positiveSeconds(body.expires_in);
  const refreshExpiresIn = positiveSeconds(body.refresh_expires_in);
  const grantedScopes = scopes(body.scope);
  if (!accessToken || !openId || !expiresIn || !refreshExpiresIn) {
    throw new ConnectionError("TIKTOK_TOKEN_RESPONSE_INVALID", 502);
  }
  if (!refreshToken) {
    throw new ConnectionError("TIKTOK_REFRESH_TOKEN_REQUIRED", 502);
  }
  if (
    !TIKTOK_CONNECTION_SCOPES.every((scope) => grantedScopes.includes(scope))
  ) {
    throw new ConnectionError("TIKTOK_REQUIRED_SCOPE_MISSING", 403);
  }
  const now = Date.now();
  return {
    accessToken,
    refreshToken,
    tokenType: text(body.token_type),
    openId,
    expiresAt: new Date(now + expiresIn * 1000).toISOString(),
    refreshExpiresAt: new Date(now + refreshExpiresIn * 1000).toISOString(),
    grantedScopes,
  };
}

export function exchangeTikTokAuthorizationCode(
  config: TikTokConfig,
  code: string,
  fetcher: Fetcher = fetch,
): Promise<TikTokTokenResult> {
  return tokenRequest(
    config,
    {
      code,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    },
    fetcher,
    false,
  );
}

export function refreshTikTokAccessToken(
  config: TikTokConfig,
  refreshToken: string,
  fetcher: Fetcher = fetch,
): Promise<TikTokTokenResult> {
  return tokenRequest(
    config,
    {
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    },
    fetcher,
    true,
  );
}

export async function discoverTikTokUser(
  accessToken: string,
  expectedOpenId: string,
  fetcher: Fetcher = fetch,
): Promise<TikTokUser> {
  const url = new URL("https://open.tiktokapis.com/v2/user/info/");
  url.searchParams.set("fields", "open_id,avatar_url,display_name");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => ({}));
    const body = object(payload);
    const apiError = object(body.error);
    const errorCode = providerErrorName(apiError.code);
    if (!response.ok || (errorCode && errorCode !== "ok")) {
      const authFailure = response.status === 401 || response.status === 403;
      throw new ConnectionError(
        authFailure
          ? "TIKTOK_REAUTHORIZATION_REQUIRED"
          : "TIKTOK_PROFILE_DISCOVERY_FAILED",
        authFailure ? 401 : 502,
        undefined,
        { providerHttpStatus: response.status, providerErrorName: errorCode },
      );
    }
    const user = object(object(body.data).user);
    const openId = text(user.open_id);
    if (!openId) {
      throw new ConnectionError("TIKTOK_PROFILE_DISCOVERY_FAILED", 502);
    }
    if (openId !== expectedOpenId) {
      throw new ConnectionError("TIKTOK_OPEN_ID_MISMATCH", 409);
    }
    return {
      platform: "tiktok",
      accountType: "tiktok_user",
      platformAccountId: openId,
      accountName: text(user.display_name) ?? "TikTok account",
      username: null,
      profileImageUrl: text(user.avatar_url),
    };
  } catch (error) {
    if (error instanceof ConnectionError) throw error;
    throw new ConnectionError("TIKTOK_PROFILE_DISCOVERY_FAILED", 503);
  } finally {
    clearTimeout(timeout);
  }
}

export async function revokeTikTokAuthorization(
  config: TikTokConfig,
  accessToken: string,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(
      "https://open.tiktokapis.com/v2/oauth/revoke/",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_key: config.clientKey,
          client_secret: config.clientSecret,
          token: accessToken,
        }),
        signal: controller.signal,
      },
    );
    const payload: unknown = await response.json().catch(() => ({}));
    const body = object(payload);
    const providerCode = providerErrorName(body.error) ??
      providerErrorName(object(body.error).code);
    if (!response.ok || (providerCode && providerCode !== "ok")) {
      throw new ConnectionError("TIKTOK_REVOCATION_FAILED", 502, undefined, {
        providerHttpStatus: response.status,
        providerErrorName: providerCode,
      });
    }
  } catch (error) {
    if (error instanceof ConnectionError) throw error;
    throw new ConnectionError("TIKTOK_REVOCATION_FAILED", 503);
  } finally {
    clearTimeout(timeout);
  }
}
