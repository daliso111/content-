import { ConnectionError } from "./connection-errors.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const META_RETURN_PATHS = new Set(["/dashboard/accounts"]);

export function requirePost(request: Request): void {
  if (request.method !== "POST") {
    throw new ConnectionError("METHOD_NOT_ALLOWED", 405);
  }
}

export async function readObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new ConnectionError("INVALID_REQUEST", 400);
  }
}

export function requireUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new ConnectionError("INVALID_REQUEST", 400);
  }
  return value;
}

export function validateReturnPath(value: unknown): string {
  const path = typeof value === "string" ? value : "/dashboard/accounts";
  if (!META_RETURN_PATHS.has(path)) {
    throw new ConnectionError("UNSAFE_RETURN_PATH", 400);
  }
  return path;
}

export function requireUniqueIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
    throw new ConnectionError("INVALID_ACCOUNT_SELECTION", 400);
  }
  const ids = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  if (ids.length !== value.length || new Set(ids).size !== ids.length) {
    throw new ConnectionError("INVALID_ACCOUNT_SELECTION", 400);
  }
  return ids;
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function requireOAuthState(value: string | null): string {
  if (!value || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new ConnectionError("INVALID_OAUTH_STATE", 400);
  }
  return value;
}
