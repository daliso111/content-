import { ConnectionError } from "./connection-errors.ts";

export function allowedOrigins(): Set<string> {
  const configured = (Deno.env.get("ALLOWED_APP_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => {
      if (!origin) return false;
      try {
        return new URL(origin).origin === origin;
      } catch {
        return false;
      }
    });
  return new Set(configured);
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("Origin");
  if (!origin || !allowedOrigins().has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export function assertAllowedOrigin(request: Request): void {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins().has(origin)) {
    throw new ConnectionError("CORS_DENIED", 403);
  }
}

export function handleOptions(request: Request): Response | null {
  if (request.method !== "OPTIONS") return null;
  assertAllowedOrigin(request);
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
