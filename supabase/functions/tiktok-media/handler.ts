import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createTrustedClient } from "../_shared/database.ts";
import {
  TikTokMediaTokenError,
  verifyTikTokMediaToken,
} from "../_shared/tiktok-media-token.ts";

const MEDIA_BUCKET = "postflow-media";
const DEPLOYED_ROUTE_PREFIX = "/functions/v1/tiktok-media/";
const LOCAL_ROUTE_PREFIX = "/tiktok-media/";
const RANGE_PATTERN = /^bytes=(?:\d+-\d*|\d*-\d+)$/;

export interface TikTokRelayMediaAsset {
  id: string;
  workspace_id: string;
  storage_bucket: string;
  storage_path: string;
  media_type: string;
  mime_type: string;
}

export interface TikTokMediaHandlerDependencies {
  env?: (name: string) => string | undefined;
  client?: SupabaseClient;
  findAsset?: (
    workspaceId: string,
    mediaAssetId: string,
  ) => Promise<TikTokRelayMediaAsset | null>;
  fetcher?: typeof fetch;
  nowSeconds?: number;
}

function errorResponse(code: string, status: number, allow?: string): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  if (allow) headers.set("Allow", allow);
  return new Response(JSON.stringify({ error: { code } }), { status, headers });
}

function routePath(request: Request): string | null {
  const pathname = new URL(request.url).pathname;
  for (const prefix of [DEPLOYED_ROUTE_PREFIX, LOCAL_ROUTE_PREFIX]) {
    if (pathname.startsWith(prefix)) return pathname.slice(prefix.length);
  }
  return null;
}

function safeVerificationFilename(value: string): boolean {
  return value.length > 0 && value.length <= 255 && value !== "." &&
    value !== ".." &&
    !value.includes("/") && !value.includes("\\") &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

function decodeSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function safeObjectPath(value: string): boolean {
  if (
    !value || value.length > 1024 || value.startsWith("/") ||
    value.includes("\\")
  ) {
    return false;
  }
  const segments = value.split("/");
  return segments.every((segment) =>
    segment && segment !== "." && segment !== ".."
  );
}

function validAsset(
  asset: TikTokRelayMediaAsset | null,
): asset is TikTokRelayMediaAsset {
  return !!asset && asset.storage_bucket === MEDIA_BUCKET &&
    asset.media_type === "video" && asset.mime_type.startsWith("video/") &&
    safeObjectPath(asset.storage_path);
}

function storageSecret(
  env: (name: string) => string | undefined,
): string | null {
  return env("SUPABASE_SECRET_KEY")?.trim() ||
    env("SUPABASE_SERVICE_ROLE_KEY")?.trim() || null;
}

function storageObjectUrl(
  supabaseUrl: string,
  storagePath: string,
): URL | null {
  let base: URL;
  try {
    base = new URL(supabaseUrl);
  } catch {
    return null;
  }
  if (
    !["http:", "https:"].includes(base.protocol) || base.username ||
    base.password
  ) {
    return null;
  }
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  return new URL(
    `/storage/v1/object/authenticated/${MEDIA_BUCKET}/${encodedPath}`,
    base,
  );
}

function safeUpstreamHeaders(upstream: Response): Headers {
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  for (
    const name of [
      "Content-Type",
      "Content-Length",
      "Content-Range",
      "Accept-Ranges",
      "ETag",
    ]
  ) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

export async function findTikTokRelayMediaAsset(
  client: SupabaseClient,
  workspaceId: string,
  mediaAssetId: string,
): Promise<TikTokRelayMediaAsset | null> {
  const { data, error } = await client.from("media_assets")
    .select("id,workspace_id,storage_bucket,storage_path,media_type,mime_type")
    .eq("id", mediaAssetId)
    .eq("workspace_id", workspaceId)
    .eq("storage_bucket", MEDIA_BUCKET)
    .eq("media_type", "video")
    .maybeSingle();
  if (error) throw new Error("TikTok relay media lookup failed.");
  return data as TikTokRelayMediaAsset | null;
}

async function verificationResponse(
  request: Request,
  path: string,
  env: (name: string) => string | undefined,
): Promise<Response | null> {
  if (path.includes("/")) return null;
  const requestedFilename = decodeSegment(path);
  const configuredFilename = env("TIKTOK_MEDIA_VERIFICATION_FILENAME")?.trim();
  const configuredContent = env("TIKTOK_MEDIA_VERIFICATION_CONTENT");
  if (
    !requestedFilename || !configuredFilename ||
    configuredContent === undefined ||
    !safeVerificationFilename(configuredFilename) ||
    requestedFilename !== configuredFilename
  ) {
    return null;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return errorResponse("METHOD_NOT_ALLOWED", 405, "GET, HEAD");
  }
  const bytes = new TextEncoder().encode(configuredContent);
  return new Response(request.method === "HEAD" ? null : bytes, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
    },
  });
}

