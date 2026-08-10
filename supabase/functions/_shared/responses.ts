import { corsHeaders } from "./cors.ts";
import { safeConnectionError } from "./connection-errors.ts";

export function requestId(request: Request): string {
  return request.headers.get("x-request-id")?.slice(0, 80) ?? crypto.randomUUID();
}

export function jsonResponse(
  request: Request,
  body: Record<string, unknown>,
  status = 200,
): Response {
  return Response.json(body, {
    status,
    headers: { ...corsHeaders(request), "Cache-Control": "no-store" },
  });
}

export function errorResponse(request: Request, error: unknown): Response {
  const safe = safeConnectionError(error);
  return jsonResponse(
    request,
    { error: { code: safe.code, requestId: requestId(request) } },
    safe.status,
  );
}
