import { ConnectionError } from "./connection-errors.ts";
import type { YouTubeConfig } from "./youtube-config.ts";

type Fetcher = typeof fetch;

export interface YouTubeTokenResult {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string | null;
  expiresAt: string | null;
  grantedScopes: string[];
}

export interface YouTubeChannel {
  platform: "youtube";
  accountType: "youtube_channel";
  platformAccountId: string;
  accountName: string;
  username: string | null;
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
  const valueText = text(value);
  return valueText && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(valueText)
    ? valueText
    : null;
}

function youtubeApiErrorName(body: Record<string, unknown>): string | null {
  const providerError = object(body.error);
  const status = providerErrorName(providerError.status);
  if (status) return status;
  const errors = Array.isArray(providerError.errors)
    ? providerError.errors
    : [];
  return providerErrorName(object(errors[0]).reason);
}

async function tokenRequest(
  config: YouTubeConfig,
  params: Record<string, string>,
  fetcher: Fetcher,
  invalidGrantCode:
    | "YOUTUBE_TOKEN_EXCHANGE_FAILED"
    | "YOUTUBE_REAUTHORIZATION_REQUIRED",
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        ...params,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => ({}));
    const body = object(payload);
    if (!response.ok || body.error) {
      const providerCode = providerErrorName(body.error);
      if (providerCode === "invalid_grant") {
        throw new ConnectionError(invalidGrantCode, 401, invalidGrantCode, {
          providerHttpStatus: response.status,
          providerErrorName: providerCode,
        });
      }
      throw new ConnectionError(
        "YOUTUBE_TOKEN_EXCHANGE_FAILED",
        502,
        "YOUTUBE_TOKEN_EXCHANGE_FAILED",
        {
          providerHttpStatus: response.status,
          providerErrorName: providerCode,
        },
      );
    }
    return body;
  } catch (error) {
    if (error instanceof ConnectionError) throw error;
    throw new ConnectionError(
      "YOUTUBE_TOKEN_EXCHANGE_FAILED",
      503,
      "YOUTUBE_TOKEN_EXCHANGE_FAILED",
      { providerHttpStatus: null, providerErrorName: null },
    );
  } finally {
    clearTimeout(timeout);
  }
}

function tokenResult(body: Record<string, unknown>): YouTubeTokenResult {
  const accessToken = text(body.access_token);
  if (!accessToken) {
    throw new ConnectionError("YOUTUBE_TOKEN_EXCHANGE_FAILED", 502);
  }
  const seconds = typeof body.expires_in === "number" && body.expires_in > 0
    ? body.expires_in
    : null;
  return {
    accessToken,
    refreshToken: text(body.refresh_token),
    tokenType: text(body.token_type),
    expiresAt: seconds
      ? new Date(Date.now() + seconds * 1000).toISOString()
      : null,
    grantedScopes: (text(body.scope) ?? "").split(/\s+/).filter(Boolean),
  };
}

export async function exchangeYouTubeAuthorizationCode(
  config: YouTubeConfig,
  code: string,
  fetcher: Fetcher = fetch,
): Promise<YouTubeTokenResult> {
  const body = await tokenRequest(
    config,
    {
      code,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    },
    fetcher,
    "YOUTUBE_TOKEN_EXCHANGE_FAILED",
  );
  return tokenResult(body);
}

export async function refreshYouTubeAccessToken(
  config: YouTubeConfig,
  refreshToken: string,
  fetcher: Fetcher = fetch,
): Promise<YouTubeTokenResult> {
  const body = await tokenRequest(
    config,
    {
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    },
    fetcher,
    "YOUTUBE_REAUTHORIZATION_REQUIRED",
  );
  return tokenResult(body);
}

function bestThumbnail(snippet: Record<string, unknown>): string | null {
  const thumbnails = object(snippet.thumbnails);
  for (const key of ["high", "medium", "default"]) {
    const url = text(object(thumbnails[key]).url);
    if (url) return url;
  }
  return null;
}

export async function discoverYouTubeChannel(
  accessToken: string,
  fetcher: Fetcher = fetch,
): Promise<YouTubeChannel> {
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.search = new URLSearchParams({
    part: "snippet",
    mine: "true",
    maxResults: "1",
  }).toString();
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
    if (!response.ok || body.error) {
      const diagnostics = {
        providerHttpStatus: response.status,
        providerErrorName: youtubeApiErrorName(body),
        discoveredChannels: null,
      };
      if (response.status === 401 || response.status === 403) {
        throw new ConnectionError(
          "YOUTUBE_REAUTHORIZATION_REQUIRED",
          401,
          "YOUTUBE_REAUTHORIZATION_REQUIRED",
          diagnostics,
        );
      }
      throw new ConnectionError(
        "YOUTUBE_PROVIDER_UNAVAILABLE",
        502,
        "YOUTUBE_PROVIDER_UNAVAILABLE",
        diagnostics,
      );
    }
    const channels = Array.isArray(body.items) ? body.items : [];
    const channel = object(channels[0]);
    const snippet = object(channel.snippet);
    const id = text(channel.id);
    const title = text(snippet.title);
    if (!id || !title) {
      throw new ConnectionError(
        "YOUTUBE_NO_CHANNEL",
        422,
        "YOUTUBE_NO_CHANNEL",
        {
          providerHttpStatus: response.status,
          providerErrorName: null,
          discoveredChannels: channels.length,
        },
      );
    }
    const customUrl = text(snippet.customUrl);
    return {
      platform: "youtube",
      accountType: "youtube_channel",
      platformAccountId: id,
      accountName: title,
      username: customUrl?.replace(/^@/, "") ?? null,
      profileImageUrl: bestThumbnail(snippet),
    };
  } catch (error) {
    if (error instanceof ConnectionError) throw error;
    throw new ConnectionError(
      "YOUTUBE_PROVIDER_UNAVAILABLE",
      503,
      "YOUTUBE_PROVIDER_UNAVAILABLE",
      {
        providerHttpStatus: null,
        providerErrorName: null,
        discoveredChannels: null,
      },
    );
  } finally {
    clearTimeout(timeout);
  }
}
