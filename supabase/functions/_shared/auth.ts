import type { User } from "npm:@supabase/supabase-js@2";
import { ConnectionError } from "./connection-errors.ts";
import { createUserClient } from "./database.ts";

export async function requireUser(request: Request): Promise<User> {
  const client = createUserClient(request);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new ConnectionError("AUTH_REQUIRED", 401);
  return data.user;
}