export async function handleTikTokMediaRequest(
  request: Request,
  dependencies: TikTokMediaHandlerDependencies = {},
): Promise<Response> {
  const env = dependencies.env ?? ((name) => Deno.env.get(name));
  const path = routePath(request);
  if (path === null || !path) return errorResponse("NOT_FOUND", 404);

  const verification = await verificationResponse(request, path, env);
  if (verification) return verification;
  if (!path.startsWith("media/")) return errorResponse("NOT_FOUND", 404);
  if (request.method !== "GET" && request.method !== "HEAD") {
    return errorResponse("METHOD_NOT_ALLOWED", 405, "GET, HEAD");
  }

  const rawToken = path.slice("media/".length);
  if (!rawToken || rawToken.includes("/")) {
    return errorResponse("MEDIA_ACCESS_DENIED", 403);
  }
  const token = decodeSegment(rawToken);
  const signingKey = env("TIKTOK_MEDIA_SIGNING_KEY")?.trim();
  if (!token || !signingKey) {
    return errorResponse("MEDIA_RELAY_UNAVAILABLE", 503);
  }

  let payload;
  try {
    payload = await verifyTikTokMediaToken(
      token,
      signingKey,
      dependencies.nowSeconds ?? Math.floor(Date.now() / 1000),
    );
  } catch (error) {
    if (error instanceof TikTokMediaTokenError) {
      return errorResponse("MEDIA_ACCESS_DENIED", 403);
    }
    return errorResponse("MEDIA_RELAY_UNAVAILABLE", 503);
  }

  let asset: TikTokRelayMediaAsset | null;
  try {
    const findAsset = dependencies.findAsset ??
      ((workspaceId, mediaAssetId) =>
        findTikTokRelayMediaAsset(
          dependencies.client ?? createTrustedClient(),
          workspaceId,
          mediaAssetId,
        ));
    asset = await findAsset(payload.workspaceId, payload.mediaAssetId);
  } catch {
    return errorResponse("MEDIA_RELAY_UNAVAILABLE", 503);
  }
  if (!validAsset(asset)) return errorResponse("MEDIA_NOT_FOUND", 404);

  const range = request.headers.get("Range");
  if (range && !RANGE_PATTERN.test(range)) {
    return errorResponse("RANGE_NOT_SATISFIABLE", 416);
  }
  const secret = storageSecret(env);
  const objectUrl = storageObjectUrl(
    env("SUPABASE_URL")?.trim() ?? "",
    asset.storage_path,
  );
  if (!secret || !objectUrl) {
    return errorResponse("MEDIA_RELAY_UNAVAILABLE", 503);
  }

  const upstreamHeaders = new Headers({
    Accept: "*/*",
    apikey: secret,
    Authorization: `Bearer ${secret}`,
  });
  if (range) upstreamHeaders.set("Range", range);

  let upstream: Response;
  try {
    upstream = await (dependencies.fetcher ?? fetch)(objectUrl, {
      method: request.method,
      headers: upstreamHeaders,
      redirect: "manual",
    });
  } catch {
    return errorResponse("MEDIA_RELAY_UNAVAILABLE", 502);
  }
  if (upstream.status >= 300 && upstream.status < 400) {
    upstream.body?.cancel().catch(() => undefined);
    return errorResponse("MEDIA_RELAY_UNAVAILABLE", 502);
  }
  if (upstream.status === 404) {
    upstream.body?.cancel().catch(() => undefined);
    return errorResponse("MEDIA_NOT_FOUND", 404);
  }
  if (![200, 206].includes(upstream.status)) {
    upstream.body?.cancel().catch(() => undefined);
    return errorResponse("MEDIA_RELAY_UNAVAILABLE", 502);
  }

  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: safeUpstreamHeaders(upstream),
  });
}
