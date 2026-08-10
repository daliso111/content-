import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decryptToken, encryptToken } from "../_shared/token-crypto.ts";

Deno.test("AES-GCM encrypts, decrypts and uses a fresh IV", async () => {
  Deno.env.set("SOCIAL_TOKEN_ENCRYPTION_KEY", btoa("0123456789abcdef0123456789abcdef"));
  const first = await encryptToken("provider-token");
  const second = await encryptToken("provider-token");
  assertEquals(await decryptToken(first.ciphertext, first.iv), "provider-token");
  assertEquals(first.ciphertext.startsWith("v1."), true);
  assertEquals(first.iv === second.iv, false);
});

Deno.test("AES-GCM rejects tampered ciphertext", async () => {
  Deno.env.set("SOCIAL_TOKEN_ENCRYPTION_KEY", btoa("0123456789abcdef0123456789abcdef"));
  const encrypted = await encryptToken("provider-token");
  await assertRejects(() => decryptToken(`${encrypted.ciphertext}x`, encrypted.iv));
});
