const DEFAULT_VIDEO_TTL_SECONDS = 21_600;
const MIN_TTL_SECONDS = 300;
const MAX_TTL_SECONDS = 86_400;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_PART_PATTERN = /^[A-Za-z0-9_-]+$/;

export interface TikTokMediaTokenPayload {
  workspaceId: string;
  mediaAssetId: string;
  expiresAt: number;
}

interface EncodedTikTokMediaTokenPayload {
  v: 1;
  w: string;
  m: string;
  exp: number;
}

export class TikTokMediaTokenError extends Error {
  constructor() {
    super("TikTok media token is invalid.");
  }
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(
    /=+$/g,
    "",
  );
}

function decodeBase64Url(value: string): Uint8Array {
  if (!value || !TOKEN_PART_PATTERN.test(value)) {
    throw new TikTokMediaTokenError();
  }
  const standard = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new TikTokMediaTokenError();
  }
}

function requireSigningKey(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length < 32) throw new TikTokMediaTokenError();
  return bytes;
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function requireUuid(value: string): string {
  if (!UUID_PATTERN.test(value)) throw new TikTokMediaTokenError();
  return value.toLowerCase();
}

function relayOrigin(value: string, requireHttps: boolean): URL {
  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw new TikTokMediaTokenError();
  }
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    (requireHttps && origin.protocol !== "https:") || origin.username ||
    origin.password || origin.pathname !== "/" || origin.search || origin.hash
  ) {
    throw new TikTokMediaTokenError();
  }
  return origin;
}

async function importSigningKey(value: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    arrayBuffer(requireSigningKey(value)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export function resolveTikTokMediaTtlSeconds(
  configured = Deno.env.get("PUBLISHING_VIDEO_URL_TTL_SECONDS"),
): number {
  const parsed = Number(configured);
  return Number.isInteger(parsed) && parsed >= MIN_TTL_SECONDS &&
      parsed <= MAX_TTL_SECONDS
    ? parsed
    : DEFAULT_VIDEO_TTL_SECONDS;
}

export async function signTikTokMediaToken(
  payload: TikTokMediaTokenPayload,
  signingKey: string,
): Promise<string> {
  const encodedPayload: EncodedTikTokMediaTokenPayload = {
    v: 1,
    w: requireUuid(payload.workspaceId),
    m: requireUuid(payload.mediaAssetId),
    exp: payload.expiresAt,
  };
  if (!Number.isSafeInteger(encodedPayload.exp) || encodedPayload.exp <= 0) {
    throw new TikTokMediaTokenError();
  }
  const payloadBytes = new TextEncoder().encode(JSON.stringify(encodedPayload));
  const payloadPart = encodeBase64Url(payloadBytes);
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importSigningKey(signingKey),
    new TextEncoder().encode(payloadPart),
  );
  return `${payloadPart}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyTikTokMediaToken(
  token: string,
  signingKey: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<TikTokMediaTokenPayload> {
  const parts = token.split(".");
  if (parts.length !== 2) throw new TikTokMediaTokenError();
  const [payloadPart, signaturePart] = parts;
  const verified = await crypto.subtle.verify(
    "HMAC",
    await importSigningKey(signingKey),
    arrayBuffer(decodeBase64Url(signaturePart)),
    new TextEncoder().encode(payloadPart),
  ).catch(() => false);
  if (!verified) throw new TikTokMediaTokenError();

  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadPart)));
  } catch {
    throw new TikTokMediaTokenError();
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TikTokMediaTokenError();
  }
  const payload = value as Partial<EncodedTikTokMediaTokenPayload>;
  if (
    payload.v !== 1 || typeof payload.w !== "string" ||
    typeof payload.m !== "string" || !Number.isSafeInteger(payload.exp) ||
    (payload.exp as number) <= nowSeconds
  ) {
    throw new TikTokMediaTokenError();
  }
  return {
    workspaceId: requireUuid(payload.w),
    mediaAssetId: requireUuid(payload.m),
    expiresAt: payload.exp as number,
  };
}

export async function generateTikTokMediaRelayUrl(
  workspaceId: string,
  mediaAssetId: string,
  options: {
    supabaseUrl?: string;
    publicBaseUrl?: string;
    signingKey?: string;
    ttlSeconds?: number;
    nowSeconds?: number;
  } = {},
): Promise<string> {
  const configuredPublicBaseUrl = options.publicBaseUrl ??
    Deno.env.get("TIKTOK_MEDIA_PUBLIC_BASE_URL")?.trim();
  const supabaseUrl = options.supabaseUrl ??
    Deno.env.get("SUPABASE_URL")?.trim();
  const signingKey = options.signingKey ??
    Deno.env.get("TIKTOK_MEDIA_SIGNING_KEY")?.trim();
  if (!signingKey || (!configuredPublicBaseUrl && !supabaseUrl)) {
    throw new TikTokMediaTokenError();
  }
  const usesPublicBaseUrl = !!configuredPublicBaseUrl;
  const origin = relayOrigin(
    usesPublicBaseUrl ? configuredPublicBaseUrl! : supabaseUrl!,
    usesPublicBaseUrl,
  );
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ttlSeconds = options.ttlSeconds ?? resolveTikTokMediaTtlSeconds();
  if (
    !Number.isInteger(ttlSeconds) || ttlSeconds < MIN_TTL_SECONDS ||
    ttlSeconds > MAX_TTL_SECONDS
  ) {
    throw new TikTokMediaTokenError();
  }
  const token = await signTikTokMediaToken({
    workspaceId,
    mediaAssetId,
    expiresAt: nowSeconds + ttlSeconds,
  }, signingKey);
  const path = usesPublicBaseUrl
    ? `/media/${encodeURIComponent(token)}`
    : `/functions/v1/tiktok-media/media/${encodeURIComponent(token)}`;
  return new URL(path, origin).toString();
}
