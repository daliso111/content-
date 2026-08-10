import { ConnectionError } from "./connection-errors.ts";
import type { MetaConfig } from "./meta-config.ts";

export type MetaPlatform = "facebook" | "instagram";
export type MetaAccountType = "facebook_page" | "instagram_business" | "instagram_creator";

export interface MetaConnectionOption {
  platform: MetaPlatform;
  platformAccountId: string;
  accountName: string;
  username: string | null;
  profileImageUrl: string | null;
  accountType: MetaAccountType;
  parentPageId: string | null;
}

export interface MetaDestination extends MetaConnectionOption {
  accessToken: string;
}

interface TokenResult {
  accessToken: string;
  tokenType: string | null;
  expiresAt: string | null;
}

type Fetcher = typeof fetch;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function graphRequest(
  config: MetaConfig,
  path: string,
  params: Record<string, string>,
  accessToken: string,
  fetcher: Fetcher,
): Promise<Record<string, unknown>> {
  const url = new URL(`https://graph.facebook.com/${config.graphVersion}/${path.replace(/^\//, "")}`);
  url.search = new URLSearchParams(params).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => ({}));
    const body = object(payload);
    if (!response.ok || body.error) {
      const providerError = object(body.error);
      const providerCode = typeof providerError.code === "number" ? providerError.code : null;
      if (providerCode === 190) throw new ConnectionError("TOKEN_EXPIRED", 401);
      throw new ConnectionError("META_PROVIDER_UNAVAILABLE", 502);
    }
    return body;
  } catch (error) {
    if (error instanceof ConnectionError) throw error;
    throw new ConnectionError("META_PROVIDER_UNAVAILABLE", 503);
  } finally {
    clearTimeout(timeout);
  }
}

async function oauthTokenRequest(
  config: MetaConfig,
  params: Record<string, string>,
  fetcher: Fetcher,
): Promise<Record<string, unknown>> {
  const url = new URL(`https://graph.facebook.com/${config.graphVersion}/oauth/access_token`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => ({}));
    const body = object(payload);
    if (!response.ok || body.error) {
      throw new ConnectionError("META_TOKEN_EXCHANGE_FAILED", 502);
    }
    return body;
  } catch (error) {
    if (error instanceof ConnectionError) throw error;
    throw new ConnectionError("META_TOKEN_EXCHANGE_FAILED", 503);
  } finally {
    clearTimeout(timeout);
  }
}

export async function exchangeAuthorizationCode(
  config: MetaConfig,
  code: string,
  fetcher: Fetcher = fetch,
): Promise<TokenResult> {
  try {
    const shortLived = await oauthTokenRequest(config, {
      client_id: config.appId,
      client_secret: config.appSecret,
      redirect_uri: config.redirectUri,
      code,
    }, fetcher);
    const shortToken = text(shortLived.access_token);
    if (!shortToken) throw new Error();
    const longLived = await oauthTokenRequest(config, {
      grant_type: "fb_exchange_token",
      client_id: config.appId,
      client_secret: config.appSecret,
      fb_exchange_token: shortToken,
    }, fetcher);
    const accessToken = text(longLived.access_token);
    if (!accessToken) throw new Error();
    const seconds = typeof longLived.expires_in === "number" ? longLived.expires_in : null;
    return {
      accessToken,
      tokenType: text(longLived.token_type),
      expiresAt: seconds ? new Date(Date.now() + seconds * 1000).toISOString() : null,
    };
  } catch (error) {
    if (error instanceof ConnectionError && error.code === "META_TOKEN_EXCHANGE_FAILED") throw error;
    throw new ConnectionError("META_TOKEN_EXCHANGE_FAILED", 502);
  }
}

export async function getGrantedScopes(
  config: MetaConfig,
  accessToken: string,
  fetcher: Fetcher = fetch,
): Promise<string[]> {
  const result = await graphRequest(config, "me/permissions", {}, accessToken, fetcher);
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows.map(object)
    .filter((row) => row.status === "granted")
    .map((row) => text(row.permission))
    .filter((scope): scope is string => Boolean(scope));
}

function profileUrl(value: unknown): string | null {
  return text(object(object(value).data).url);
}

function instagramType(value: unknown): MetaAccountType | null {
  const normalized = text(value)?.toUpperCase();
  if (normalized === "BUSINESS") return "instagram_business";
  if (normalized === "CREATOR" || normalized === "MEDIA_CREATOR") return "instagram_creator";
  return null;
}

