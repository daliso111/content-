const UPSTREAM_ORIGIN = "https://flipkskpaepmdvoypqca.supabase.co";
const UPSTREAM_PREFIX = "/functions/v1/tiktok-media";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,2048}\.[A-Za-z0-9_-]{43}$/;

function errorResponse(
  code: string,
  status: number,
  method: string,
  allow?: string,
): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (allow) headers.set("Allow", allow);
  return new Response(
    method === "HEAD" ? null : JSON.stringify({ error: { code } }),
    { status, headers },
  );
}

function mediaToken(pathname: string): string | null {
  if (!pathname.startsWith("/media/")) return null;
  const encoded = pathname.slice("/media/".length);
  if (!encoded || encoded.includes("/")) return null;
  let token: string;
  try {
    token = decodeURIComponent(encoded);
  } catch {
    return null;
  }
  return TOKEN_PATTERN.test(token) ? token : null;
}

function responseHeaders(upstream: Response): Headers {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
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

export async function handleTikTokMediaProxyRequest(
  request: Request,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const token = mediaToken(new URL(request.url).pathname);
  if (!token) return errorResponse("NOT_FOUND", 404, request.method);
  if (request.method !== "GET" && request.method !== "HEAD") {
    return errorResponse(
      "METHOD_NOT_ALLOWED",
      405,
      request.method,
      "GET, HEAD",
    );
  }

  const upstreamUrl = new URL(
    `${UPSTREAM_PREFIX}/media/${encodeURIComponent(token)}`,
    UPSTREAM_ORIGIN,
  );
  const headers = new Headers({ Accept: "*/*" });
  const range = request.headers.get("Range");
  if (range) headers.set("Range", range);

  let upstream: Response;
  try {
    upstream = await fetcher(upstreamUrl, {
      method: request.method,
      headers,
      redirect: "manual",
    });
  } catch {
    return errorResponse("MEDIA_PROXY_UNAVAILABLE", 502, request.method);
  }
  if (upstream.status >= 300 && upstream.status < 400) {
    upstream.body?.cancel().catch(() => undefined);
    return errorResponse("MEDIA_PROXY_UNAVAILABLE", 502, request.method);
  }
  if (upstream.status !== 200 && upstream.status !== 206) {
    const status = upstream.status >= 400 && upstream.status <= 599
      ? upstream.status
      : 502;
    upstream.body?.cancel().catch(() => undefined);
    return errorResponse("MEDIA_UNAVAILABLE", status, request.method);
  }

  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders(upstream),
  });
}

export default {
  fetch(request: Request): Promise<Response> {
    return handleTikTokMediaProxyRequest(request);
  },
};
