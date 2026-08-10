import { allowedOrigins } from "./cors.ts";
import { ConnectionError } from "./connection-errors.ts";

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.upload",
] as const;

export interface YouTubeConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  appUrl: URL;
}

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new ConnectionError("YOUTUBE_CONFIGURATION_MISSING", 500);
  return value;
}

export function getYouTubeConfig(): YouTubeConfig {
  try {
    const redirectUri = new URL(required("YOUTUBE_OAUTH_REDIRECT_URI"));
    const appUrl = getYouTubeAppUrl();
    if (redirectUri.protocol !== "https:") throw new Error();
    return {
      clientId: required("YOUTUBE_CLIENT_ID"),
      clientSecret: required("YOUTUBE_CLIENT_SECRET"),
      redirectUri: redirectUri.toString(),
      appUrl,
    };
  } catch (error) {
    if (error instanceof ConnectionError) throw error;
    throw new ConnectionError("YOUTUBE_CONFIGURATION_MISSING", 500);
  }
}

export function getYouTubeAppUrl(): URL {
  try {
    const appUrl = new URL(required("POSTFLOW_APP_URL"));
    if (!["http:", "https:"].includes(appUrl.protocol)) throw new Error();
    if (!allowedOrigins().has(appUrl.origin)) throw new Error();
    return appUrl;
  } catch (error) {
    if (error instanceof ConnectionError) throw error;
    throw new ConnectionError("YOUTUBE_CONFIGURATION_MISSING", 500);
  }
}

export function buildYouTubeAuthorizationUrl(
  config: YouTubeConfig,
  state: string,
): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPES.join(" "),
    state,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  }).toString();
  return url.toString();
}

export function youtubeAppRedirect(
  config: Pick<YouTubeConfig, "appUrl">,
  path: string,
  key: string,
  value: string,
): URL {
  const redirect = new URL(path, config.appUrl.origin);
  redirect.searchParams.set(key, value);
  return redirect;
}
