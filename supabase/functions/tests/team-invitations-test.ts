import {
  assert, assertEquals, assertRejects, assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";
import { assertAllowedOrigin } from "../_shared/cors.ts";
import { safeConnectionError } from "../_shared/connection-errors.ts";
import {
  assertAssignableRole, assertResendWindow, findAuthUserByEmail,
  invitationRedirect, isEstablishedAuthUser, normalizeEmail,
  randomInvitationToken, safeInvitationResult,
} from "../_shared/team-invitations.ts";

function fakeAdmin(users: User[], error: Error | null = null): SupabaseClient {
  return { auth: { admin: { listUsers: () => Promise.resolve({ data: { users }, error }) } } } as unknown as SupabaseClient;
}

Deno.test("missing JWT is rejected before a database request", async () => {
  await assertRejects(() => requireUser(new Request("https://example.test")), Error, "AUTH_REQUIRED");
});

Deno.test("invalid JWT failures are redacted", () => {
  const safe = safeConnectionError(new Error("invalid JWT with secret payload"));
  assertEquals(safe.code, "INTERNAL_ERROR");
  assert(!safe.message.includes("secret payload"));
});

Deno.test("viewer cannot invite and administrator cannot invite owner", () => {
  assertThrows(() => assertAssignableRole("viewer", "viewer"), Error, "TEAM_PERMISSION_DENIED");
  assertThrows(() => assertAssignableRole("administrator", "owner"), Error, "ROLE_ASSIGNMENT_DENIED");
  assertAssignableRole("administrator", "viewer");
  assertAssignableRole("owner", "owner");
});

Deno.test("email normalization and secure token generation", () => {
  assertEquals(normalizeEmail(" Person@Example.COM "), "person@example.com");
  assertThrows(() => normalizeEmail("not-an-email"));
  const first = randomInvitationToken(); const second = randomInvitationToken();
  assertEquals(first.length, 64); assert(/^[0-9a-f]{64}$/.test(first)); assert(first !== second);
});

Deno.test("Auth Admin lookup distinguishes existing and invited-only users", async () => {
  const existing = { id: crypto.randomUUID(), email: "member@example.com", email_confirmed_at: new Date().toISOString() } as User;
  const invited = { id: crypto.randomUUID(), email: "new@example.com", invited_at: new Date().toISOString() } as User;
  assertEquals((await findAuthUserByEmail(fakeAdmin([existing]), "member@example.com"))?.id, existing.id);
  assert(isEstablishedAuthUser(existing)); assert(!isEstablishedAuthUser(invited));
  assertEquals(await findAuthUserByEmail(fakeAdmin([existing]), "missing@example.com"), null);
});

Deno.test("active, suspended and duplicate-member failures are safely mapped", () => {
  assertEquals(safeConnectionError(new Error("USER_ALREADY_MEMBER")).code, "USER_ALREADY_MEMBER");
  assertEquals(safeConnectionError(new Error("MEMBER_REACTIVATION_REQUIRED")).code, "MEMBER_REACTIVATION_REQUIRED");
  assertEquals(safeConnectionError(new Error("INVITATION_ALREADY_PENDING")).code, "INVITATION_ALREADY_PENDING");
});

Deno.test("email provider failure is redacted", () => {
  const safe = safeConnectionError(new Error("EMAIL_INVITATION_FAILED provider secret response"));
  assertEquals(safe.code, "EMAIL_INVITATION_FAILED");
  assertEquals(safe.message, "EMAIL_INVITATION_FAILED");
});

Deno.test("resend window rejects rapid requests", () => {
  assertThrows(() => assertResendWindow(new Date().toISOString()), Error, "INVITATION_RATE_LIMITED");
  assertResendWindow(new Date(Date.now() - 61_000).toISOString());
});

Deno.test("redirect configuration is origin-bound and CORS rejects attackers", () => {
  Deno.env.set("POSTFLOW_APP_URL", "https://app.example.test");
  Deno.env.set("ALLOWED_APP_ORIGINS", "https://app.example.test");
  const redirect = invitationRedirect("8eb9144d-5bf7-4fb7-a17f-7cc2867e6a21", "raw-token");
  assert(redirect.startsWith("https://app.example.test/accept-invite?"));
  assertThrows(() => assertAllowedOrigin(new Request("https://function.example.test", { headers: { Origin: "https://attacker.test" } })));
  Deno.env.set("POSTFLOW_APP_URL", "http://attacker.test");
  assertThrows(() => invitationRedirect("8eb9144d-5bf7-4fb7-a17f-7cc2867e6a21", "raw-token"), Error, "UNSAFE_INVITATION_REDIRECT");
});

Deno.test("safe response never includes raw tokens, hashes or Auth objects", () => {
  const result = safeInvitationResult({ id: "invitation", status: "pending", delivery: "email", token_hash: "secret", rawToken: "secret", user: { access_token: "secret" } });
  assertEquals(Object.keys(result).sort(), ["delivery", "email", "expiresAt", "id", "resendCount", "role", "status", "workspaceId"].sort());
  assert(!JSON.stringify(result).includes("secret"));
});
