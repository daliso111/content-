import { ConnectionError } from "./connection-errors.ts";
import { allowedOrigins } from "./cors.ts";

const REQUIRED_META_SCOPES = {
  facebook: ["pages_show_list", "pages_read_engagement", "pages_manage_posts"],
  instagram: [
    "pages_show_list",
    "pages_read_engagement",
    "instagram_basic",
    "instagram_content_publish",
  ],
} as const;

export function missingMetaScopes(
  platform: "facebook" | "instagram",
  grantedScopes: readonly string[],
): string[] {
  const granted = new Set(grantedScopes);
  return REQUIRED_META_SCOPES[platform].filter((scope) => !granted.has(scope));
}

export interface MetaConfig {
  appId: string;
  appSecret: string;
  loginConfigId: string;
  graphVersion: string;
  redirectUri: string;
  appUrl: URL;
}

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new ConnectionError("META_CONFIGURATION_MISSING", 500);
  return value;
}

export function getMetaConfig(): MetaConfig {
  const graphVersion = required("META_GRAPH_API_VERSION");
  const loginConfigId = required("META_LOGIN_CONFIG_ID");
  if (!/^v\d+\.\d+$/.test(graphVersion)) {
    throw new ConnectionError("META_CONFIGURATION_MISSING", 500);
  }
  if (!/^\d+$/.test(loginConfigId)) {
    throw new ConnectionError("META_CONFIGURATION_MISSING", 500);
  }
  try {
    const redirectUri = new URL(required("META_OAUTH_REDIRECT_URI"));
    const appUrl = new URL(required("POSTFLOW_APP_URL"));
    if (redirectUri.protocol !== "https:" || !["http:", "https:"].includes(appUrl.protocol)) {
      throw new Error();
    }
    if (!allowedOrigins().has(appUrl.origin)) {
      throw new Error();
    }
    return {
      appId: required("META_APP_ID"),
      appSecret: required("META_APP_SECRET"),
      loginConfigId,
      graphVersion,
      redirectUri: redirectUri.toString(),
      appUrl,
    };
  } catch {
    throw new ConnectionError("META_CONFIGURATION_MISSING", 500);
  }
}

export function buildMetaAuthorizationUrl(config: MetaConfig, state: string): string {
  const url = new URL(`https://www.facebook.com/${config.graphVersion}/dialog/oauth`);
  url.search = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    state,
    response_type: "code",
    config_id: config.loginConfigId,
    override_default_response_type: "true",
  }).toString();
  return url.toString();
}

export function appRedirect(config: MetaConfig, path: string, key: string, value: string): URL {
  const redirect = new URL(path, config.appUrl.origin);
  redirect.searchParams.set(key, value);
  return redirect;
}
