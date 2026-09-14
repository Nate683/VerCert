import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// AES-256-GCM encryption for TOTP secrets at rest, so a leaked database dump
// alone can't mint codes — the key lives only in TOTP_ENCRYPTION_KEY. The
// user id is bound in as associated data: a ciphertext copied onto another
// account's row fails to decrypt rather than quietly working there.
//
// Stored as `v1:<iv>:<tag>:<ciphertext>` (base64 parts). The version prefix
// leaves room to rotate the key later without guessing at old rows.
const FORMAT_VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

// Unlike SESSION_SECRET there's no fallback key, not even in development: a
// local server pointed at the production database would encrypt secrets
// under a stand-in key that production can't read, locking that executive out.
function getKey(): Buffer {
  const configured = process.env.TOTP_ENCRYPTION_KEY?.trim();
  if (!configured) {
    throw new Error("TOTP_ENCRYPTION_KEY is not set — two-factor secrets can't be encrypted.");
  }
  const key = Buffer.from(configured, "base64");
  if (key.length !== 32) {
    throw new Error("TOTP_ENCRYPTION_KEY must be 32 random bytes, base64-encoded.");
  }
  return key;
}

export function encryptTotpSecret(secret: Buffer, userId: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(userId, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
  return [
    FORMAT_VERSION,
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptTotpSecret(stored: string, userId: string): Buffer {
  const [version, iv, tag, ciphertext] = stored.split(":");
  if (version !== FORMAT_VERSION || !iv || !tag || !ciphertext) {
    throw new Error("Unrecognized two-factor secret format.");
  }
  const key = getKey();
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"), {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(Buffer.from(userId, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]);
  } catch (err) {
    throw new Error("Could not decrypt a two-factor secret — has TOTP_ENCRYPTION_KEY changed?", {
      cause: err,
    });
  }
}
