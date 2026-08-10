import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ConnectionError } from "./connection-errors.ts";

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new ConnectionError("META_CONFIGURATION_MISSING", 500);
  return value;
}

export function createUserClient(request: Request): SupabaseClient {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new ConnectionError("AUTH_REQUIRED", 401);
  }
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createTrustedClient(): SupabaseClient {
  const secret = Deno.env.get("SUPABASE_SECRET_KEY")?.trim()
    || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!secret) throw new ConnectionError("META_CONFIGURATION_MISSING", 500);
  return createClient(env("SUPABASE_URL"), secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function trustedRpc<T>(
  client: SupabaseClient,
  functionName: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc(functionName, args);
  if (error) throw error;
  return data as T;
}
