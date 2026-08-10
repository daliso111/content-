import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseKey = (
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)?.trim();

let browserClient: SupabaseClient<Database> | null = null;

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function getSupabaseConfigurationError(): string | null {
  if (!supabaseUrl || !supabaseKey) {
    return "Supabase authentication is not configured. Add the public project URL and publishable key to .env.local, then restart the app.";
  }

  if (!isValidHttpUrl(supabaseUrl)) {
    return "NEXT_PUBLIC_SUPABASE_URL must be a valid HTTP or HTTPS URL.";
  }

  if (supabaseKey.startsWith("sb_secret_")) {
    return "A Supabase secret key cannot be used in the browser. Configure the public publishable key instead.";
  }

  return null;
}

export function getSupabaseResumableUploadEndpoint(): string {
  if (!supabaseUrl || !isValidHttpUrl(supabaseUrl)) {
    throw new Error("A valid Supabase project URL is required for uploads.");
  }

  const hostname = new URL(supabaseUrl).hostname.toLowerCase();
  const match = hostname.match(/^([a-z0-9-]+)\.supabase\.co$/);
  if (!match) {
    throw new Error(
      "Resumable uploads require a standard Supabase project URL.",
    );
  }

  return `https://${match[1]}.storage.supabase.co/storage/v1/upload/resumable`;
}

/** Returns the single browser client, or null when public configuration is missing. */
export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (getSupabaseConfigurationError()) return null;

  if (!browserClient) {
    browserClient = createClient<Database>(supabaseUrl!, supabaseKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return browserClient;
}
