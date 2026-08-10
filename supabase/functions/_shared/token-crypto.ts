import { ConnectionError } from "./connection-errors.ts";

const VERSION = "v1";

function fromBase64(value: string): Uint8Array {
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    throw new Error("INVALID_BASE64");
  }
}

function toBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function ownedBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

async function encryptionKey(): Promise<CryptoKey> {
  try {
    const encoded = Deno.env.get("SOCIAL_TOKEN_ENCRYPTION_KEY")?.trim();
    if (!encoded) throw new Error();
    const bytes = fromBase64(encoded);
    if (bytes.byteLength !== 32) throw new Error();
    return await crypto.subtle.importKey(
      "raw",
      ownedBuffer(bytes),
      "AES-GCM",
      false,
      ["encrypt", "decrypt"],
    );
  } catch {
    throw new ConnectionError("TOKEN_ENCRYPTION_FAILED", 500);
  }
}

export interface EncryptedToken {
  ciphertext: string;
  iv: string;
}

export async function encryptToken(plaintext: string): Promise<EncryptedToken> {
  if (!plaintext) throw new ConnectionError("INVALID_REQUEST", 400);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(plaintext),
  );
  return {
    ciphertext: `${VERSION}.${toBase64(new Uint8Array(encrypted))}`,
    iv: toBase64(iv),
  };
}

export async function decryptToken(
  ciphertext: string,
  encodedIv: string,
): Promise<string> {
  try {
    const [version, payload] = ciphertext.split(".", 2);
    if (version !== VERSION || !payload) throw new Error();
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ownedBuffer(fromBase64(encodedIv)) },
      await encryptionKey(),
      ownedBuffer(fromBase64(payload)),
    );
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    if (
      error instanceof ConnectionError &&
      error.code === "TOKEN_ENCRYPTION_FAILED"
    ) throw error;
    throw new ConnectionError("TOKEN_DECRYPTION_FAILED", 500);
  }
}