function linkedInstagramDestination(
  pageId: string,
  pageToken: string,
  value: unknown,
): MetaDestination | null {
  const instagram = object(value);
  const instagramId = text(instagram.id);
  if (!instagramId) return null;

  const rawAccountType = text(instagram.account_type);
  const accountType = instagramType(rawAccountType);
  // instagram_business_account is only populated for linked Professional
  // accounts. Some Graph responses omit account_type; retain an explicit
  // unsupported value as ineligible, but accept an omitted value safely.
  if (rawAccountType && !accountType) return null;
  const username = text(instagram.username);
  return {
    platform: "instagram",
    platformAccountId: instagramId,
    accountName: username ?? text(instagram.name) ?? "Instagram account",
    username,
    profileImageUrl: text(instagram.profile_picture_url),
    accountType: accountType ?? "instagram_business",
    parentPageId: pageId,
    accessToken: pageToken,
  };
}

export async function discoverLinkedInstagramDestination(
  config: MetaConfig,
  pageId: string,
  pageAccessToken: string,
  fetcher: Fetcher = fetch,
): Promise<MetaDestination | null> {
  const page = await graphRequest(config, pageId, {
    fields: "id,name,instagram_business_account{id,username,name}",
  }, pageAccessToken, fetcher);
  let instagram = object(page.instagram_business_account);
  let instagramId = text(instagram.id);
  if (!instagramId) {
    try {
      const fallbackPage = await graphRequest(config, pageId, {
        fields: "id,name,connected_instagram_account{id,username,name}",
      }, pageAccessToken, fetcher);
      instagram = object(fallbackPage.connected_instagram_account);
      instagramId = text(instagram.id);
    } catch {
      // This Page field is not available for every Meta app/API version. The
      // standard instagram_business_account result remains authoritative, and
      // absence of an optional fallback must not break Facebook refresh.
      return null;
    }
  }
  if (!instagramId) return null;

  // The Page relationship is sufficient to create the connection. Optional
  // profile enrichment must never make a confirmed relationship fail.
  if (!text(instagram.username) && !text(instagram.name)) {
    try {
      const details = await graphRequest(config, instagramId, {
        fields: "id,username,name,profile_picture_url",
      }, pageAccessToken, fetcher);
      instagram = { ...instagram, ...details };
    } catch {
      // Retain the relationship ID and use a safe fallback display name.
    }
  }
  return linkedInstagramDestination(pageId, pageAccessToken, instagram);
}

export async function discoverMetaDestinations(
  config: MetaConfig,
  userAccessToken: string,
  fetcher: Fetcher = fetch,
): Promise<MetaDestination[]> {
  const pages: Record<string, unknown>[] = [];
  let after: string | null = null;
  for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
    const params: Record<string, string> = {
      fields: "id,name,username,access_token,picture{url}",
      limit: "100",
    };
    if (after) params.after = after;
    const result = await graphRequest(config, "me/accounts", params, userAccessToken, fetcher);
    pages.push(...(Array.isArray(result.data) ? result.data.map(object) : []));
    after = text(object(object(result.paging).cursors).after);
    if (!after) break;
    if (pageNumber === 9) throw new ConnectionError("META_PROVIDER_UNAVAILABLE", 422);
  }
  if (pages.length === 0) throw new ConnectionError("META_NO_MANAGED_PAGES", 422);

  const destinations: MetaDestination[] = [];
  for (const page of pages) {
    const pageId = text(page.id);
    const pageName = text(page.name);
    const pageToken = text(page.access_token);
    if (!pageId || !pageName || !pageToken) continue;
    destinations.push({
      platform: "facebook",
      platformAccountId: pageId,
      accountName: pageName,
      username: text(page.username),
      profileImageUrl: profileUrl(page.picture),
      accountType: "facebook_page",
      parentPageId: null,
      accessToken: pageToken,
    });

    const instagram = await discoverLinkedInstagramDestination(
      config, pageId, pageToken, fetcher,
    );
    if (instagram) destinations.push(instagram);
  }
  if (destinations.length === 0) throw new ConnectionError("META_NO_MANAGED_PAGES", 422);
  return destinations;
}

export function sanitizeDestinations(destinations: MetaDestination[]): MetaConnectionOption[] {
  return destinations.map(({ accessToken: _accessToken, ...option }) => option);
}

export async function refreshDestination(
  config: MetaConfig,
  platform: MetaPlatform,
  accountId: string,
  accessToken: string,
  fetcher: Fetcher = fetch,
): Promise<Pick<MetaConnectionOption, "accountName" | "username" | "profileImageUrl">> {
  const fields = platform === "facebook"
    ? "id,name,username,picture{url}"
    : "id,username,name,profile_picture_url";
  const result = await graphRequest(config, accountId, { fields }, accessToken, fetcher);
  return {
    accountName: text(result.name) ?? text(result.username) ?? "Meta account",
    username: text(result.username),
    profileImageUrl: platform === "facebook" ? profileUrl(result.picture) : text(result.profile_picture_url),
  };
}
