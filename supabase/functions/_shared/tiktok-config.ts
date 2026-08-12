import { allowedOrigins } from "./cors.ts";
import { ConnectionError } from "./connection-errors.ts";

export const TIKTOK_CONNECTION_SCOPES = ["user.info.basic"] as const;
export const TIKTOK_PUBLISHING_AUTHORIZATION_SCOPES = [
  "user.info.basic",
  "video.publish",
] as const;

export type TikTokOAuthIntent = "connect" | "enable_publishing";

export function isTikTokOAuthIntent(
  value: unknown,
): value is TikTokOAuthIntent {
  return value === "connect" || value === "enable_publishing";
}

export function tiktokScopesForIntent(
  intent: TikTokOAuthIntent,
): readonly string[] {
  return intent === "enable_publishing"
    ? TIKTOK_PUBLISHING_AUTHORIZATION_SCOPES
    : TIKTOK_CONNECTION_SCOPES;
}

export interface TikTokConfig {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
  appUrl: URL;
}

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new ConnectionError("TIKTOK_CONFIGURATION_MISSING", 500);
  return value;
}

export function getTikTokAppUrl(): URL {
  try {
    const appUrl = new URL(required("TOWKN_APP_URL"));
    if (!["http:", "https:"].includes(appUrl.protocol)) throw new Error();
    if (!allowedOrigins().has(appUrl.origin)) throw new Error();
    return appUrl;
  } catch (error) {
    if (error instanceof ConnectionError) throw error;
    throw new ConnectionError("TIKTOK_CONFIGURATION_MISSING", 500);
  }
}

export function getTikTokConfig(): TikTokConfig {
  try {
    const redirectUri = new URL(required("TIKTOK_OAUTH_REDIRECT_URI"));
    if (redirectUri.protocol !== "https:") throw new Error();
    return {
      clientKey: required("TIKTOK_CLIENT_KEY"),
      clientSecret: required("TIKTOK_CLIENT_SECRET"),
      redirectUri: redirectUri.toString(),
      appUrl: getTikTokAppUrl(),
    };
  } catch (error) {
    if (error instanceof ConnectionError) throw error;
    throw new ConnectionError("TIKTOK_CONFIGURATION_MISSING", 500);
  }
}

export function buildTikTokAuthorizationUrl(
  config: TikTokConfig,
  state: string,
  intent: TikTokOAuthIntent = "connect",
): string {
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.search = new URLSearchParams({
    client_key: config.clientKey,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: tiktokScopesForIntent(intent).join(","),
    state,
  }).toString();
  return url.toString();
}

export function tiktokAppRedirect(
  config: Pick<TikTokConfig, "appUrl">,
  path: string,
  key: string,
  value: string,
): URL {
  const redirect = new URL(path, config.appUrl.origin);
  redirect.searchParams.set(key, value);
  return redirect;
}
